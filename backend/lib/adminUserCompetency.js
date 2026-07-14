/**
 * Admin — per-user skills, exam scores, enable/disable, direct notifications.
 */

export const PUBLIC_TRANSPORT_SKILL = 'Public Transport';

export function skillActiveSql(alias = '') {
  const p = alias ? `${alias}.` : '';
  return `COALESCE(${p}admin_enabled, TRUE) = TRUE`;
}

export async function getAdminUserCompetency(pool, userId) {
  const uid = String(userId);
  const [skillsRes, examsRes, kycRes] = await Promise.all([
    pool.query(
      `SELECT skill_name, skill_category, is_certified, COALESCE(admin_enabled, TRUE) AS admin_enabled,
              admin_disabled_reason, admin_disabled_at, certified_at, certification_id, total_jobs, success_rate, avg_rating
       FROM user_skills WHERE user_id = $1::uuid ORDER BY skill_name`,
      [uid],
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT module, category, score, passed, attempt, submitted_at, time_spent_seconds
       FROM user_exam_results WHERE user_id = $1::uuid ORDER BY module, category, submitted_at DESC`,
      [uid],
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT wants_public_transport, yellow_plate_photo_url,
              public_transport_license_front_url, public_transport_license_back_url
       FROM kyc_submissions WHERE user_id = $1::uuid
       ORDER BY submitted_at DESC NULLS LAST LIMIT 1`,
      [uid],
    ).catch(() => ({ rows: [] })),
  ]);

  const examByKey = new Map();
  for (const row of examsRes.rows || []) {
    const key = `${row.module}::${row.category || ''}`;
    if (!examByKey.has(key)) examByKey.set(key, row);
  }

  const allExams = [...examByKey.values()];
  const m1Exams = allExams.filter((e) => e.module === 1);
  const m2Exams = allExams.filter((e) => e.module === 2);
  const m3Exams = allExams.filter((e) => e.module === 3);
  const m2Passed = m2Exams.filter((e) => e.passed);
  const m2AttemptedCategories = [...new Set(m2Exams.map((e) => e.category).filter(Boolean))];
  const m2PassedCategories = [...new Set(m2Passed.map((e) => e.category).filter(Boolean))];
  const bestM1 = m1Exams.reduce(
    (best, e) => (!best || (e.score != null && e.score > (best.score ?? -1)) ? e : best),
    null,
  );

  return {
    skills: skillsRes.rows || [],
    exam_results: allExams,
    kyc_public_transport: kycRes.rows?.[0] || null,
    module_summary: {
      module1: bestM1
        ? {
          score: bestM1.score != null ? Number(bestM1.score) : null,
          passed: !!bestM1.passed,
          attempt: bestM1.attempt,
          submitted_at: bestM1.submitted_at,
        }
        : null,
      module2: {
        attempted_count: m2AttemptedCategories.length,
        passed_count: m2PassedCategories.length,
        attempted_categories: m2AttemptedCategories,
        passed_categories: m2PassedCategories,
        attempts: m2Exams.map((e) => ({
          category: e.category,
          score: e.score != null ? Number(e.score) : null,
          passed: !!e.passed,
          attempt: e.attempt,
          submitted_at: e.submitted_at,
        })),
      },
      module3: m3Exams[0]
        ? {
          score: m3Exams[0].score != null ? Number(m3Exams[0].score) : null,
          passed: !!m3Exams[0].passed,
          submitted_at: m3Exams[0].submitted_at,
        }
        : null,
    },
  };
}

export async function upsertAdminUserSkill(pool, userId, skillName, patch, adminId = 'admin') {
  const name = String(skillName || '').trim();
  if (!name) throw Object.assign(new Error('skill_name required'), { code: 'VALIDATION' });

  const uid = String(userId);
  const enabled = patch.admin_enabled !== false;
  const reason = patch.reason != null ? String(patch.reason).trim().slice(0, 2000) : null;

  const existing = await pool.query(
    `SELECT * FROM user_skills WHERE user_id = $1::uuid AND skill_name = $2 LIMIT 1`,
    [uid, name],
  );

  if (existing.rows?.length) {
    await pool.query(
      `UPDATE user_skills SET
         admin_enabled = $3,
         admin_disabled_reason = CASE WHEN $3 THEN NULL ELSE COALESCE($4, admin_disabled_reason) END,
         admin_disabled_at = CASE WHEN $3 THEN NULL ELSE COALESCE(admin_disabled_at, NOW()) END,
         admin_disabled_by = CASE WHEN $3 THEN NULL ELSE COALESCE($5, admin_disabled_by) END,
         is_certified = CASE WHEN $3 AND $6 THEN TRUE ELSE is_certified END,
         updated_at = NOW()
       WHERE user_id = $1::uuid AND skill_name = $2`,
      [uid, name, enabled, reason, adminId, !!patch.mark_certified],
    );
  } else {
    await pool.query(
      `INSERT INTO user_skills (user_id, skill_name, skill_category, is_certified, admin_enabled, admin_disabled_reason, admin_disabled_at, admin_disabled_by, certified_at)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, CASE WHEN $5 THEN NULL ELSE NOW() END, CASE WHEN $5 THEN NULL ELSE $7 END, CASE WHEN $4 THEN NOW() ELSE NULL END)`,
      [
        uid,
        name,
        patch.skill_category || (name === PUBLIC_TRANSPORT_SKILL ? 'Transport' : 'Admin'),
        enabled && !!patch.mark_certified,
        enabled,
        enabled ? null : reason,
        adminId,
      ],
    );
  }

  const row = await pool.query(
    `SELECT skill_name, skill_category, is_certified, COALESCE(admin_enabled, TRUE) AS admin_enabled,
            admin_disabled_reason, admin_disabled_at, certified_at
     FROM user_skills WHERE user_id = $1::uuid AND skill_name = $2`,
    [uid, name],
  );
  return row.rows?.[0] || null;
}

export async function insertAdminUserNotification(pool, userId, title, message, adminId, extra = {}) {
  const uid = await pool.query(
    `SELECT id::text FROM users WHERE id::text = $1 OR firebase_uid = $1 OR phone = $1 LIMIT 1`,
    [String(userId)],
  ).then((r) => r.rows?.[0]?.id || String(userId));

  const data = JSON.stringify({
    source: 'admin_direct',
    admin_id: adminId,
    reason: extra.reason || null,
    template: extra.template || null,
  });

  await pool.query(
    `INSERT INTO notifications (user_id, type, title, message, data, created_at)
     VALUES ($1::uuid, 'admin_message', $2, $3, $4::jsonb, NOW())`,
    [uid, String(title).slice(0, 200), String(message).slice(0, 4000), data],
  ).catch((e) => console.warn('[admin notify] DB insert failed:', e?.message));

  return uid;
}
