/**
 * Video Watermark Service — ติดลายน้ำ + ข้อความ AQOND + End Card ด้วย ffmpeg
 * ใช้ subprocess spawn (ไม่ใช้ fluent-ffmpeg เพื่อความยืดหยุ่น filter_complex)
 */
import { spawn } from 'child_process';
import { writeFile, unlink, readFile, mkdir, access } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PLATFORM_NAME = 'AQOND';
const END_CARD_SUBTITLE = 'แพลตฟอร์มบริการมืออาชีพ';
const END_CARD_DURATION_SEC = 2.5;

// #region agent log
function agentDebugLog(hypothesisId, message, data = {}) {
  const payload = {
    sessionId: '56622a',
    hypothesisId,
    location: 'videoWatermark.js',
    message,
    data,
    timestamp: Date.now(),
  };
  console.error('[debug-56622a]', JSON.stringify(payload));
  fetch('http://127.0.0.1:7638/ingest/0fd4d8e7-61a2-4558-83aa-540c669e45fd', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '56622a' },
    body: JSON.stringify(payload),
  }).catch(() => { });
}
// #endregion

/** ลำดับ fallback — Alpine Docker ต้อง apk add ttf-dejavu font-noto (ดู Dockerfile) */
const DRAWtext_FONT_CANDIDATES = () => {
  const windir = process.env.WINDIR || process.env.SystemRoot || 'C:\\Windows';
  const winFonts = join(windir, 'Fonts');
  return [
    process.env.FFMPEG_DRAWTEXT_FONT,
    process.env.FFMPEG_FONT_FILE,
    join(__dirname, '..', 'assets', 'fonts', 'NotoSansThai-Regular.ttf'),
    join(__dirname, '..', 'assets', 'fonts', 'DejaVuSans.ttf'),
    '/usr/share/fonts/noto/NotoSansThai-Regular.ttf',
    '/usr/share/fonts/noto/NotoSansThai/NotoSansThai-Regular.ttf',
    '/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf',
    '/usr/share/fonts/noto/NotoSans-Regular.ttf',
    '/usr/share/fonts/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    join(winFonts, 'Tahoma.ttf'),
    join(winFonts, 'tahoma.ttf'),
    join(winFonts, 'arial.ttf'),
    join(winFonts, 'LeelawUI.ttf'),
  ].filter(Boolean);
};

let _cachedFontPath = null;

async function resolveDrawtextFontPath() {
  if (_cachedFontPath) return _cachedFontPath;
  for (const p of DRAWtext_FONT_CANDIDATES()) {
    try {
      await access(p);
      _cachedFontPath = p;
      return p;
    } catch {
      /* try next */
    }
  }
  return null;
}

/** path สำหรับ filter_complex (escape : บน Windows drive) */
function ffmpegFontfileForFilter(fontPath) {
  const fp = fontPath.replace(/\\/g, '/');
  if (/^[a-zA-Z]:/.test(fp)) {
    return `${fp[0]}\\:${fp.slice(2)}`;
  }
  return fp.replace(/:/g, '\\:');
}

function escapeDrawtextLiteral(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:');
}

function drawtextFragment(fontEsc, text, opts) {
  const t = escapeDrawtextLiteral(text);
  const parts = [
    `fontfile='${fontEsc}'`,
    `text='${t}'`,
    `fontsize=${opts.fontsize}`,
    `fontcolor=${opts.fontcolor}`,
    `x=${opts.x}`,
    `y=${opts.y}`,
  ];
  return `drawtext=${parts.join(':')}`;
}

export async function processVideoWithWatermark(inputBuffer, options = {}) {
  const uuid = randomUUID();
  const ext = '.mp4';
  const tmpDir = join(tmpdir(), 'aqond-video');
  await mkdir(tmpDir, { recursive: true });

  const inputPath = join(tmpDir, `input_${uuid}${ext}`);
  const outputPath = join(tmpDir, `output_${uuid}${ext}`);

  const fontPath = await resolveDrawtextFontPath();
  const hasLogo = await ensureLogoExists();
  // #region agent log
  agentDebugLog('H1', 'processVideoWithWatermark start', {
    fontPath: fontPath || null,
    hasLogo,
    inputBytes: inputBuffer?.length ?? 0,
  });
  // #endregion

  if (!fontPath) {
    const err = new Error(
      'ไม่พบฟอนต์สำหรับ ffmpeg drawtext — ตั้ง FFMPEG_DRAWTEXT_FONT หรือติดตั้ง ttf-dejavu/font-noto ใน Docker (apk add)',
    );
    agentDebugLog('H1', 'no font resolved', { candidates: DRAWtext_FONT_CANDIDATES().length });
    throw err;
  }

  try {
    await writeFile(inputPath, inputBuffer);

    const logoPath = hasLogo ? join(__dirname, '..', 'assets', 'logo.png') : null;
    const args = buildFfmpegArgs(inputPath, outputPath, logoPath, fontPath);
    // #region agent log
    agentDebugLog('H2', 'ffmpeg args built', {
      hasLogo: !!logoPath,
      filterHasFontfile: args.some((a) => typeof a === 'string' && a.includes('fontfile=')),
    });
    // #endregion

    await runFfmpeg(args);

    const outputBuffer = await readFile(outputPath);
    agentDebugLog('H4', 'ffmpeg success', { outputBytes: outputBuffer.length });
    return outputBuffer;
  } finally {
    await safeUnlink(inputPath);
    await safeUnlink(outputPath);
  }
}

function buildFfmpegArgs(inputPath, outputPath, logoPath, fontPath) {
  const ffFont = ffmpegFontfileForFilter(fontPath);
  const wmText = drawtextFragment(ffFont, PLATFORM_NAME, {
    fontsize: 28,
    fontcolor: 'white@0.9',
    x: 'w-140',
    y: '25',
  });
  const ecTitle = drawtextFragment(ffFont, PLATFORM_NAME, {
    fontsize: 64,
    fontcolor: 'white',
    x: '(w-text_w)/2',
    y: '(h-text_h)/2-30',
  });
  const ecSub = drawtextFragment(ffFont, END_CARD_SUBTITLE, {
    fontsize: 20,
    fontcolor: 'white@0.8',
    x: '(w-text_w)/2',
    y: '(h-text_h)/2+30',
  });

  let mainFilter;
  if (logoPath) {
    mainFilter = `[0:v]split[main][ref];[main][1:v]overlay=W-w-20:20,${wmText}[main2]`;
  } else {
    mainFilter = `[0:v]split[main][ref];[main]${wmText}[main2]`;
  }

  const endCardFilter =
    `color=c=0x1e3a8a:s=720x1280:d=${END_CARD_DURATION_SEC},` +
    `${ecTitle},${ecSub}[ec];[ec][ref]scale2ref[ecs][ref2];[ref2]null;[main2][ecs]concat=n=2:v=1:a=0[outv]`;

  const fullFilter = `${mainFilter};${endCardFilter}`;

  return [
    '-y',
    '-i',
    inputPath,
    ...(logoPath ? ['-i', logoPath] : []),
    '-filter_complex',
    fullFilter,
    '-map',
    '[outv]',
    '-map',
    '0:a?',
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-crf',
    '23',
    '-c:a',
    'aac',
    outputPath,
  ];
}

async function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const tail = stderr.slice(-800);
      const isSansFont =
        /Cannot find a valid font|font family Sans|Error initializing filters/i.test(tail);
      // #region agent log
      agentDebugLog('H1', 'ffmpeg failed', {
        code,
        isSansFont,
        stderrTail: tail.slice(-400),
      });
      // #endregion
      reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
    });
    proc.on('error', (err) => reject(err));
  });
}

async function ensureLogoExists() {
  try {
    const logoPath = join(__dirname, '..', 'assets', 'logo.png');
    await readFile(logoPath);
    return true;
  } catch {
    return false;
  }
}

async function safeUnlink(p) {
  try {
    await unlink(p);
  } catch (_) { }
}
