import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { weeklyClipLimit } from './config.js';

const DATA_DIR = path.join(process.cwd(), '.data', 'aivos', 'merchant-ad');
const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');
const OUT_DIR = path.join(DATA_DIR, 'output');

export { OUT_DIR };

function weekKey(d = new Date()) {
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((d.getTime() - jan1.getTime()) / 86400000);
  const week = Math.ceil((days + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

async function readJobs() {
  try {
    const raw = JSON.parse(await fs.readFile(JOBS_FILE, 'utf8'));
    return raw.jobs || [];
  } catch {
    return [];
  }
}

async function writeJobs(jobs) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(JOBS_FILE, JSON.stringify({ jobs }, null, 2), 'utf8');
}

export async function getQuota(merchantId) {
  const wk = weekKey();
  const jobs = await readJobs();
  const used = jobs.filter(
    (j) =>
      j.merchant_id === merchantId &&
      j.week_key === wk &&
      j.status !== 'failed' &&
      j.status !== 'draft',
  ).length;
  const limit = weeklyClipLimit();
  return { week_key: wk, limit, used, remaining: Math.max(0, limit - used) };
}

export async function listJobs(merchantId) {
  const jobs = await readJobs();
  return jobs
    .filter((j) => j.merchant_id === merchantId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getJob(jobId) {
  const jobs = await readJobs();
  return jobs.find((j) => j.id === jobId) || null;
}

export async function saveJob(job) {
  const jobs = await readJobs();
  const idx = jobs.findIndex((j) => j.id === job.id);
  if (idx >= 0) jobs[idx] = job;
  else jobs.unshift(job);
  await writeJobs(jobs);
  return job;
}

export function createJob(input) {
  return {
    id: `mad-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
    merchant_id: input.merchant_id,
    owner_id: input.owner_id,
    shop_type: input.shop_type,
    product_id: input.product_id,
    product_title: input.product_title,
    product_image_url: input.product_image_url,
    brief: input.brief,
    guide: input.guide || {},
    status: 'brief_ready',
    progress_pct: 0,
    week_key: weekKey(),
    created_at: new Date().toISOString(),
    shots: [],
  };
}

export async function jobOutputDir(jobId) {
  const dir = path.join(OUT_DIR, jobId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export function publicFilePath(jobId, filename) {
  return `/api/aivos/merchant-ad/files/${jobId}/${filename}`;
}
