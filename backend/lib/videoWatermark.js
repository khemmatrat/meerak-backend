/**
 * Video Watermark Service — ติดลายน้ำ + ข้อความ AQOND + End Card ด้วย ffmpeg
 * ใช้ subprocess spawn (ไม่ใช้ fluent-ffmpeg เพื่อความยืดหยุ่น filter_complex)
 */
import { spawn } from 'child_process';
import { writeFile, unlink, readFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PLATFORM_NAME = 'AQOND';
const END_CARD_DURATION_SEC = 2.5;

export async function processVideoWithWatermark(inputBuffer, options = {}) {
  const uuid = randomUUID();
  const ext = '.mp4';
  const tmpDir = join(tmpdir(), 'aqond-video');
  await mkdir(tmpDir, { recursive: true });

  const inputPath = join(tmpDir, `input_${uuid}${ext}`);
  const outputPath = join(tmpDir, `output_${uuid}${ext}`);

  try {
    await writeFile(inputPath, inputBuffer);

    const hasLogo = await ensureLogoExists();
    const logoPath = hasLogo ? join(__dirname, '..', 'assets', 'logo.png') : null;

    const args = buildFfmpegArgs(inputPath, outputPath, logoPath);

    await runFfmpeg(args);

    const outputBuffer = await readFile(outputPath);
    return outputBuffer;
  } finally {
    await safeUnlink(inputPath);
    await safeUnlink(outputPath);
  }
}

function buildFfmpegArgs(inputPath, outputPath, logoPath) {
  // Filter: 1) split main video 2) watermark + text on main 3) end card 4) scale2ref 5) concat
  // [0:v]split[main][ref] — ref ใช้เป็น reference สำหรับ scale2ref
  let mainFilter;
  if (logoPath) {
    mainFilter = `[0:v]split[main][ref];[main][1:v]overlay=W-w-20:20,drawtext=text='${PLATFORM_NAME}':fontsize=28:fontcolor=white@0.9:x=w-140:y=25[main2]`;
  } else {
    mainFilter = `[0:v]split[main][ref];[main]drawtext=text='${PLATFORM_NAME}':fontsize=28:fontcolor=white@0.9:x=w-140:y=25[main2]`;
  }

  // End card: scale2ref ให้ ec ตรงกับ ref (original video dimensions)
  const endCardFilter = `color=c=0x1e3a8a:s=720x1280:d=${END_CARD_DURATION_SEC},drawtext=text='${PLATFORM_NAME}':fontsize=64:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-30,drawtext=text='แพลตฟอร์มบริการมืออาชีพ':fontsize=20:fontcolor=white@0.8:x=(w-text_w)/2:y=(h-text_h)/2+30[ec];[ec][ref]scale2ref[ecs][ref];[main2][ecs]concat=n=2:v=1:a=0[outv]`;

  const fullFilter = `${mainFilter};${endCardFilter}`;

  const args = [
    '-y',
    '-i', inputPath,
    ...(logoPath ? ['-i', logoPath] : []),
    '-filter_complex', fullFilter,
    '-map', '[outv]',
    '-map', '0:a?',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-c:a', 'aac',
    outputPath,
  ];

  return args;
}

async function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
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
  } catch (_) {}
}
