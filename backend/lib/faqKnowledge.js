/**
 * FAQ Knowledge Base — Learning System สำหรับ Support Chat
 * ค้นหาและบันทึก Best Answer จาก Admin
 */

/** แยกคำจากข้อความ (รองรับไทยและอังกฤษ) */
function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return (text.match(/[\u0E00-\u0E7F]+|\w+/g) || []).filter((w) => w.length > 1).map((w) => w.toLowerCase());
}

/**
 * Smart Match: คำนวณคะแนนความคล้ายคลึงจาก Keyword Match
 * @returns { { question, best_answer, category, score } | null } score 0-1
 */
async function searchFaq(pool, userQuery) {
  if (!pool || !userQuery || typeof userQuery !== 'string') return null;
  const query = userQuery.trim();
  if (!query) return null;

  try {
    const rows = await pool.query(
      `SELECT id, question, best_answer, category FROM faq_knowledge ORDER BY created_at DESC LIMIT 100`
    );
    if (!rows.rows?.length) return null;

    const queryTokens = new Set(tokenize(query));
    let best = { score: 0, row: null };

    for (const row of rows.rows) {
      const qTokens = new Set(tokenize(row.question));
      const intersection = [...queryTokens].filter((t) => qTokens.has(t)).length;
      const score = queryTokens.size > 0 ? intersection / queryTokens.size : 0;
      if (score > best.score) best = { score, row };
    }

    if (best.row && best.score >= 0.4) {
      return {
        question: best.row.question,
        best_answer: best.row.best_answer,
        category: best.row.category || 'general',
        score: best.score,
      };
    }
    return null;
  } catch (err) {
    console.error('faqKnowledge searchFaq error:', err.message);
    return null;
  }
}

/**
 * สร้างตาราง faq_knowledge ถ้ายังไม่มี (auto-migrate)
 */
async function ensureFaqTableExists(pool) {
  if (!pool) return false;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS faq_knowledge (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        question TEXT NOT NULL,
        best_answer TEXT NOT NULL,
        category VARCHAR(100) DEFAULT 'general',
        ticket_id VARCHAR(100),
        created_by VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_faq_knowledge_category ON faq_knowledge(category)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_faq_knowledge_created_at ON faq_knowledge(created_at DESC)`);
    return true;
  } catch (err) {
    console.error('faqKnowledge ensureFaqTableExists error:', err.message);
    return false;
  }
}

/**
 * บันทึก Best Answer จาก Admin
 */
async function saveFaq(pool, { question, best_answer, category, ticket_id, created_by }) {
  if (!pool || !question || !best_answer) return null;
  try {
    await ensureFaqTableExists(pool);
    const r = await pool.query(
      `INSERT INTO faq_knowledge (question, best_answer, category, ticket_id, created_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id, question, best_answer, category, created_at`,
      [
        String(question).trim().slice(0, 2000),
        String(best_answer).trim().slice(0, 10000),
        (category || 'general').slice(0, 100),
        ticket_id || null,
        created_by || null,
      ]
    );
    return r.rows[0] || null;
  } catch (err) {
    console.error('faqKnowledge saveFaq error:', err.message, err.code);
    return null;
  }
}

/**
 * รายการทั้งหมดใน FAQ Knowledge Base
 */
async function listFaq(pool) {
  if (!pool) return [];
  try {
    await ensureFaqTableExists(pool);
    const r = await pool.query(
      `SELECT id, question, best_answer, category, ticket_id, created_by, created_at
       FROM faq_knowledge ORDER BY created_at DESC`
    );
    return r.rows || [];
  } catch (err) {
    console.error('faqKnowledge listFaq error:', err.message);
    return [];
  }
}

/**
 * ลบรายการจาก FAQ Knowledge Base
 */
async function deleteFaq(pool, id) {
  if (!pool || !id) return false;
  try {
    const r = await pool.query(`DELETE FROM faq_knowledge WHERE id = $1 RETURNING id`, [id]);
    return (r.rowCount || 0) > 0;
  } catch (err) {
    console.error('faqKnowledge deleteFaq error:', err.message);
    return false;
  }
}

export { searchFaq, saveFaq, listFaq, deleteFaq, tokenize };
