import fs from 'fs/promises';
import path from 'path';
import { spawnSync } from 'child_process';
import { isImageGenEnabled } from './config.js';

async function downloadImage(url, dest) {
  try {
    if (url.startsWith('data:')) {
      const b64 = url.split(',')[1];
      if (!b64) return false;
      await fs.writeFile(dest, Buffer.from(b64, 'base64'));
      return true;
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return false;
    await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()));
    return true;
  } catch {
    return false;
  }
}

function ffmpegOk() {
  return spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
}

/**
 * Sprint 3 — per-shot keyframe generation.
 * When AIVOS_MERCHANT_AD_IMAGE_GEN=1: distinct frame per shot (zoom/crop variant via ffmpeg).
 * Future: wire OpenAI/xAI image API without changing module boundary.
 */
export async function generateShotImages(job, outDir) {
  const refPath = path.join(outDir, 'reference.jpg');
  if (job.product_image_url) {
    await downloadImage(job.product_image_url, refPath);
  }

  const shots = job.brief?.shots || [];
  const imagePaths = [];

  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];
    const shotPath = path.join(outDir, `shot_${String(shot.shot).padStart(2, '0')}.jpg`);
    let ok = false;
    try {
      await fs.access(refPath);
      if (isImageGenEnabled() && ffmpegOk()) {
        const zoom = 1 + (i % 5) * 0.04;
        const crop = ['iw/2-540', 'ih/2-960', '1080', '1920'][i % 4];
        const vf = `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,scale=iw*${zoom}:ih*${zoom},crop=1080:1920`;
        const run = spawnSync('ffmpeg', ['-y', '-i', refPath, '-vf', vf, '-frames:v', '1', shotPath], {
          stdio: 'ignore',
        });
        ok = run.status === 0;
      }
      if (!ok) await fs.copyFile(refPath, shotPath);
    } catch {
      await fs.writeFile(shotPath, Buffer.alloc(0));
    }
    shot.image_path = shotPath;
    shot.image_url = path.basename(shotPath);
    imagePaths.push(shotPath);
    job.progress_pct = Math.min(85, 10 + Math.round(((i + 1) / shots.length) * 70));
  }

  job.shots = shots;
  return imagePaths;
}
