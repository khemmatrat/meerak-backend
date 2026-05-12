/**
 * Support tickets persisted in PostgreSQL (replaces in-memory stores).
 */

export function newTicketId(prefix = 'TCK') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function newMessageId() {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function rowToApiTicket(row) {
  if (!row) return null;
  let attachments = [];
  const att = row.attachments;
  if (Array.isArray(att)) attachments = att;
  else if (att && typeof att === 'object') {
    try {
      attachments = JSON.parse(JSON.stringify(att));
    } catch {
      attachments = [];
    }
  }
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    full_name: row.full_name,
    phone: row.phone,
    subject: row.subject,
    status: row.status,
    priority: row.priority,
    category: row.category,
    source: row.source,
    jobId: row.job_id,
    use_insurance_claim: !!row.use_insurance_claim,
    ai_mode_enabled: !!row.ai_mode_enabled,
    invited_provider_id: row.invited_provider_id,
    invited_provider_name: row.invited_provider_name,
    attachments,
    ai_summary: row.ai_summary,
    sentiment_score: row.sentiment_score != null ? Number(row.sentiment_score) : null,
    sentiment_label: row.sentiment_label,
    lastUpdated: row.last_updated ? new Date(row.last_updated).toISOString() : new Date().toISOString(),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    assigned_to_admin_id: row.assigned_to_admin_id,
    assigned_to_name: row.assigned_to_name,
    assignedToAdminId: row.assigned_to_admin_id,
    assignedToName: row.assigned_to_name,
    waiting_on: row.waiting_on || 'none',
    waitingOn: row.waiting_on || 'none',
    first_admin_reply_at: row.first_admin_reply_at
      ? new Date(row.first_admin_reply_at).toISOString()
      : null,
    firstAdminReplyAt: row.first_admin_reply_at
      ? new Date(row.first_admin_reply_at).toISOString()
      : null,
    sla_due_at: row.sla_due_at ? new Date(row.sla_due_at).toISOString() : null,
    slaDueAt: row.sla_due_at ? new Date(row.sla_due_at).toISOString() : null,
    is_emergency: !!row.is_emergency,
    isEmergency: !!row.is_emergency,
    emergency_kind: row.emergency_kind || null,
    emergencyKind: row.emergency_kind || null,
  };
}

function rowToApiMessage(row) {
  if (!row) return null;
  const meta = row.meta && typeof row.meta === 'object' ? row.meta : {};
  return {
    id: row.id,
    ticketId: row.ticket_id,
    sender: row.sender,
    message: row.message,
    timestamp: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    ...(meta.source ? { source: meta.source } : {}),
    ...(meta.faqScore != null ? { faqScore: meta.faqScore } : {}),
    ...(meta.score != null ? { faqScore: meta.score } : {}),
  };
}

export async function insertTicket(pool, ticket) {
  const q = `
    INSERT INTO support_tickets (
      id, user_id, email, full_name, phone, subject, status, priority, category, source,
      job_id, use_insurance_claim, ai_mode_enabled, invited_provider_id, invited_provider_name,
      attachments, ai_summary, sentiment_score, sentiment_label, last_updated, created_at,
      waiting_on, sla_due_at, is_emergency, emergency_kind
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
      $11,$12,$13,$14,$15,
      $16::jsonb,$17,$18,$19,NOW(),NOW(),
      $20,$21,$22,$23
    )
    RETURNING *
  `;
  const vals = [
    ticket.id,
    ticket.user_id,
    ticket.email,
    ticket.full_name,
    ticket.phone,
    ticket.subject,
    ticket.status,
    ticket.priority,
    ticket.category,
    ticket.source,
    ticket.job_id,
    !!ticket.use_insurance_claim,
    !!ticket.ai_mode_enabled,
    ticket.invited_provider_id,
    ticket.invited_provider_name,
    JSON.stringify(Array.isArray(ticket.attachments) ? ticket.attachments : []),
    ticket.ai_summary,
    ticket.sentiment_score,
    ticket.sentiment_label,
    ticket.waiting_on || 'none',
    ticket.sla_due_at,
    !!ticket.is_emergency,
    ticket.emergency_kind || null,
  ];
  const r = await pool.query(q, vals);
  return rowToApiTicket(r.rows[0]);
}

export async function getTicketById(pool, id) {
  const r = await pool.query(`SELECT * FROM support_tickets WHERE id = $1`, [String(id)]);
  return rowToApiTicket(r.rows[0]);
}

export async function listTicketsForUser(pool, userId, limit = 50) {
  const r = await pool.query(
    `SELECT * FROM support_tickets WHERE user_id = $1 ORDER BY last_updated DESC LIMIT $2`,
    [String(userId), Math.min(limit, 100)]
  );
  return r.rows.map(rowToApiTicket);
}

export async function listTicketsAdmin(pool, { status, limit = 100 }) {
  const lim = Math.min(limit, 200);
  if (status === 'OPEN') {
    const r = await pool.query(
      `SELECT * FROM support_tickets WHERE status IN ('OPEN','IN_PROGRESS')
       ORDER BY is_emergency DESC, last_updated DESC LIMIT $1`,
      [lim]
    );
    return r.rows.map(rowToApiTicket);
  }
  if (status === 'RESOLVED') {
    const r = await pool.query(
      `SELECT * FROM support_tickets WHERE status IN ('RESOLVED','CLOSED')
       ORDER BY last_updated DESC LIMIT $1`,
      [lim]
    );
    return r.rows.map(rowToApiTicket);
  }
  if (status) {
    const r = await pool.query(
      `SELECT * FROM support_tickets WHERE status = $1 ORDER BY last_updated DESC LIMIT $2`,
      [status, lim]
    );
    return r.rows.map(rowToApiTicket);
  }
  const r = await pool.query(
    `SELECT * FROM support_tickets ORDER BY last_updated DESC LIMIT $1`,
    [lim]
  );
  return r.rows.map(rowToApiTicket);
}

export async function countOpenTickets(pool) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS c FROM support_tickets WHERE status IN ('OPEN','IN_PROGRESS')`
  );
  return r.rows[0]?.c ?? 0;
}

export async function ticketsForSentimentWindow(pool, hours) {
  const h = Math.min(Math.max(Number(hours) || 24, 1), 48);
  const r = await pool.query(
    `SELECT sentiment_score, last_updated, created_at FROM support_tickets
     WHERE last_updated >= NOW() - ($1::int * INTERVAL '1 hour')`,
    [h]
  );
  return (r.rows || []).map((row) => ({
    sentiment_score: row.sentiment_score,
    lastUpdated: row.last_updated,
    createdAt: row.created_at,
  }));
}

export async function insertMessage(pool, ticketId, sender, message, meta = {}) {
  const id = newMessageId();
  const r = await pool.query(
    `INSERT INTO support_messages (id, ticket_id, sender, message, meta, created_at)
     VALUES ($1,$2,$3,$4,$5::jsonb,NOW())
     RETURNING *`,
    [id, String(ticketId), sender, message, JSON.stringify(meta || {})]
  );
  await pool.query(`UPDATE support_tickets SET last_updated = NOW() WHERE id = $1`, [String(ticketId)]);
  return rowToApiMessage(r.rows[0]);
}

export async function listMessages(pool, ticketId) {
  const r = await pool.query(
    `SELECT * FROM support_messages WHERE ticket_id = $1 ORDER BY created_at ASC`,
    [String(ticketId)]
  );
  return r.rows.map(rowToApiMessage);
}

export async function updateTicketSentiment(pool, ticketId, score, label, priorityMaybe) {
  if (priorityMaybe) {
    await pool.query(
      `UPDATE support_tickets SET sentiment_score = $2, sentiment_label = $3, priority = $4, last_updated = NOW()
       WHERE id = $1`,
      [String(ticketId), score, label, priorityMaybe]
    );
  } else {
    await pool.query(
      `UPDATE support_tickets SET sentiment_score = $2, sentiment_label = $3, last_updated = NOW() WHERE id = $1`,
      [String(ticketId), score, label]
    );
  }
}

export async function patchTicket(pool, ticketId, patch) {
  const fields = [];
  const p = [String(ticketId)];
  let i = 2;
  const add = (col, val) => {
    fields.push(`${col} = $${i}`);
    p.push(val);
    i += 1;
  };
  if (typeof patch.ai_mode_enabled === 'boolean') add('ai_mode_enabled', patch.ai_mode_enabled);
  if (patch.status && ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(patch.status)) {
    add('status', patch.status);
  }
  if (patch.waiting_on && ['none', 'customer', 'internal'].includes(patch.waiting_on)) {
    add('waiting_on', patch.waiting_on);
  }
  if (patch.assigned_to_admin_id !== undefined) add('assigned_to_admin_id', patch.assigned_to_admin_id);
  if (patch.assigned_to_name !== undefined) add('assigned_to_name', patch.assigned_to_name);
  if (patch.invited_provider_id !== undefined) add('invited_provider_id', patch.invited_provider_id);
  if (patch.invited_provider_name !== undefined) add('invited_provider_name', patch.invited_provider_name);
  if (patch.ai_summary !== undefined) add('ai_summary', patch.ai_summary);
  if (Array.isArray(patch.attachments)) add('attachments', JSON.stringify(patch.attachments));
  if (fields.length === 0) return getTicketById(pool, ticketId);
  fields.push('last_updated = NOW()');
  await pool.query(`UPDATE support_tickets SET ${fields.join(', ')} WHERE id = $1`, p);
  return getTicketById(pool, ticketId);
}

export async function setFirstAdminReplyIfEmpty(pool, ticketId) {
  await pool.query(
    `UPDATE support_tickets SET first_admin_reply_at = COALESCE(first_admin_reply_at, NOW()), last_updated = NOW()
     WHERE id = $1`,
    [String(ticketId)]
  );
}

export async function mergeAiSummary(pool, ticketId, summaryExtra) {
  const t = await getTicketById(pool, ticketId);
  if (!t) return null;
  const next = [t.ai_summary, summaryExtra].filter(Boolean).join('\n\n');
  await pool.query(`UPDATE support_tickets SET ai_summary = $2, last_updated = NOW() WHERE id = $1`, [
    String(ticketId),
    next,
  ]);
  return getTicketById(pool, ticketId);
}
