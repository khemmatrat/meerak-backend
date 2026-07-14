import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const FILE = path.join(process.cwd(), '.data', 'dev', 'merchant-ad-videos.json');
const OUT_DIR = path.join(process.cwd(), '.data', 'dev', 'merchant-ad-output');

export const WEEKLY_CLIP_LIMIT = 3;

export type AdShot = {
  shot: number;
  role: string;
  image_prompt: string;
  video_prompt: string;
  duration_sec: number;
  image_path?: string;
};

export type AdVideoBrief = {
  title: string;
  tagline_th: string;
  shots: AdShot[];
  source?: string;
};

export type AdVideoJob = {
  id: string;
  merchant_id: string;
  owner_id: string;
  shop_type: 'marketplace' | 'food';
  product_id?: string;
  product_title: string;
  product_image_url?: string;
  brief: AdVideoBrief;
  guide: Record<string, string>;
  status: 'draft' | 'brief_ready' | 'generating' | 'completed' | 'failed' | 'published';
  progress_pct: number;
  output_video_url?: string;
  output_poster_url?: string;
  error?: string;
  published_at?: string;
  publish?: {
    target?: string;
    post_id?: string;
    media_id?: string;
    playback_url?: string;
    synced_feed?: boolean;
    mode?: string;
    published_at?: string;
  };
  week_key: string;
  created_at: string;
  completed_at?: string;
};

type Store = { jobs: AdVideoJob[] };

function weekKey(d = new Date()) {
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((d.getTime() - jan1.getTime()) / 86400000);
  const week = Math.ceil((days + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

async function readStore(): Promise<Store> {
  try {
    const raw = JSON.parse(await fs.readFile(FILE, 'utf8')) as Store;
    return { jobs: raw.jobs || [] };
  } catch {
    return { jobs: [] };
  }
}

async function writeStore(store: Store) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(store, null, 2), 'utf8');
}

export async function getAdVideoQuota(merchantId: string) {
  const store = await readStore();
  const wk = weekKey();
  const used = store.jobs.filter(
    (j) => j.merchant_id === merchantId && j.week_key === wk && j.status !== 'failed' && j.status !== 'draft',
  ).length;
  return {
    week_key: wk,
    limit: WEEKLY_CLIP_LIMIT,
    used,
    remaining: Math.max(0, WEEKLY_CLIP_LIMIT - used),
  };
}

export async function listAdVideoJobs(merchantId: string): Promise<AdVideoJob[]> {
  await reconcileStaleAdVideoJobs();
  const store = await readStore();
  return store.jobs
    .filter((j) => j.merchant_id === merchantId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getAdVideoJob(jobId: string): Promise<AdVideoJob | null> {
  await reconcileStaleAdVideoJobs();
  const store = await readStore();
  return store.jobs.find((j) => j.id === jobId) || null;
}

/** ยกเลิก job ที่ค้าง generating นานเกินไป (ffmpeg ค้าง / process ตาย) */
export async function reconcileStaleAdVideoJobs(maxAgeMs = 5 * 60 * 1000) {
  const store = await readStore();
  const now = Date.now();
  let changed = false;
  for (const job of store.jobs) {
    if (job.status !== 'generating') continue;
    const age = now - Date.parse(job.created_at);
    if (age < maxAgeMs) continue;
    job.status = 'failed';
    job.error = 'generation_timeout';
    changed = true;
  }
  if (changed) await writeStore(store);
}

export async function saveAdVideoJob(job: AdVideoJob): Promise<AdVideoJob> {
  const store = await readStore();
  const idx = store.jobs.findIndex((j) => j.id === job.id);
  if (idx >= 0) store.jobs[idx] = job;
  else store.jobs.unshift(job);
  await writeStore(store);
  return job;
}

export function createAdVideoJob(input: {
  merchant_id: string;
  owner_id: string;
  shop_type: 'marketplace' | 'food';
  product_id?: string;
  product_title: string;
  product_image_url?: string;
  brief: AdVideoBrief;
  guide: Record<string, string>;
}): AdVideoJob {
  return {
    id: `adv-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
    merchant_id: input.merchant_id,
    owner_id: input.owner_id,
    shop_type: input.shop_type,
    product_id: input.product_id,
    product_title: input.product_title,
    product_image_url: input.product_image_url,
    brief: input.brief,
    guide: input.guide,
    status: 'brief_ready',
    progress_pct: 0,
    week_key: weekKey(),
    created_at: new Date().toISOString(),
  };
}

export async function outputDirForJob(jobId: string) {
  const dir = path.join(OUT_DIR, jobId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export function publicOutputUrl(jobId: string, filename: string) {
  return `/api/merchant/ad-video/files/${jobId}/${filename}`;
}
