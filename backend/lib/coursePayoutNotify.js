/**
 * Instructor notifications for course payout lifecycle (blocked release, etc.).
 */

export async function persistCourseNotification(pool, userId, { type, title, message, data = {} } = {}) {
  if (!userId || !pool) return { skipped: true };
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, data, created_at)
       VALUES ($1::uuid, $2, $3, $4, $5::jsonb, NOW())`,
      [String(userId), type || 'course_payout', title, message, JSON.stringify(data)],
    );
    return { ok: true };
  } catch (err) {
    if (String(err?.code) === '42P01') return { skipped: true, reason: 'notifications_table_missing' };
    console.warn('[coursePayoutNotify] persist failed:', err?.message);
    return { skipped: true, reason: err?.message };
  }
}

export async function notifyInstructorPayoutBlocked(
  pool,
  notifyUser,
  {
    instructorUserId,
    orderId,
    courseTitle = 'คอร์ส',
    instructorNet = 0,
    reason = 'insufficient_wallet_pending',
  },
) {
  if (!instructorUserId) return { skipped: true, reason: 'no_instructor' };

  const title = 'รายได้คอร์สถูก block ชั่วคราว';
  const amountText = Number(instructorNet || 0).toLocaleString('th-TH');
  const message = reason === 'insufficient_wallet_pending'
    ? `Order "${courseTitle}" ยอด ฿${amountText} ไม่สามารถ release ได้ — ยอด wallet pending ไม่ตรง ทีมงานจะตรวจสอบ`
    : `Order "${courseTitle}" ยอด ฿${amountText} ถูก block (${reason})`;

  const data = {
    notification_type: 'course_payout_blocked',
    order_id: orderId,
    course_title: courseTitle,
    reason,
    deep_link: `/courses/orders/${orderId}/receipt`,
  };

  await persistCourseNotification(pool, instructorUserId, {
    type: 'course_payout_blocked',
    title,
    message,
    data,
  });

  if (typeof notifyUser === 'function') {
    await notifyUser(String(instructorUserId), title, message, {
      fcm: { data: { ...data, deep_link: data.deep_link } },
    });
  }

  return { ok: true, instructorUserId: String(instructorUserId) };
}

export async function notifyInstructorPayoutBlockedBatch(pool, notifyUser, blocked = []) {
  const results = [];
  for (const row of blocked || []) {
    if (!row?.instructorUserId) continue;
    results.push(await notifyInstructorPayoutBlocked(pool, notifyUser, row));
  }
  return results;
}
