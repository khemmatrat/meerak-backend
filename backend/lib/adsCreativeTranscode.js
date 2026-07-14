/**
 * FFmpeg transcode + poster generation for ad creatives.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

function runCmd(bin, args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    const t = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`${bin}_timeout`));
    }, timeoutMs);
    proc.stderr.on('data', (d) => {
      stderr += String(d);
    });
    proc.on('error', (e) => {
      clearTimeout(t);
      reject(e);
    });
    proc.on('close', (code) => {
      clearTimeout(t);
      if (code === 0) resolve(stderr);
      else reject(new Error(`${bin}_exit_${code}:${stderr.slice(-400)}`));
    });
  });
}

export function isFfmpegAvailable() {
  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', ['-version'], { stdio: 'ignore' });
    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0));
  });
}

async function downloadToFile(url, dest) {
  const res = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`download_failed_${res.status}`);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest));
}

/**
 * @param {Buffer|string} input Buffer or http URL
 * @param {{ uploadToS3: Function, originalName?: string, contentType?: string }} deps
 */
export async function transcodeAdVideoCreative(input, deps) {
  const { uploadToS3, originalName = 'creative.mp4' } = deps;
  if (!(await isFfmpegAvailable())) {
    return { skipped: true, reason: 'ffmpeg_unavailable' };
  }

  let tmp;
  try {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ads-creative-'));
  } catch (e) {
    if (e?.code === 'ENOSPC') return { skipped: true, reason: 'disk_full' };
    throw e;
  }

  const inputPath = path.join(tmp, 'input.bin');
  const outputPath = path.join(tmp, 'output.mp4');
  const posterPath = path.join(tmp, 'poster.jpg');

  try {
    if (Buffer.isBuffer(input)) {
      fs.writeFileSync(inputPath, input);
    } else if (typeof input === 'string' && input.startsWith('http')) {
      await downloadToFile(input, inputPath);
    } else {
      return { skipped: true, reason: 'invalid_input' };
    }

    await runCmd('ffmpeg', [
      '-y',
      '-i',
      inputPath,
      '-vf',
      "scale='min(1080,iw)':-2,format=yuv420p",
      '-c:v',
      'libx264',
      '-profile:v',
      'main',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      outputPath,
    ]);

    await runCmd('ffmpeg', [
      '-y',
      '-ss',
      '1',
      '-i',
      outputPath,
      '-frames:v',
      '1',
      '-q:v',
      '2',
      posterPath,
    ]);

    const playbackBuf = fs.readFileSync(outputPath);
    const posterBuf = fs.existsSync(posterPath) ? fs.readFileSync(posterPath) : null;
    const stamp = Date.now();
    const playback = await uploadToS3(playbackBuf, {
      folder: 'public/ads/videos',
      filename: `${stamp}-${originalName.replace(/\.[^.]+$/, '')}.mp4`,
      contentType: 'video/mp4',
    });
    let poster = null;
    if (posterBuf?.length) {
      poster = await uploadToS3(posterBuf, {
        folder: 'public/ads/images',
        filename: `${stamp}-poster.jpg`,
        contentType: 'image/jpeg',
      });
    }
    return {
      skipped: false,
      playbackUrl: playback.url,
      posterUrl: poster?.url || null,
      contentKind: 'TALENT_VIDEO',
    };
  } catch (e) {
    const code = e?.code || '';
    if (code === 'ENOSPC' || String(e?.message || '').includes('ENOSPC')) {
      return { skipped: true, reason: 'disk_full' };
    }
    throw e;
  } finally {
    try {
      if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

/**
 * Normalize image creative (copy-through if already web-safe).
 */
export async function normalizeAdImageCreative(buffer, deps) {
  const { uploadToS3, originalName = 'creative.jpg', contentType = 'image/jpeg' } = deps;
  const uploaded = await uploadToS3(buffer, {
    folder: 'public/ads/images',
    filename: `${Date.now()}-${originalName}`,
    contentType,
  });
  return {
    imageUrl: uploaded.url,
    thumbnailUrl: uploaded.url,
    contentKind: 'IMAGE',
  };
}
