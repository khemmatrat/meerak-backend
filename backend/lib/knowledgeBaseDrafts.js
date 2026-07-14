/**
 * knowledge_base_drafts — FAQ ที่ Minnie สร้างจากบทสนทนา (รอ Admin อนุมัติเข้า faq_knowledge)
 */

export async function ensureKnowledgeBaseDraftsTable(pool) {
  if (!pool) return false;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS knowledge_base_drafts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id VARCHAR(100),
        question TEXT NOT NULL,
        draft_answer TEXT NOT NULL,
        category VARCHAR(100) DEFAULT 'general',
        status VARCHAR(20) DEFAULT 'draft',
        created_by VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_kb_drafts_created ON knowledge_base_drafts(created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_kb_drafts_ticket ON knowledge_base_drafts(ticket_id)`);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_kb_drafts_open_question
      ON knowledge_base_drafts (lower(question), COALESCE(ticket_id, ''))
      WHERE status IS NULL OR status = 'draft'
    `);
    return true;
  } catch (e) {
    console.error('knowledgeBaseDrafts ensure:', e.message);
    return false;
  }
}

export async function insertKnowledgeDraft(pool, { ticket_id, question, draft_answer, category, created_by }) {
  if (!pool || !question || !draft_answer) return null;
  await ensureKnowledgeBaseDraftsTable(pool);
  const r = await pool.query(
    `INSERT INTO knowledge_base_drafts (ticket_id, question, draft_answer, category, status, created_by)
     VALUES ($1, $2, $3, $4, 'draft', $5)
     ON CONFLICT DO NOTHING
     RETURNING id, created_at`,
    [
      ticket_id || null,
      String(question).trim().slice(0, 2000),
      String(draft_answer).trim().slice(0, 12000),
      (category || 'general').slice(0, 100),
      created_by || null,
    ]
  );
  return r.rows[0] || null;
}

export async function listKnowledgeDrafts(pool, limit = 50) {
  if (!pool) return [];
  await ensureKnowledgeBaseDraftsTable(pool);
  const r = await pool.query(
    `SELECT id, ticket_id, question, draft_answer, category, status, created_by, created_at
     FROM knowledge_base_drafts
     WHERE status IS NULL OR status = 'draft'
     ORDER BY created_at DESC LIMIT $1`,
    [Math.min(limit, 200)]
  );
  return r.rows || [];
}

export async function getKnowledgeDraftById(pool, id) {
  if (!pool || !id) return null;
  await ensureKnowledgeBaseDraftsTable(pool);
  const r = await pool.query(`SELECT * FROM knowledge_base_drafts WHERE id = $1`, [id]);
  return r.rows[0] || null;
}

export async function markDraftPromoted(pool, id) {
  if (!pool || !id) return false;
  await ensureKnowledgeBaseDraftsTable(pool);
  const r = await pool.query(
    `UPDATE knowledge_base_drafts SET status = 'promoted' WHERE id = $1 AND (status IS NULL OR status = 'draft') RETURNING id`,
    [id]
  );
  return !!r.rows?.[0];
}
