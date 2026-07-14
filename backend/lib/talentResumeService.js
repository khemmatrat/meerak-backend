/**
 * AI Talent Resume — profile context + Hermes/Qwen draft + publish to profile
 */

import { ruleBasedResumeDraft } from './talentResumeRules.js';

const AI_CORE_BASE = () =>
  (process.env.AI_CORE_URL || 'http://127.0.0.1:8100').replace(/\/$/, '');
const AI_CORE_KEY = () => process.env.AI_CORE_API_KEY || '';

async function resolveUser(pool, userId) {
  const r = await pool.query(
    `SELECT id, firebase_uid, full_name, avatar_url, bio, expert_category,
            signature_service, the_journey, skills, work_experience, education,
            greeting_video_url,
            COALESCE(completed_jobs_count, 0)::int AS completed_jobs_count,
            rating
     FROM users
     WHERE firebase_uid = $1 OR id::text = $1
     LIMIT 1`,
    [userId],
  );
  return r.rows[0] || null;
}

function parseJsonField(val, fallback) {
  if (Array.isArray(val)) return val;
  if (val && typeof val === 'object') return val;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export async function buildTalentProfileContext(pool, userId) {
  const user = await resolveUser(pool, userId);
  if (!user) return null;

  return {
    user_id: user.id,
    talent_name: user.full_name || 'Talent',
    avatar_url: user.avatar_url || null,
    bio: user.bio || '',
    category_hint: user.expert_category || 'general',
    existing_headline: user.signature_service || '',
    existing_journey: user.the_journey || '',
    skills: parseJsonField(user.skills, []),
    work_experience: parseJsonField(user.work_experience, []),
    education: parseJsonField(user.education, []),
    completed_jobs_count: user.completed_jobs_count || 0,
    rating: user.rating != null ? Number(user.rating) : null,
    greeting_video_url: user.greeting_video_url || null,
  };
}

async function fetchAiResumeDraft(ctx) {
  const headers = { 'Content-Type': 'application/json' };
  const key = AI_CORE_KEY();
  if (key) headers['x-ai-core-api-key'] = key;

  const res = await fetch(`${AI_CORE_BASE()}/v1/talent/resume-draft`, {
    method: 'POST',
    headers,
    body: JSON.stringify(ctx),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`ai-core resume-draft ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.json();
}

export async function generateTalentResumeDraft(pool, userId) {
  const ctx = await buildTalentProfileContext(pool, userId);
  if (!ctx) throw Object.assign(new Error('User not found'), { status: 404 });

  try {
    const ai = await fetchAiResumeDraft(ctx);
    return {
      profile: ctx,
      draft: ai.draft,
      sources: ai.sources || { structure: ai.source || 'hermes' },
    };
  } catch (e) {
    console.warn('[talent-resume] AI draft fallback:', e?.message || e);
    return {
      profile: ctx,
      draft: ruleBasedResumeDraft(ctx),
      sources: { structure: 'rules_fallback' },
    };
  }
}

export async function publishTalentResumeDraft(pool, userId, payload) {
  const user = await resolveUser(pool, userId);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

  const {
    headline_th,
    about_th,
    video_script_th,
    greeting_video_url,
    skills_highlight,
    experience_highlight,
  } = payload || {};

  const updates = [];
  const values = [];
  let i = 1;

  if (headline_th) {
    updates.push(`signature_service = $${i++}`);
    values.push(String(headline_th).slice(0, 120));
  }
  if (about_th) {
    updates.push(`the_journey = $${i++}`);
    values.push(String(about_th).slice(0, 2000));
    updates.push(`bio = $${i++}`);
    values.push(String(about_th).slice(0, 500));
  }
  if (greeting_video_url) {
    updates.push(`greeting_video_url = $${i++}`);
    values.push(String(greeting_video_url));
  }
  if (Array.isArray(skills_highlight) && skills_highlight.length) {
    updates.push(`skills = $${i++}::jsonb`);
    values.push(JSON.stringify(skills_highlight.slice(0, 12)));
  }
  if (Array.isArray(experience_highlight) && experience_highlight.length) {
    const mapped = experience_highlight.slice(0, 5).map((e, idx) => ({
      id: `ai-${Date.now()}-${idx}`,
      title: e.title || 'ผู้ให้บริการ',
      company: e.company || 'AQOND',
      description: e.bullet || e.description || '',
    }));
    updates.push(`work_experience = $${i++}::jsonb`);
    values.push(JSON.stringify(mapped));
  }

  if (!updates.length) {
    throw Object.assign(new Error('Nothing to publish'), { status: 400 });
  }

  updates.push('updated_at = NOW()');
  values.push(user.id);

  const r = await pool.query(
    `UPDATE users SET ${updates.join(', ')} WHERE id = $${i} RETURNING id, signature_service, the_journey, bio, greeting_video_url, skills, work_experience`,
    values,
  );

  return {
    published: true,
    user: r.rows[0],
    video_script_th: video_script_th || null,
  };
}
