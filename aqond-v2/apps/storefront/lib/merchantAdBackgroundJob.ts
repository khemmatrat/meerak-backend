export type TrackedAdJobKind = 'generate' | 'publish';

export type PublishStatus = 'publishing' | 'completed' | 'failed';

export type TrackedAdJobMeta = {
  jobId: string;
  merchantId: string;
  merchantName: string;
  startedAt: number;
  overlayDismissed: boolean;
  kind?: TrackedAdJobKind;
  productTitle?: string;
  publishStatus?: PublishStatus;
  publishError?: string;
  publishPayload?: Record<string, unknown>;
  publishTarget?: string;
};

const STORAGE_KEY = 'aqond_mad_tracking';
export const MAD_JOB_EVENT = 'aqond-mad-job-update';

function readAll(): TrackedAdJobMeta[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TrackedAdJobMeta[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(list: TrackedAdJobMeta[]) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(MAD_JOB_EVENT));
}

export function listTrackedAdJobs(): TrackedAdJobMeta[] {
  return readAll();
}

export function getTrackedAdJob(merchantId: string): TrackedAdJobMeta | null {
  return readAll().find((j) => j.merchantId === merchantId && j.kind !== 'publish') || null;
}

export function getTrackedAdJobById(jobId: string): TrackedAdJobMeta | null {
  return readAll().find((j) => j.jobId === jobId) || null;
}

export function registerTrackedAdJob(meta: Omit<TrackedAdJobMeta, 'overlayDismissed'> & { overlayDismissed?: boolean }) {
  const list = readAll().filter((j) => !(j.merchantId === meta.merchantId && (j.kind || 'generate') === (meta.kind || 'generate')));
  list.push({
    ...meta,
    kind: meta.kind || 'generate',
    overlayDismissed: meta.overlayDismissed ?? false,
  });
  writeAll(list);
}

export function registerTrackedPublishJob(meta: {
  jobId: string;
  merchantId: string;
  merchantName: string;
  productTitle: string;
  publishPayload: Record<string, unknown>;
  publishTarget?: string;
}) {
  const list = readAll().filter((j) => j.jobId !== meta.jobId);
  list.push({
    jobId: meta.jobId,
    merchantId: meta.merchantId,
    merchantName: meta.merchantName,
    productTitle: meta.productTitle,
    startedAt: Date.now(),
    overlayDismissed: false,
    kind: 'publish',
    publishStatus: 'publishing',
    publishPayload: meta.publishPayload,
    publishTarget: meta.publishTarget || 'studio_feed',
  });
  writeAll(list);
}

export function updatePublishStatus(jobId: string, status: PublishStatus, error?: string) {
  const list = readAll().map((j) =>
    j.jobId === jobId && j.kind === 'publish'
      ? { ...j, publishStatus: status, publishError: error, startedAt: status === 'publishing' ? Date.now() : j.startedAt }
      : j,
  );
  writeAll(list);
}

export function dismissAdJobOverlay(jobId: string) {
  const list = readAll().map((j) => (j.jobId === jobId ? { ...j, overlayDismissed: true } : j));
  writeAll(list);
}

export function showAdJobOverlay(jobId: string) {
  const list = readAll().map((j) => (j.jobId === jobId ? { ...j, overlayDismissed: false } : j));
  writeAll(list);
}

export function removeTrackedAdJob(jobId: string) {
  writeAll(readAll().filter((j) => j.jobId !== jobId));
}

/** Simulated publish progress (upload + catalog + feed). */
export function publishProgressPct(meta: TrackedAdJobMeta): number {
  if (meta.publishStatus === 'completed') return 100;
  if (meta.publishStatus === 'failed') return 0;
  const elapsed = (Date.now() - meta.startedAt) / 1000;
  return Math.min(92, Math.round(8 + elapsed * 6));
}
