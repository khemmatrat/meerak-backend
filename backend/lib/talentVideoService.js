/**
 * Talent AI Resume video — async jobs via aqond-ai-studio (LivePortrait + TTS)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { uploadToS3 } from './s3-client.js';
import { getGrowthStatus } from './growthEngine.js';

const STUDIO_BASE = () =>
  (process.env.AQOND_AI_STUDIO_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const STUDIO_KEY = () =>
  process.env.AQOND_AI_STUDIO_API_KEY || 'AQOND_STUDIO_SECRET_SHA256_PASS';

const DEFAULT_SCRIPT_TH =
  'สวัสดีครับ ผมพร้อมรับงานผ่าน AQOND มีประสบการณ์และทำงานตรงเวลา ติดต่อจ้างงานได้เลยครับ';

async function resolveUserId(pool, userId) {
  const r = await pool.query(
    `SELECT id, full_name FROM users WHERE firebase_uid = $1 OR id::text = $1 LIMIT 1`,
    [userId],
  );
  return r.rows[0] || null;
}

async function downloadToBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function fetchAvatarBuffer(avatarUrl) {
  const u = String(avatarUrl || '').trim();
  if (!u) throw new Error('avatar_url required');
  if (u.startsWith('http://') || u.startsWith('https://')) {
    return downloadToBuffer(u);
  }
  throw new Error('avatar_url must be https');
}

export async function getTalentVideoEntitlement(pool, userId) {
  const status = await getGrowthStatus(pool, userId);
  if (!status.found) return { found: false };
  const remaining = status.entitlements?.aiVideoCreditsRemaining ?? 0;
  const milestone = status.milestones?.talent_ai;
  return {
    found: true,
    locked: remaining <= 0,
    creditsRemaining: remaining,
    milestone: milestone || null,
    referralCode: status.referralCode,
    sharePath: status.sharePath,
  };
}

export async function createTalentVideoJob(pool, userId, { script_text, avatar_url, character, speed }) {
  const user = await resolveUserId(pool, userId);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

  const ent = await getTalentVideoEntitlement(pool, userId);
  if (!ent.found || ent.locked || ent.creditsRemaining <= 0) {
    throw Object.assign(
      new Error('AI video locked — invite 10 friends with wallet activation to unlock'),
      { status: 403, code: 'AI_VIDEO_LOCKED' },
    );
  }

  const script = String(script_text || DEFAULT_SCRIPT_TH).trim().slice(0, 500);
    const jobRes = await pool.query(
    `INSERT INTO talent_video_jobs (user_id, status, script_text, avatar_url)
     VALUES ($1, 'queued', $2, $3)
     RETURNING id, status, created_at`,
    [user.id, script, avatar_url],
  );
  const job = jobRes.rows[0];
  const voiceCharacter = String(character || 'man_warm');

  setImmediate(() => {
    processTalentVideoJob(pool, job.id, { character: voiceCharacter }).catch((e) => {
      console.error('[talent-video] background job failed', job.id, e?.message || e);
    });
  });

  return { jobId: job.id, status: job.status };
}

export async function getTalentVideoJob(pool, userId, jobId) {
  const user = await resolveUserId(pool, userId);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
  const r = await pool.query(
    `SELECT id, status, script_text, avatar_url, output_url, error_message, created_at, completed_at
     FROM talent_video_jobs WHERE id = $1 AND user_id = $2`,
    [jobId, user.id],
  );
  if (!r.rows.length) throw Object.assign(new Error('Job not found'), { status: 404 });
  return r.rows[0];
}

export async function processTalentVideoJob(pool, jobId, opts = {}) {
  const r = await pool.query(`SELECT * FROM talent_video_jobs WHERE id = $1`, [jobId]);
  const job = r.rows[0];
  if (!job || job.status === 'completed') return job;

  await pool.query(`UPDATE talent_video_jobs SET status = 'processing' WHERE id = $1`, [jobId]);

  try {
    const avatarBuf = await fetchAvatarBuffer(job.avatar_url);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqond-talent-'));
    const avatarPath = path.join(tmpDir, 'avatar.jpg');
    fs.writeFileSync(avatarPath, avatarBuf);

    const form = new FormData();
    form.append('text', job.script_text || DEFAULT_SCRIPT_TH);
    form.append('character', String(opts.character || 'man_warm'));
    form.append('speed', '1.0');
    form.append('resolution', '720p');
    form.append(
      'avatar_file',
      new Blob([avatarBuf], { type: 'image/jpeg' }),
      'avatar.jpg',
    );

    const studioRes = await fetch(`${STUDIO_BASE()}/api/v1/generate-ultra-hd-avatar`, {
      method: 'POST',
      headers: { 'X-AQOND-API-KEY': STUDIO_KEY() },
      body: form,
    });

    const body = await studioRes.json().catch(() => ({}));
    if (!studioRes.ok) {
      throw new Error(body.detail || body.error || `Studio HTTP ${studioRes.status}`);
    }

    const videoUrl = body.video_url;
    if (!videoUrl) throw new Error('Studio returned no video_url');

    const videoBuf = await downloadToBuffer(videoUrl);
    const uploaded = await uploadToS3(videoBuf, {
      folder: 'talent-ai-resume',
      filename: `${job.user_id}-${jobId}.mp4`,
      contentType: 'video/mp4',
    });
    const outputUrl = uploaded.url || uploaded.publicUrl || uploaded.secure_url;
    if (!outputUrl) throw new Error('S3 upload failed');

    await pool.query(
      `UPDATE talent_video_jobs SET status = 'completed', output_url = $2, completed_at = NOW() WHERE id = $1`,
      [jobId, outputUrl],
    );

    await pool.query(
      `UPDATE growth_entitlements SET
         ai_video_credits_used = ai_video_credits_used + 1,
         updated_at = NOW()
       WHERE user_id = $1`,
      [job.user_id],
    );

    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }

    return { status: 'completed', output_url: outputUrl };
  } catch (e) {
    const msg = String(e?.message || e).slice(0, 500);
    await pool.query(
      `UPDATE talent_video_jobs SET status = 'failed', error_message = $2, completed_at = NOW() WHERE id = $1`,
      [jobId, msg],
    );
    throw e;
  }
}

export async function listTalentVideoJobs(pool, userId, limit = 10) {
  const user = await resolveUserId(pool, userId);
  if (!user) return [];
  const r = await pool.query(
    `SELECT id, status, output_url, created_at, completed_at
     FROM talent_video_jobs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [user.id, limit],
  );
  return r.rows;
}
