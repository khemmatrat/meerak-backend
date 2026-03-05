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

export function getBullQueues() {
  return { imageResizeQueue, emailQueue, pushQueue, paymentRetryQueue, videoWatermarkQueue };
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

    // Video watermark — ต้องส่ง pool เข้ามา
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
          const outputBuffer = await processVideoWithWatermark(inputBuffer, { title, description });
          await unlink(tempPath).catch(() => {});

          const ext = '.mp4';
          const key = `videos/talent_${talentId}_${Date.now()}_wm${ext}`;
          const result = await uploadToS3(outputBuffer, {
            key,
            contentType: 'video/mp4',
            resourceType: 'video',
          });

          const hasTable = await pool.query(`SELECT 1 FROM information_schema.tables WHERE table_name = 'talent_videos'`).then(r => r.rows?.length > 0);
          if (hasTable) {
            await pool.query(
              `INSERT INTO talent_videos (talent_id, video_url, thumbnail_url, title, description, is_approved)
               VALUES ($1, $2, $3, $4, $5, true)`,
              [talentId, result.secure_url, null, title || null, description || null]
            );
          }

          await pool.query(
            `UPDATE talent_video_upload_jobs SET status = 'completed', video_url = $2, title = $3, description = $4, completed_at = NOW() WHERE id = $1`,
            [jobDbId, result.secure_url, title || null, description || null]
          );

          return { done: true, video_url: result.secure_url };
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

    console.log('✅ Bull queues initialized (image-resize, email, push, payment-retry, video-watermark)');
    return true;
  } catch (err) {
    console.warn('⚠️ Bull queues init failed (Redis required):', err.message);
    return false;
  }
}

export async function getBullQueueStats() {
  const result = {};
  for (const [name, q] of Object.entries({ imageResizeQueue, emailQueue, pushQueue, paymentRetryQueue, videoWatermarkQueue })) {
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
