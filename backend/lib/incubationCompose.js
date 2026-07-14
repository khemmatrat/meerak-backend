/**
 * Incubation clip overlay — ffmpeg compose (portrait + TikTok-style CTA end card)
 */
import { spawn } from 'child_process';
import { resolveOverlayCopy, SPONSOR_LINE } from './incubationHiringCopy.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { access } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CTA_TAIL_SEC = 3;
const MAX_MAIN_SEC = 12;
/** Bump when overlay pipeline changes — UI checks this matches */
export const INCUBATION_OVERLAY_VERSION = 4;

const LOGO_CANDIDATES = () => [
  process.env.AQOND_ENDCARD_LOGO,
  join(__dirname, '..', 'assets', 'aqond-logo-endcard.png'),
  join(__dirname, '..', 'assets', 'logo.png'),
].filter(Boolean);

const DRAWtext_FONT_CANDIDATES = () => {
  const windir = process.env.WINDIR || process.env.SystemRoot || 'C:\\Windows';
  const winFonts = join(windir, 'Fonts');
  return [
    process.env.FFMPEG_DRAWTEXT_FONT,
    process.env.FFMPEG_FONT_FILE,
    join(__dirname, '..', 'assets', 'fonts', 'NotoSansThai-Regular.ttf'),
    join(__dirname, '..', 'assets', 'fonts', 'DejaVuSans.ttf'),
    '/usr/share/fonts/noto/NotoSansThai-Regular.ttf',
    '/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf',
    '/usr/share/fonts/dejavu/DejaVuSans.ttf',
    join(winFonts, 'Tahoma.ttf'),
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
      /* next */
    }
  }
  return null;
}

async function resolveEndcardLogoPath() {
  for (const p of LOGO_CANDIDATES()) {
    try {
      await access(p);
      return p;
    } catch {
      /* next */
    }
  }
  return null;
}

function stageFontInWorkDir(fontPath, workDir) {
  const staged = path.join(workDir, 'overlay-font.ttf');
  fs.copyFileSync(fontPath, staged);
  return 'overlay-font.ttf';
}

function stageLogoInWorkDir(logoPath, workDir) {
  const staged = path.join(workDir, 'aqond-logo.png');
  fs.copyFileSync(logoPath, staged);
  return 'aqond-logo.png';
}

function escapeDrawtext(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
    .slice(0, 80);
}

function enGte(seconds) {
  return `gte(t\\,${seconds.toFixed(3)})`;
}

function runCmd(bin, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'], ...opts });
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (d) => {
      stdout += d.toString();
    });
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${bin} exited ${code}: ${stderr.slice(-1200)}`));
    });
  });
}

function runFfmpeg(args, opts) {
  return runCmd('ffmpeg', args, opts);
}

async function probeHasAudio(filePath) {
  try {
    const { stdout } = await runCmd('ffprobe', [
      '-v',
      'error',
      '-select_streams',
      'a',
      '-show_entries',
      'stream=codec_type',
      '-of',
      'csv=p=0',
      filePath,
    ]);
    return String(stdout).trim().includes('audio');
  } catch {
    return false;
  }
}

async function probeMediaDuration(filePath) {
  try {
    const { stdout } = await runCmd('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    const n = parseFloat(String(stdout).trim());
    if (Number.isFinite(n) && n > 0.2) return n;
  } catch {
    /* fallback */
  }
  return 5;
}

/**
 * TikTok-style end card — จอดำ + โลโก้ AQOND + CTA กลางจอ
 * Uses filter_complex when logo PNG available.
 */
function buildTikTokEndCardFilterComplex(fontName, params, ctaStart, hasLogo) {
  const gte = enGte(ctaStart);
  const { ctaText, sponsorText } = params;
  const brand = escapeDrawtext('AQOND');
  const hireLine = escapeDrawtext('กดจ้างงานที่ AQOND');
  const discountLine = escapeDrawtext('ลูกค้าใหม่ รับส่วนลด 20%');
  const followHint = escapeDrawtext('จ้างช่างมืออาชีพวันนี้');

  const lines = [
    `[0:v]scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:black[base]`,
    `[base]drawbox=x=0:y=0:w=iw:h=ih:color=0x000000@0.97:t=fill:enable='${gte}'[bg]`,
  ];

  let prev = 'bg';
  if (hasLogo) {
    lines.push(`[1:v]scale=260:260:force_original_aspect_ratio=decrease[lg]`);
    lines.push(`[${prev}][lg]overlay=(W-w)/2:H*0.14:enable='${gte}'[vlogo]`);
    prev = 'vlogo';
  }

  lines.push(
    `[${prev}]drawtext=fontfile=${fontName}:text='${brand}':x=(w-tw)/2:y=h*${hasLogo ? '0.36' : '0.28'}:fontsize=44:fontcolor=0xFACC15:borderw=2:bordercolor=0x000000@0.25:enable='${gte}'[v1]`,
    `[v1]drawtext=fontfile=${fontName}:text='${followHint}':x=(w-tw)/2:y=h*0.415:fontsize=16:fontcolor=white@0.55:enable='${gte}'[v2]`,
    `[v2]drawbox=x=iw*0.14:y=ih*0.455:w=iw*0.72:h=ih*0.001:color=0xFACC15@0.9:t=fill:enable='${gte}'[v3]`,
    `[v3]drawtext=fontfile=${fontName}:text='${ctaText}':x=(w-tw)/2:y=h*0.475:fontsize=30:fontcolor=white:borderw=2:bordercolor=0x000000@0.45:enable='${gte}'[v4]`,
    `[v4]drawbox=x=iw*0.1:y=ih*0.535:w=iw*0.8:h=ih*0.058:color=0xFACC15@1:t=fill:enable='${gte}'[v5]`,
    `[v5]drawtext=fontfile=${fontName}:text='${hireLine}':x=(w-tw)/2:y=h*0.548:fontsize=22:fontcolor=0x111827:enable='${gte}'[v6]`,
    `[v6]drawtext=fontfile=${fontName}:text='${discountLine}':x=(w-tw)/2:y=h*0.62:fontsize=18:fontcolor=0xFACC15:enable='${gte}'[v7]`,
    `[v7]drawtext=fontfile=${fontName}:text='${sponsorText}':x=(w-tw)/2:y=h*0.88:fontsize=13:fontcolor=white@0.45:enable='${gte}'[outv]`,
  );

  return lines.join(';');
}

export async function isFfmpegAvailable() {
  try {
    await runFfmpeg(['-version']);
    return true;
  } catch {
    return false;
  }
}

export async function composeIncubationOverlay(opts) {
  const { inputBuffer, template, cta, sponsor, weekNo, talentName } = opts;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqond-incub-'));
  const inPath = path.join(tmpDir, 'in.mp4');

  try {
    fs.writeFileSync(inPath, inputBuffer);

    const ffmpegOk = await isFfmpegAvailable();
    if (!ffmpegOk) {
      return { buffer: inputBuffer, skippedOverlay: true, reason: 'ffmpeg_unavailable' };
    }

    const fontPath = await resolveDrawtextFontPath();
    if (!fontPath) {
      return { buffer: inputBuffer, skippedOverlay: true, reason: 'no_font' };
    }

    const fontName = stageFontInWorkDir(fontPath, tmpDir);
    const logoSrc = await resolveEndcardLogoPath();
    const logoName = logoSrc ? stageLogoInWorkDir(logoSrc, tmpDir) : null;

    const ov = template?.overlay || {};
    const copy = resolveOverlayCopy({ cta_th: cta }, weekNo, { talentName });
    const params = {
      ctaText: escapeDrawtext(cta || copy.cta),
      sponsorText: escapeDrawtext(sponsor || copy.sponsor || SPONSOR_LINE),
      accentColor: ov.accentColor || '0x10b981',
    };

    let duration = await probeMediaDuration(inPath);
    duration = Math.min(duration, MAX_MAIN_SEC);
    const ctaStart = Math.max(0.5, duration - CTA_TAIL_SEC);

    const filterComplex = buildTikTokEndCardFilterComplex(
      fontName,
      params,
      ctaStart,
      !!logoName,
    );

    const hasAudio = await probeHasAudio(inPath);
    const ffmpegArgs = ['-y', '-i', 'in.mp4'];
    if (logoName) ffmpegArgs.push('-i', logoName);
    ffmpegArgs.push('-filter_complex', filterComplex, '-map', '[outv]');
    if (hasAudio) {
      ffmpegArgs.push('-map', '0:a?', '-c:a', 'aac', '-b:a', '128k');
    }
    ffmpegArgs.push(
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      'out.mp4',
    );

    await runFfmpeg(ffmpegArgs, { cwd: tmpDir });

    return {
      buffer: fs.readFileSync(path.join(tmpDir, 'out.mp4')),
      skippedOverlay: false,
      meta: {
        duration,
        ctaStart,
        ctaTailSec: CTA_TAIL_SEC,
        overlayMode: 'tiktok_endcard',
        overlayVersion: INCUBATION_OVERLAY_VERSION,
        hasLogo: !!logoName,
      },
    };
  } catch (e) {
    const msg = e?.message || String(e);
    console.error('[incubationCompose] overlay failed:', msg.slice(-500));
    if (/spawn ffmpeg ENOENT|ffmpeg.*not found/i.test(msg)) {
      return { buffer: inputBuffer, skippedOverlay: true, reason: 'ffmpeg_unavailable' };
    }
    return { buffer: inputBuffer, skippedOverlay: true, reason: 'compose_error', error: msg.slice(-200) };
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

export const OVERLAY_TEMPLATES = [
  {
    id: 'pro_hire',
    nameTh: 'น่าจ้าง — โปร',
    preview: { bar: '#0f172a', text: '#f8fafc', accent: '#10b981' },
    overlay: { hiringLayout: true, accentColor: '0x10b981', hireBadge: true },
  },
  {
    id: 'pro_blue',
    nameTh: 'มืออาชีพ น้ำเงิน',
    preview: { bar: '#1e3a8a', text: '#ffffff', accent: '#38bdf8' },
    overlay: { hiringLayout: true, accentColor: '0x38bdf8' },
  },
  {
    id: 'violet_glow',
    nameTh: 'ไวโอเล็ต โกลว์',
    preview: { bar: '#4c1d95', text: '#ffffff', accent: '#a78bfa' },
    overlay: { hiringLayout: true, accentColor: '0xa78bfa' },
  },
  {
    id: 'minimal_white',
    nameTh: 'มินิมอล ขาว',
    preview: { bar: '#0f172a', text: '#f8fafc', accent: '#ffffff' },
    overlay: { hiringLayout: true, accentColor: '0xffffff' },
  },
  {
    id: 'hiring_cta',
    nameTh: 'จ้างงานทันที',
    preview: { bar: '#064e3b', text: '#ecfdf5', accent: '#34d399' },
    overlay: { hiringLayout: true, accentColor: '0x34d399', hireBadge: true },
  },
  {
    id: 'week_stamp',
    nameTh: 'แสตมป์สัปดาห์',
    preview: { bar: '#312e81', text: '#ffffff', accent: '#818cf8' },
    overlay: { hiringLayout: true, accentColor: '0x818cf8', topBadge: true },
  },
];

export function getOverlayTemplate(id) {
  return OVERLAY_TEMPLATES.find((t) => t.id === id) || OVERLAY_TEMPLATES[0];
}
