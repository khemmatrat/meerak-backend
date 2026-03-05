/**
 * Video Upload Handler — Rekognition moderation + ffmpeg thumbnail + S3
 * Flow: 1) Moderation check 2) S3 upload 3) Thumbnail
 * ถ้า AI เจอ violation: ไม่บล็อก แต่ return moderationFlagged=true → บันทึก is_approved=FALSE
 * ให้ Admin approve ด้วยมือ (Human-in-the-loop) ลด False Positive เช่น ชุดว่ายน้ำ/ออกกำลังกาย
 */
import { randomUUID } from 'crypto';
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { RekognitionClient, DetectModerationLabelsCommand } from '@aws-sdk/client-rekognition';
import { uploadToS3 } from './s3-client.js';

const REKOGNITION_THRESHOLD = 80; // %
const VIOLATION_LABELS = ['explicit nudity', 'suggestive', 'revealing clothes'];
const ALLOWED_MIMES = ['video/mp4', 'video/webm', 'video/quicktime'];

let ffmpeg;
try {
  const ffmpegModule = await import('fluent-ffmpeg');
  ffmpeg = ffmpegModule.default;
} catch {
  ffmpeg = null;
}

const rekognitionClient = new RekognitionClient({
  region: process.env.AWS_REGION || 'ap-southeast-1',
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined,
});

function validateFileType(mimetype) {
  return ALLOWED_MIMES.includes(mimetype);
}

/**
 * Extract a frame at given second as JPEG buffer
 */
function extractFrameAt(videoPath, seconds, outFilename) {
  return new Promise((resolve, reject) => {
    if (!ffmpeg) {
      reject(new Error('ffmpeg not available'));
      return;
    }
    const outPath = join(tmpdir(), outFilename);
    ffmpeg(videoPath)
      .seekInput(seconds)
      .outputOptions(['-vframes 1', '-f image2'])
      .output(outPath)
      .on('end', () => {
        if (existsSync(outPath)) {
          const buf = readFileSync(outPath);
          try { unlinkSync(outPath); } catch (_) {}
          resolve(buf);
        } else {
          reject(new Error('Frame extraction failed'));
        }
      })
      .on('error', (e) => {
        try { if (existsSync(outPath)) unlinkSync(outPath); } catch (_) {}
        reject(e);
      })
      .run();
  });
}

function extractFrameBuffer(videoPath) {
  return extractFrameAt(videoPath, 1, `frame_${randomUUID()}.jpg`);
}

function generateThumbnail(videoPath) {
  return extractFrameAt(videoPath, 2, `thumb_${randomUUID()}.jpg`).catch(() => null);
}

/**
 * Run Rekognition DetectModerationLabels on image buffer
 * Returns { violated: boolean, labels: string[] }
 */
async function checkContentModeration(imageBuffer) {
  if (!process.env.AWS_ACCESS_KEY_ID) {
    return { violated: false, labels: [] };
  }
  try {
    const cmd = new DetectModerationLabelsCommand({
      Image: { Bytes: imageBuffer },
      MinConfidence: REKOGNITION_THRESHOLD,
    });
    const result = await rekognitionClient.send(cmd);
    const labels = (result.ModerationLabels || [])
      .filter((l) => l.Confidence >= REKOGNITION_THRESHOLD)
      .map((l) => (l.ParentName || l.Name || '').toString())
      .filter(Boolean);
    const violated = labels.some((name) => {
      const n = String(name).toLowerCase();
      return VIOLATION_LABELS.some((v) => n.includes(v));
    });
    return { violated, labels };
  } catch (e) {
    console.warn('Rekognition check failed:', e.message);
    return { violated: false, labels: [] };
  }
}

/**
 * Main upload handler
 */
export async function handleVideoUpload(pool, req) {
  const file = req.file;
  if (!file || !file.buffer) throw new Error('ไม่มีไฟล์วิดีโอ');

  if (!validateFileType(file.mimetype)) {
    throw new Error('รองรับเฉพาะ MP4, WebM, MOV');
  }

  const talentUuid = req.talentUuid;
  const { title = '', description = '' } = req.body || {};

  const ext = file.originalname?.match(/\.[a-zA-Z0-9]+$/)?.[0] || '.mp4';
  const videoUuid = randomUUID();
  const s3VideoKey = `talent-videos/${talentUuid}/${videoUuid}${ext}`;

  let tempPath = null;
  try {
    tempPath = join(tmpdir(), `upload_${videoUuid}${ext}`);
    writeFileSync(tempPath, file.buffer);

    // 1) Extract frame for moderation (skip if ffmpeg unavailable)
    let violated = false;
    let labels = [];
    try {
      const frameBuffer = await extractFrameBuffer(tempPath);
      const mod = await checkContentModeration(frameBuffer);
      violated = mod.violated;
      labels = mod.labels;
    } catch (frameErr) {
      console.warn('Frame extraction skipped (ffmpeg?):', frameErr.message);
    }

    if (violated) {
      await pool.query(
        `INSERT INTO audit_log (actor_id, actor_role, action, entity_name, entity_id, changes, status)
         VALUES ($1, 'User', 'video_ai_moderation_flagged', 'talent_video', $2, $3, 'Success')`,
        [talentUuid, videoUuid, JSON.stringify({ labels, note: 'รอ Admin approve (Human-in-the-loop)' })]
      );
    }

    // 2) Upload video to S3 (unique UUID) — อัปโหลดเสมอ ไม่บล็อก
    const videoResult = await uploadToS3(file.buffer, {
      key: s3VideoKey,
      contentType: file.mimetype || 'video/mp4',
      resourceType: 'video',
    });

    // 3) Generate and upload thumbnail (skip if ffmpeg unavailable)
    let thumbnailUrl = null;
    try {
      const thumbBuffer = await generateThumbnail(tempPath);
      if (thumbBuffer && thumbBuffer.length > 0) {
      const thumbKey = `thumbnails/${talentUuid}/${videoUuid}.jpg`;
      const thumbResult = await uploadToS3(thumbBuffer, {
        key: thumbKey,
        contentType: 'image/jpeg',
      });
      thumbnailUrl = thumbResult.secure_url;
      }
    } catch (thumbErr) {
      console.warn('Thumbnail generation skipped:', thumbErr.message);
    }

    return {
      s3Key: videoResult.key,
      videoUrl: videoResult.secure_url,
      thumbnailUrl,
      title,
      description,
      moderationFlagged: violated,
      moderationLabels: labels,
    };
  } finally {
    if (tempPath && existsSync(tempPath)) {
      try {
        unlinkSync(tempPath);
      } catch (_) {}
    }
  }
}
