/**
 * AI Correction Loop — เก็บ diff ระหว่างคำแนะนำ AI กับข้อความสุดท้ายของ Admin
 */

export async function ensureLearningFeedbackTable(pool) {
  if (!pool) return false;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS learning_feedback (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id VARCHAR(100),
        ai_suggestion TEXT,
        admin_final TEXT,
        edit_distance_ratio NUMERIC(5,4),
        created_by VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_learning_feedback_created_at ON learning_feedback(created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_learning_feedback_ticket ON learning_feedback(ticket_id)`);
    return true;
  } catch (err) {
    console.error('learningFeedback ensureLearningFeedbackTable:', err.message);
    return false;
  }
}

/** ค่าประมาณ 0–1 ว่าแก้ไขมากแค่ไหน (ย่อส่วนใช้ความยาวที่แตกต่าง) */
function roughEditRatio(a, b) {
  const s1 = String(a || '');
  const s2 = String(b || '');
  if (!s1.length && !s2.length) return 0;
  const maxLen = Math.max(s1.length, s2.length, 1);
  let diff = 0;
  const len = Math.min(s1.length, s2.length);
  for (let i = 0; i < len; i++) {
    if (s1[i] !== s2[i]) diff++;
  }
  diff += Math.abs(s1.length - s2.length);
  return Math.min(1, diff / maxLen);
}

export async function saveLearningFeedback(pool, { ticket_id, ai_suggestion, admin_final, created_by }) {
  if (!pool || !ai_suggestion || !admin_final) return null;
  const ai = String(ai_suggestion).trim();
  const fin = String(admin_final).trim();
  if (!ai.length || !fin.length || ai === fin) return null;
  await ensureLearningFeedbackTable(pool);
  const ratio = roughEditRatio(ai, fin);
  const r = await pool.query(
    `INSERT INTO learning_feedback (ticket_id, ai_suggestion, admin_final, edit_distance_ratio, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, created_at`,
    [
      ticket_id || null,
      ai.slice(0, 12000),
      fin.slice(0, 12000),
      ratio,
      created_by || null,
    ]
  );
  return r.rows[0] || null;
}
