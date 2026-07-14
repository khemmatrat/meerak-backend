import fs from 'fs/promises';
import path from 'path';
import { spawnSync } from 'child_process';
import { aiCoreApi } from '@/lib/server-env';
import {
  getAdVideoJob,
  outputDirForJob,
  publicOutputUrl,
  saveAdVideoJob,
  type AdVideoBrief,
  type AdVideoJob,
} from '@/lib/server/merchantAdVideoStore';

const CLIP_DURATION_SEC = 10;
const FFMPEG_TIMEOUT_MS = 120_000;

function ruleBasedBrief(ctx: Record<string, string>): AdVideoBrief {
  const title = ctx.product_title || 'สินค้า';
  const mood = ctx.mood || 'premium';
  const roles = ['hero', 'macro_cap', 'lifestyle', 'finale'];
  const shots = roles.map((role, i) => ({
    shot: i + 1,
    role,
    image_prompt: `${title}, ${mood} TVC still, shot ${i + 1}, 9:16, cinematic studio`,
    video_prompt: `Cinematic motion, ${role}, 2.5s`,
    duration_sec: 2.5,
  }));
  return { title, tagline_th: 'คุณภาพที่คุณไว้ใจ', shots, source: 'rules' };
}

export async function fetchAdBriefFromAiCore(ctx: Record<string, string>): Promise<AdVideoBrief> {
  const key = process.env.AI_CORE_API_KEY || '';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) headers['X-AI-Core-Api-Key'] = key;
  try {
    const res = await fetch(aiCoreApi('/v1/merchant/ad-brief'), {
      method: 'POST',
      headers,
      body: JSON.stringify(ctx),
      signal: AbortSignal.timeout(60000),
    });
    const data = await res.json();
    if (data?.brief?.shots?.length) return data.brief as AdVideoBrief;
  } catch {
    /* fallback */
  }
  return ruleBasedBrief(ctx);
}

function resolveLocalImagePath(url: string): string | null {
  const uploadMatch = url.match(/^\/api\/merchant\/ad-video\/uploads\/([^/]+)\/([^/?#]+)/);
  if (uploadMatch) {
    return path.join(process.cwd(), '.data', 'dev', 'merchant-ad-uploads', uploadMatch[1], uploadMatch[2]);
  }
  if (url.startsWith('/')) {
    return path.join(process.cwd(), 'public', url.replace(/^\//, ''));
  }
  return null;
}

async function downloadImage(url: string, dest: string): Promise<boolean> {
  try {
    const local = resolveLocalImagePath(url);
    if (local) {
      await fs.copyFile(local, dest);
      return true;
    }
    if (url.startsWith('/')) {
      const base = process.env.STOREFRONT_INTERNAL_URL || 'http://127.0.0.1:3003';
      const res = await fetch(`${base}${url}`, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) return false;
      await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()));
      return true;
    }
    if (url.startsWith('data:')) {
      const b64 = url.split(',')[1];
      if (!b64) return false;
      await fs.writeFile(dest, Buffer.from(b64, 'base64'));
      return true;
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
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

function runFfmpeg(args: string[], timeoutMs: number) {
  const result = spawnSync('ffmpeg', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: timeoutMs,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    console.error('[merchant-ad ffmpeg]', result.stderr?.slice(-400) || 'unknown error');
  }
  return result;
}

/** คลิปเดียว 720p ultrafast — เร็วกว่า concat 4 ช็อตบน Windows */
async function renderSingleClip(imagePath: string, outPath: string, durationSec = CLIP_DURATION_SEC) {
  if (!ffmpegOk()) {
    await fs.copyFile(imagePath, outPath.replace(/\.mp4$/, '.jpg'));
    throw new Error('ffmpeg_unavailable');
  }

  const vf =
    'scale=720:1280:force_original_aspect_ratio=decrease,' +
    'pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=black';

  const run = runFfmpeg(
    [
      '-y',
      '-loop',
      '1',
      '-i',
      imagePath,
      '-vf',
      vf,
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-tune',
      'stillimage',
      '-t',
      String(durationSec),
      '-r',
      '24',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      outPath,
    ],
    FFMPEG_TIMEOUT_MS,
  );

  if (run.status !== 0) throw new Error('ffmpeg_render_failed');
}

export async function runAdVideoGeneration(jobId: string): Promise<AdVideoJob> {
  let job = await getAdVideoJob(jobId);
  if (!job) throw new Error('job_not_found');

  job.status = 'generating';
  job.progress_pct = 8;
  (job as AdVideoJob & { estimated_sec?: number }).estimated_sec = 45;
  await saveAdVideoJob(job);

  const outDir = await outputDirForJob(jobId);
  const refPath = path.join(outDir, 'reference.jpg');
  const posterPath = path.join(outDir, 'shot_01.jpg');

  if (job.product_image_url) {
    const ok = await downloadImage(job.product_image_url, refPath);
    if (!ok) {
      job.status = 'failed';
      job.error = 'image_download_failed';
      await saveAdVideoJob(job);
      return job;
    }
    const stat = await fs.stat(refPath);
    if (stat.size < 1024) {
      job.status = 'failed';
      job.error = 'image_too_small_reupload';
      await saveAdVideoJob(job);
      return job;
    }
  } else {
    job.status = 'failed';
    job.error = 'no_product_image';
    await saveAdVideoJob(job);
    return job;
  }

  await fs.copyFile(refPath, posterPath).catch(() => {});

  job.progress_pct = 25;
  (job as AdVideoJob & { current_shot?: number }).current_shot = 1;
  await saveAdVideoJob(job);

  const videoPath = path.join(outDir, 'output.mp4');
  try {
    job.progress_pct = 40;
    await saveAdVideoJob(job);

    await renderSingleClip(refPath, videoPath, CLIP_DURATION_SEC);

    job.output_video_url = publicOutputUrl(jobId, 'output.mp4');
    job.output_poster_url = publicOutputUrl(jobId, 'shot_01.jpg');
    job.status = 'completed';
    job.progress_pct = 100;
    job.video_engine = 'kenburns-fast';
    job.completed_at = new Date().toISOString();
    delete (job as AdVideoJob & { current_shot?: number }).current_shot;
  } catch (e) {
    job.status = 'failed';
    job.error = e instanceof Error ? e.message : 'render_failed';
  }

  await saveAdVideoJob(job);
  return job;
}
