/**
 * Phase 2b — AQOND Pro AI Video jobs.
 * Providers: demo (always) | replicate (when REPLICATE_API_TOKEN set).
 *
 * Env:
 *   AQOND_PRO_VIDEO_PROVIDER=auto|demo|replicate  (default auto)
 *   REPLICATE_API_TOKEN=...
 *   AQOND_PRO_VIDEO_REPLICATE_MODEL=minimax/video-01  (optional)
 *   AQOND_PRO_VIDEO_DEMO_URL=https://...mp4
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../.data');
const JOBS_FILE = path.join(DATA_DIR, 'pro-video-jobs.json');

const DEMO_VIDEO_URL =
  process.env.AQOND_PRO_VIDEO_DEMO_URL ||
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';

const REPLICATE_MODEL =
  process.env.AQOND_PRO_VIDEO_REPLICATE_MODEL || 'minimax/video-01';

/** @typedef {'queued'|'rendering'|'ready'|'failed'} ProVideoStatus */

/**
 * @typedef {object} ProVideoJob
 * @property {string} id
 * @property {string} productName
 * @property {string} [sku]
 * @property {string} [prompt]
 * @property {ProVideoStatus} status
 * @property {string} provider
 * @property {string} [remoteId]
 * @property {string} [videoUrl]
 * @property {string} [posterUrl]
 * @property {string} note
 * @property {string} [error]
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/** @type {Map<string, ProVideoJob>} */
const memory = new Map();

function ensureDataDir() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {
    /* ignore */
  }
}

function loadJobsFromDisk() {
  try {
    if (!fs.existsSync(JOBS_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
    if (!Array.isArray(raw)) return;
    for (const j of raw.slice(0, 80)) {
      if (j?.id) memory.set(j.id, j);
    }
  } catch (e) {
    console.warn('[osProVideo] load jobs:', e?.message || e);
  }
}

function persistJobs() {
  try {
    ensureDataDir();
    const list = [...memory.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 80);
    fs.writeFileSync(JOBS_FILE, JSON.stringify(list, null, 0), 'utf8');
  } catch (e) {
    console.warn('[osProVideo] persist jobs:', e?.message || e);
  }
}

loadJobsFromDisk();

function hasReplicateToken() {
  return Boolean(String(process.env.REPLICATE_API_TOKEN || '').trim());
}

export function resolveProVideoProvider() {
  const forced = String(process.env.AQOND_PRO_VIDEO_PROVIDER || 'auto')
    .trim()
    .toLowerCase();
  if (forced === 'demo') return 'demo';
  if (forced === 'replicate') return hasReplicateToken() ? 'replicate' : 'demo';
  // auto
  return hasReplicateToken() ? 'replicate' : 'demo';
}

function uid() {
  return `pvid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildPrompt(productName, extra = '') {
  const name = String(productName || 'product').trim();
  const hint = String(extra || '').trim();
  return [
    `Short vertical ecommerce product showcase video of ${name}.`,
    'Clean studio lighting, soft camera push-in, marketplace-ready look.',
    hint ? `Details: ${hint}` : '',
    'No text overlays, no watermarks, no logos invented.',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * @returns {ProVideoJob}
 */
function saveJob(job) {
  job.updatedAt = Date.now();
  memory.set(job.id, job);
  persistJobs();
  return job;
}

export function getProVideoJob(id) {
  return memory.get(String(id || '')) || null;
}

export function listProVideoJobs(limit = 20) {
  return [...memory.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

async function createReplicatePrediction(prompt) {
  const token = String(process.env.REPLICATE_API_TOKEN || '').trim();
  const modelPath = String(REPLICATE_MODEL || 'minimax/video-01').replace(
    /^\/+|\/+$/g,
    '',
  );
  // Prefer official model predictions API (no version pin required).
  const res = await fetch(
    `https://api.replicate.com/v1/models/${modelPath}/predictions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Token ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'respond-async',
      },
      body: JSON.stringify({
        input: {
          prompt,
          prompt_optimizer: true,
        },
      }),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(
      data?.detail || data?.error || `replicate_http_${res.status}`,
    );
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}

async function pollReplicatePrediction(remoteId) {
  const token = String(process.env.REPLICATE_API_TOKEN || '').trim();
  const res = await fetch(
    `https://api.replicate.com/v1/predictions/${encodeURIComponent(remoteId)}`,
    {
      headers: { Authorization: `Token ${token}` },
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.detail || `replicate_poll_${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function extractVideoUrl(output) {
  if (!output) return null;
  if (typeof output === 'string' && /\.(mp4|webm|mov)(\?|$)/i.test(output)) {
    return output;
  }
  if (typeof output === 'string' && /^https?:\/\//i.test(output)) return output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const u = extractVideoUrl(item);
      if (u) return u;
    }
  }
  if (typeof output === 'object') {
    for (const key of ['video', 'url', 'mp4', 'output']) {
      if (output[key]) {
        const u = extractVideoUrl(output[key]);
        if (u) return u;
      }
    }
  }
  return null;
}

function scheduleDemoProgress(jobId) {
  setTimeout(() => {
    const job = memory.get(jobId);
    if (!job || job.status === 'ready' || job.status === 'failed') return;
    job.status = 'rendering';
    job.note = 'Demo provider rendering…';
    saveJob(job);
  }, 700);

  setTimeout(() => {
    const job = memory.get(jobId);
    if (!job || job.status === 'ready' || job.status === 'failed') return;
    job.status = 'ready';
    job.videoUrl = DEMO_VIDEO_URL;
    job.note = 'Demo clip ready — attach to a catalog product';
    saveJob(job);
  }, 2200);
}

/**
 * Create a Pro video job and kick off provider work.
 * @returns {Promise<ProVideoJob>}
 */
export async function createProVideoJob({
  productName = '',
  sku = '',
  prompt = '',
  tier = 'business',
} = {}) {
  const name = String(productName || '').trim() || 'Product';
  const provider = resolveProVideoProvider();
  const fullPrompt = buildPrompt(name, prompt);

  /** @type {ProVideoJob} */
  const job = {
    id: uid(),
    productName: name,
    sku: String(sku || '').trim() || undefined,
    prompt: fullPrompt,
    status: 'queued',
    provider,
    note:
      provider === 'replicate'
        ? 'Queued on Replicate'
        : 'Queued on demo provider (set REPLICATE_API_TOKEN for live gen)',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tier: String(tier || 'business'),
  };

  saveJob(job);

  if (provider === 'replicate') {
    try {
      const pred = await createReplicatePrediction(fullPrompt);
      job.remoteId = pred.id;
      job.status =
        pred.status === 'succeeded'
          ? 'ready'
          : pred.status === 'failed'
            ? 'failed'
            : 'rendering';
      job.note = `Replicate ${pred.status || 'starting'}`;
      if (pred.output) {
        const url = extractVideoUrl(pred.output);
        if (url) {
          job.videoUrl = url;
          job.status = 'ready';
          job.note = 'Replicate clip ready';
        }
      }
      if (pred.error) {
        job.status = 'failed';
        job.error = String(pred.error);
        job.note = 'Replicate failed';
      }
      saveJob(job);
    } catch (e) {
      console.warn('[osProVideo] replicate create failed → demo:', e?.message || e);
      job.provider = 'demo';
      job.note = `Replicate unavailable (${e?.message || 'error'}) — demo fallback`;
      job.status = 'queued';
      saveJob(job);
      scheduleDemoProgress(job.id);
    }
  } else {
    scheduleDemoProgress(job.id);
  }

  return job;
}

/**
 * Refresh remote status when needed (Replicate poll).
 * @returns {Promise<ProVideoJob|null>}
 */
export async function refreshProVideoJob(id) {
  const job = getProVideoJob(id);
  if (!job) return null;
  if (job.status === 'ready' || job.status === 'failed') return job;

  if (job.provider === 'replicate' && job.remoteId) {
    try {
      const pred = await pollReplicatePrediction(job.remoteId);
      const st = String(pred.status || '');
      if (st === 'succeeded') {
        const url = extractVideoUrl(pred.output);
        job.status = url ? 'ready' : 'failed';
        job.videoUrl = url || undefined;
        job.note = url ? 'Replicate clip ready' : 'Succeeded but no video URL';
        job.error = url ? undefined : 'missing_output_url';
      } else if (st === 'failed' || st === 'canceled') {
        job.status = 'failed';
        job.error = String(pred.error || st);
        job.note = 'Replicate job failed';
      } else {
        job.status = 'rendering';
        job.note = `Replicate ${st || 'processing'}`;
      }
      saveJob(job);
    } catch (e) {
      console.warn('[osProVideo] poll:', e?.message || e);
      job.note = `Poll error: ${e?.message || e}`;
      saveJob(job);
    }
  }

  return job;
}

export function publicJobView(job) {
  if (!job) return null;
  return {
    jobId: job.id,
    id: job.id,
    productName: job.productName,
    sku: job.sku || null,
    status: job.status,
    provider: job.provider,
    videoUrl: job.videoUrl || null,
    posterUrl: job.posterUrl || null,
    note: job.note,
    error: job.error || null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}
