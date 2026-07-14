import https from 'https';
import http from 'http';
import { sendAlertEmail } from './alertNotifier.js';

function money(n) {
  return `฿${Number(n || 0).toLocaleString('th-TH')}`;
}

export async function getTodayCoursePurchaseRank(pool, courseId) {
  try {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS n
       FROM course_purchase_orders
       WHERE course_id = $1
         AND status = 'completed'
         AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'Asia/Bangkok')`,
      [courseId],
    );
    return Number(r.rows?.[0]?.n || 0);
  } catch {
    return 0;
  }
}

export function buildPurchaseSocialProof(todayRank) {
  const n = Number(todayRank || 0);
  if (n <= 0) return null;
  return {
    todayRank: n,
    message: n === 1
      ? 'คุณเป็นคนแรกที่ซื้อคอร์สนี้วันนี้'
      : `คุณเป็นคนที่ ${n} ที่ซื้อคอร์สนี้วันนี้`,
  };
}

export async function sendCoursePurchaseWebhook(payload) {
  const url = process.env.COURSE_PURCHASE_WEBHOOK_URL;
  if (!url) return { ok: false, skipped: true };
  return new Promise((resolve) => {
    try {
      const body = JSON.stringify(payload);
      const parsed = new URL(url);
      const lib = parsed.protocol === 'https:' ? https : http;
      const req = lib.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
          path: `${parsed.pathname}${parsed.search}`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            'X-AQOND-Event': 'course.purchase.completed',
          },
        },
        (res) => {
          res.on('data', () => {});
          res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300 }));
        },
      );
      req.on('error', (e) => resolve({ ok: false, error: e.message }));
      req.write(body);
      req.end();
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
}

export async function sendCoursePurchaseReceiptEmail(pool, {
  buyerId,
  order,
  course,
  quote,
  isGift,
  recipientName,
}) {
  try {
    const r = await pool.query(`SELECT email, full_name FROM users WHERE id = $1::uuid LIMIT 1`, [buyerId]);
    const user = r.rows?.[0];
    const to = user?.email;
    if (!to || !String(to).includes('@')) {
      return { ok: false, skipped: true, reason: 'no_email' };
    }
    const title = course?.title || 'AQOND Course';
    const gross = money(order?.gross_amount ?? quote?.grossAmount);
    const subject = isGift
      ? `[AQOND] ส่งคอร์ส "${title}" เป็นของขวัญแล้ว`
      : `[AQOND] ใบเสร็จซื้อคอร์ส — ${title}`;
    const text = isGift
      ? `สวัสดี ${user.full_name || 'คุณ'}\n\nคุณซื้อคอร์ส "${title}" เป็นของขวัญให้ ${recipientName || 'ผู้รับ'} เรียบร้อยแล้ว\nยอดชำระ: ${gross}\nOrder: ${order?.id}\n\n— AQOND Courses`
      : `สวัสดี ${user.full_name || 'คุณ'}\n\nขอบคุณที่ซื้อคอร์ส "${title}"\nยอดชำระ: ${gross}\nOrder: ${order?.id}\nReceipt: ${order?.id}\n\nเริ่มเรียนได้ทันทีในแอป AQOND\n\n— AQOND Courses`;
    return sendAlertEmail({ to, subject, text });
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function notifyCoursePurchaseComplete(pool, payload) {
  const socialProof = buildPurchaseSocialProof(
    payload.todayRank ?? (await getTodayCoursePurchaseRank(pool, payload.courseId)),
  );
  sendCoursePurchaseReceiptEmail(pool, payload).catch(() => {});
  sendCoursePurchaseWebhook({
    event: 'course.purchase.completed',
    ...payload,
    socialProof,
    at: new Date().toISOString(),
  }).catch(() => {});
  return { socialProof };
}
