/**
 * Bull job queues — image-resize, email-notifications, push-notifications
 * Requires Redis. Workers process jobs in-process.
 */
import Bull from 'bull';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '..', '.env') });

// Upstash (rediss://) ต้องใช้ TLS — Bull/ioredis บางครั้งค้างเมื่อใช้ URL อย่างเดียว
function getRedisOpt() {
  const url = process.env.REDIS_URL;
  if (!url) return { redis: { host: 'localhost', port: 6379 } };
  if (url.startsWith('rediss://')) {
    try {
      const u = new URL(url);
      return {
        redis: {
          host: u.hostname,
          port: parseInt(u.port || '6379', 10),
          username: u.username || undefined,
          password: u.password || undefined,
          tls: { rejectUnauthorized: false },
          maxRetriesPerRequest: null,
        },
      };
    } catch (_) {
      return { redis: url };
    }
  }
  return { redis: url };
}
const redisOpt = getRedisOpt();

let imageResizeQueue = null;
let emailQueue = null;
let pushQueue = null;
let paymentRetryQueue = null;
let videoWatermarkQueue = null;
/**
 * Webhook intake -> worker fast-wake signal.
 * Source of truth is the DB queue (payment_webhook_jobs); this Bull queue is
 * a low-latency notification channel only. If Redis is unavailable the DB
 * worker still picks up jobs via fetchAndLockQueuedWebhookJobs polling.
 */
let paymentWebhookQueue = null;

export function getBullQueues() {
  return { imageResizeQueue, emailQueue, pushQueue, paymentRetryQueue, videoWatermarkQueue, paymentWebhookQueue };
}

export function getPaymentWebhookQueue() {
  return paymentWebhookQueue;
}

/**
 * Best-effort fast-wake signal for the webhook worker.
 *
 * Idempotency: Bull jobId = `provider:event_id` (matches the DB
 * idempotency_key) so duplicate enqueues collapse into one wake-up call.
 *
 * Failure modes (all swallowed; never throws):
 *   - queue_not_initialized: Redis init failed at boot
 *   - duplicate: Bull already has a job with this id (treat as no-op)
 *   - enqueue_error: transient Redis problem
 *
 * @param {{ provider: string, event_id: string, idempotency_key: string, trace_id?: string|null }} input
 */
export async function enqueuePaymentWebhookSignal(input) {
  if (!paymentWebhookQueue) {
    return { enqueued: false, reason: 'queue_not_initialized' };
  }
  const provider = String(input?.provider || '').trim();
  const event_id = String(input?.event_id || '').trim();
  const idempotency_key = String(input?.idempotency_key || `${provider}:${event_id}`).trim();
  if (!provider || !event_id || !idempotency_key) {
    return { enqueued: false, reason: 'missing_keys' };
  }
  try {
    const job = await paymentWebhookQueue.add(
      {
        provider,
        event_id,
        idempotency_key,
        trace_id: input?.trace_id || null,
        signaled_at: new Date().toISOString(),
      },
      {
        jobId: idempotency_key,
        // Task 12: DB-backed payment_webhook_jobs owns retry policy; Bull must stay single-attempt.
        attempts: 1,
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );
    return { enqueued: true, bull_job_id: String(job?.id || idempotency_key) };
  } catch (e) {
    return { enqueued: false, reason: 'enqueue_error', error: e?.message || String(e) };
  }
}

export async function initBullQueues(pool) {
  try {
    imageResizeQueue = new Bull('image-resize', redisOpt);
    emailQueue = new Bull('email-notifications', redisOpt);
    pushQueue = new Bull('push-notifications', redisOpt);
    paymentRetryQueue = new Bull('payment-retry', redisOpt);
    videoWatermarkQueue = new Bull('video-watermark', redisOpt);

    // Workers — process jobs
    imageResizeQueue.process(async (job) => {
      const { url, width, height } = job.data;
      console.log('[Queue] image-resize:', url, width, height);
      return { done: true, job: job.id };
    });

    emailQueue.process(async (job) => {
      const { to, subject, body } = job.data;
      console.log('[Queue] email:', to, subject);
      return { done: true, job: job.id };
    });

    pushQueue.process(async (job) => {
      const { userId, title, body } = job.data;
      console.log('[Queue] push:', userId, title);
      return { done: true, job: job.id };
    });

    paymentRetryQueue.process(async (job) => {
      const { ledgerId, paymentId } = job.data;
      console.log('[Queue] payment-retry:', ledgerId, paymentId);
      return { done: true, job: job.id };
    });

    // Payment webhook fast-wake signal queue.
    // Bull job carries { provider, event_id, idempotency_key, trace_id }.
    // The worker locks the matching DB row (atomic CTE) and delegates to
    // processWebhookJob. Bull retries are disabled — DB worker owns retries.
    paymentWebhookQueue = new Bull('payment-webhook', redisOpt);
    if (pool) {
      const pwConcurrency = Math.max(1, parseInt(process.env.PAYMENT_WEBHOOK_WORKER_CONCURRENCY || '5', 10));
      paymentWebhookQueue.process(pwConcurrency, async (bullJob) => {
        const data = bullJob?.data || {};
        const idempotency_key = String(data.idempotency_key || '').trim();
        const trace_id = data.trace_id || null;
        if (!idempotency_key) {
          return { skipped: true, reason: 'missing_idempotency_key' };
        }
        let row;
        try {
          const r = await pool.query(
            `WITH picked AS (
               SELECT id FROM payment_webhook_jobs
               WHERE idempotency_key = $1
                 AND status = 'queued'
                 AND next_attempt_at <= NOW()
               ORDER BY next_attempt_at ASC, id ASC
               FOR UPDATE SKIP LOCKED
               LIMIT 1
             )
             UPDATE payment_webhook_jobs j
             SET status = 'processing',
                 attempt_count = j.attempt_count + 1,
                 updated_at = NOW()
             FROM picked
             WHERE j.id = picked.id
             RETURNING j.*`,
            [idempotency_key],
          );
          row = r.rows?.[0] || null;
        } catch (e) {
          console.error('[Queue] payment-webhook fetch+lock failed', {
            idempotency_key,
            trace_id,
            error: e?.message,
          });
          throw e;
        }
        if (!row) {
          return { skipped: true, reason: 'not_in_queued', idempotency_key };
        }
        try {
          const { processWebhookJob } = await import('./paymentWebhookWorker.js');
          const result = await processWebhookJob(pool, row);
          return { ok: true, idempotency_key, result };
        } catch (e) {
          console.error('[Queue] payment-webhook processWebhookJob threw', {
            idempotency_key,
            trace_id,
            error: e?.message,
          });
          throw e;
        }
      });
    }

    // Video watermark — ต้องส่ง pool เข้ามา
    // Fallback: ถ้า ffmpeg ไม่มี (ENOENT) → อัปโหลดวิดีโอต้นฉบับโดยไม่ติดลายน้ำ
    if (pool) {
      videoWatermarkQueue.process(async (job) => {
        const { jobDbId, tempPath, talentId, title, description } = job.data;
        const { processVideoWithWatermark } = await import('./videoWatermark.js');
        const { uploadToS3 } = await import('./s3-client.js');
        const { readFile, unlink } = await import('fs/promises');
        try {
          await pool.query(
            `UPDATE talent_video_upload_jobs SET status = 'processing' WHERE id = $1`,
            [jobDbId]
          );

          const inputBuffer = await readFile(tempPath);
          let outputBuffer;
          let usedWatermark = true;
          try {
            outputBuffer = await processVideoWithWatermark(inputBuffer, { title, description });
          } catch (wmErr) {
            const isFfmpegMissing = /spawn ffmpeg ENOENT|ffmpeg.*not found|ENOENT/i.test(wmErr.message || '');
            if (isFfmpegMissing) {
              console.warn('[Video] ffmpeg not found — uploading original video without watermark');
              outputBuffer = inputBuffer;
              usedWatermark = false;
            } else {
              throw wmErr;
            }
          }
          await unlink(tempPath).catch(() => {});

          const ext = '.mp4';
          const suffix = usedWatermark ? '_wm' : '';
          const key = `videos/talent_${talentId}_${Date.now()}${suffix}${ext}`;
          const result = await uploadToS3(outputBuffer, {
            key,
            contentType: 'video/mp4',
            resourceType: 'video',
          });

          const hasTable = await pool.query(`SELECT 1 FROM information_schema.tables WHERE table_name = 'talent_videos'`).then(r => r.rows?.length > 0);
          if (hasTable) {
            const s3Key = result.key || result.public_id || key;
            const hasS3KeyCol = await pool.query(
              `SELECT 1 FROM information_schema.columns WHERE table_name = 'talent_videos' AND column_name = 's3_key'`
            ).then(r => r.rows?.length > 0);
            if (hasS3KeyCol) {
              await pool.query(
                `INSERT INTO talent_videos (talent_id, video_url, s3_key, thumbnail_url, title, description, is_approved)
                 VALUES ($1, $2, $3, $4, $5, $6, true)`,
                [talentId, result.secure_url, s3Key, null, title || null, description || null]
              );
            } else {
              await pool.query(
                `INSERT INTO talent_videos (talent_id, video_url, thumbnail_url, title, description, is_approved)
                 VALUES ($1, $2, $3, $4, $5, true)`,
                [talentId, result.secure_url, null, title || null, description || null]
              );
            }
          }

          await pool.query(
            `UPDATE talent_video_upload_jobs SET status = 'completed', video_url = $2, title = $3, description = $4, completed_at = NOW() WHERE id = $1`,
            [jobDbId, result.secure_url, title || null, description || null]
          );

          return { done: true, video_url: result.secure_url, used_watermark: usedWatermark };
        } catch (err) {
          await pool.query(
            `UPDATE talent_video_upload_jobs SET status = 'failed', error_message = $2, completed_at = NOW() WHERE id = $1`,
            [jobDbId, (err.message || String(err)).slice(0, 500)]
          ).catch(() => {});
          await unlink(tempPath).catch(() => {});
          throw err;
        }
      });
    }

    console.log('✅ Bull queues initialized (image-resize, email, push, payment-retry, video-watermark, payment-webhook)');
    return true;
  } catch (err) {
    console.warn('⚠️ Bull queues init failed (Redis required):', err.message);
    return false;
  }
}

export async function getBullQueueStats() {
  const result = {};
  for (const [name, q] of Object.entries({ imageResizeQueue, emailQueue, pushQueue, paymentRetryQueue, videoWatermarkQueue, paymentWebhookQueue })) {
    if (!q) continue;
    try {
      const [waiting, active, completed, failed] = await Promise.all([
        q.getWaitingCount(),
        q.getActiveCount(),
        q.getCompletedCount(),
        q.getFailedCount(),
      ]);
      const total = waiting + active + completed + failed;
      const failedRate = total > 0 ? (failed / total) * 100 : 0;
      result[name] = {
        waiting,
        active,
        completed,
        failed,
        failedRate,
        status: waiting > 100 ? 'CONGESTED' : failed > 10 ? 'STALLED' : 'OPERATIONAL',
      };
    } catch (e) {
      result[name] = { waiting: 0, active: 0, completed: 0, failed: 0, failedRate: 0, status: 'UNKNOWN' };
    }
  }
  return result;
}

export async function addTestJob(queueName, data) {
  const q = { imageResizeQueue, emailQueue, pushQueue, paymentRetryQueue }[queueName];
  if (!q) throw new Error('Unknown queue');
  const job = await q.add(data);
  return job.id;
}
