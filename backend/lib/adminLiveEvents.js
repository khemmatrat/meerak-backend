/**
 * Admin live events — แจ้งแอดมินแบบ real-time (poll) เช่น VIP ซื้อใหม่
 */

export async function ensureAdminLiveEventsSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_live_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_type VARCHAR(64) NOT NULL,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      title VARCHAR(200) NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      payload JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => { });
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_admin_live_events_created ON admin_live_events(created_at DESC)`,
  ).catch(() => { });
}

export async function insertAdminLiveEvent(pool, {
  event_type: eventType,
  user_id: userId,
  title,
  message,
  payload = {},
}) {
  const r = await pool.query(
    `INSERT INTO admin_live_events (event_type, user_id, title, message, payload)
     VALUES ($1, $2::uuid, $3, $4, $5::jsonb)
     RETURNING id, event_type, user_id, title, message, payload, created_at`,
    [
      String(eventType).slice(0, 64),
      userId || null,
      String(title || '').slice(0, 200),
      String(message || '').slice(0, 4000),
      JSON.stringify(payload || {}),
    ],
  );
  return r.rows[0];
}

export async function listAdminLiveEventsSince(pool, sinceIso, limit = 50) {
  const since = sinceIso ? new Date(sinceIso) : new Date(Date.now() - 5 * 60 * 1000);
  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
  const r = await pool.query(
    `SELECT e.id, e.event_type, e.user_id, e.title, e.message, e.payload, e.created_at,
            u.full_name, u.phone, u.email
     FROM admin_live_events e
     LEFT JOIN users u ON u.id = e.user_id
     WHERE e.created_at > $1
     ORDER BY e.created_at ASC
     LIMIT $2`,
    [since, lim],
  );
  return (r.rows || []).map((row) => ({
    id: row.id,
    event_type: row.event_type,
    user_id: row.user_id,
    title: row.title,
    message: row.message,
    payload: row.payload || {},
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
    user_name: row.full_name || row.phone || row.email || null,
  }));
}

export async function notifyAdminKycSubmitted(pool, {
  userId,
  submissionId,
  isSupplement = false,
}) {
  let userName = 'User';
  try {
    const u = await pool.query(
      `SELECT full_name, phone, email FROM users WHERE id = $1::uuid LIMIT 1`,
      [userId],
    );
    const row = u.rows[0];
    userName = row?.full_name || row?.phone || row?.email || userName;
  } catch (_) { /* noop */ }

  const eventType = isSupplement ? 'kyc_supplement_submitted' : 'kyc_submitted';
  const title = isSupplement
    ? 'KYC — ส่งเอกสารเพิ่ม (ป้ายเหลือง/ใบขับขี่สาธารณะ)'
    : 'KYC — ส่งยืนยันตัวตนครบชุด';
  const message = isSupplement
    ? `${userName} ส่งเอกสารเพิ่มตามที่แอดมินขอแล้ว — รอตรวจ`
    : `${userName} ส่งข้อมูลยืนยันตัวตน (KYC) ครบแล้ว — รอตรวจ`;

  return insertAdminLiveEvent(pool, {
    event_type: eventType,
    user_id: userId,
    title,
    message,
    payload: {
      submission_id: submissionId,
      is_supplement: !!isSupplement,
    },
  });
}

export async function notifyAdminVipPurchase(pool, {
  userId,
  tier,
  status,
  orderId,
  amount,
  startedAt,
  expiresAt,
}) {
  const tierLabel = String(tier || '').charAt(0).toUpperCase() + String(tier || '').slice(1);
  const isActive = status === 'active';
  const eventType = isActive ? 'vip_purchase_active' : 'vip_purchase_pending';
  const title = isActive
    ? `VIP ${tierLabel} — ชำระสำเร็จ`
    : `VIP ${tierLabel} — กำลังซื้อ`;
  const message = isActive
    ? `User สมัคร VIP ${tierLabel} แล้ว (${amount != null ? `${amount} ฿` : ''}) · เริ่ม ${startedAt ? new Date(startedAt).toLocaleString('th-TH') : '-'}`
    : `User กำลังสมัคร VIP ${tierLabel} — รอชำระ/ดำเนินการ`;

  return insertAdminLiveEvent(pool, {
    event_type: eventType,
    user_id: userId,
    title,
    message,
    payload: {
      tier,
      status,
      order_id: orderId,
      amount,
      started_at: startedAt,
      expires_at: expiresAt,
    },
  });
}
