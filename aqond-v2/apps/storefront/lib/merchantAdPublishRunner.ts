import {
  getTrackedAdJobById,
  listTrackedAdJobs,
  registerTrackedPublishJob,
  removeTrackedAdJob,
  updatePublishStatus,
} from '@/lib/merchantAdBackgroundJob';
import { mapAdStudioError, publishAdVideo } from '@/lib/merchantAdVideo';

const inflight = new Map<string, Promise<void>>();

function notifyPublish(title: string, body: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body });
  } catch {
    /* ignore */
  }
}

export async function requestAdNotificationPermission() {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'default') {
    try {
      await Notification.requestPermission();
    } catch {
      /* ignore */
    }
  }
}

export type PublishBackgroundInput = {
  jobId: string;
  merchantId: string;
  merchantName: string;
  productTitle: string;
  target?: string;
  product: Record<string, unknown>;
  onComplete?: () => void;
  onFail?: (message: string) => void;
};

export function runPublishInBackground(input: PublishBackgroundInput): Promise<void> {
  const existing = inflight.get(input.jobId);
  if (existing) return existing;

  registerTrackedPublishJob({
    jobId: input.jobId,
    merchantId: input.merchantId,
    merchantName: input.merchantName,
    productTitle: input.productTitle,
    publishPayload: input.product,
    publishTarget: input.target || 'studio_feed',
  });

  void requestAdNotificationPermission();

  const task = publishAdVideo(input.jobId, input.merchantId, input.target || 'studio_feed', input.product)
    .then(() => {
      updatePublishStatus(input.jobId, 'completed');
      notifyPublish(
        'เผยแพร่สินค้าแล้ว',
        `${input.merchantName} — ${input.productTitle} ขึ้นร้านและหน้าแรกแล้ว`,
      );
      input.onComplete?.();
      window.setTimeout(() => removeTrackedAdJob(input.jobId), 10_000);
    })
    .catch((e: unknown) => {
      const message = mapAdStudioError(e);
      updatePublishStatus(input.jobId, 'failed', message);
      notifyPublish('เผยแพร่ไม่สำเร็จ', message);
      input.onFail?.(message);
    })
    .finally(() => {
      inflight.delete(input.jobId);
    });

  inflight.set(input.jobId, task);
  return task;
}

export function retryPublishInBackground(jobId: string, callbacks?: { onComplete?: () => void; onFail?: (m: string) => void }) {
  const meta = getTrackedAdJobById(jobId);
  if (!meta || meta.kind !== 'publish' || !meta.publishPayload) {
    return Promise.reject(new Error('retry_payload_missing'));
  }
  updatePublishStatus(jobId, 'publishing');
  return runPublishInBackground({
    jobId: meta.jobId,
    merchantId: meta.merchantId,
    merchantName: meta.merchantName,
    productTitle: meta.productTitle || 'สินค้า',
    target: meta.publishTarget,
    product: meta.publishPayload,
    onComplete: callbacks?.onComplete,
    onFail: callbacks?.onFail,
  });
}

/** Resume publish jobs interrupted by refresh (session still has publishing state). */
export function resumeInterruptedPublishJobs(callbacks?: { onComplete?: () => void; onFail?: (m: string) => void }) {
  if (typeof window === 'undefined') return;
  for (const meta of listTrackedAdJobs()) {
    if (meta.kind !== 'publish' || meta.publishStatus !== 'publishing') continue;
    if (inflight.has(meta.jobId)) continue;
    if (!meta.publishPayload) {
      updatePublishStatus(meta.jobId, 'failed', 'ข้อมูลเผยแพร่หาย — ลองใหม่จากคลิป');
      continue;
    }
    void runPublishInBackground({
      jobId: meta.jobId,
      merchantId: meta.merchantId,
      merchantName: meta.merchantName,
      productTitle: meta.productTitle || 'สินค้า',
      target: meta.publishTarget,
      product: meta.publishPayload,
      onComplete: callbacks?.onComplete,
      onFail: callbacks?.onFail,
    });
  }
}
