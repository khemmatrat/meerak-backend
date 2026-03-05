/**
 * Alert Notifier — Line Notify + Email เมื่อเกิด Reconcile Alert
 * ENV: LINE_NOTIFY_TOKEN, ALERT_EMAIL_TO, SMTP_* (optional)
 */
import https from 'https';

/**
 * ส่ง Line Notify
 * @param {string} message - ข้อความส่งไป Line
 * @returns {Promise<{ ok: boolean; error?: string }>}
 */
export async function sendLineNotify(message) {
  const token = process.env.LINE_NOTIFY_TOKEN;
  if (!token || token.includes('xxxx')) return { ok: false, error: 'LINE_NOTIFY_TOKEN not configured' };
  return new Promise((resolve) => {
    const body = new URLSearchParams({ message }).toString();
    const req = https.request(
      {
        hostname: 'notify-api.line.me',
        path: '/api/notify',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Bearer ${token}`,
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ ok: true });
          } else {
            resolve({ ok: false, error: `Line Notify ${res.statusCode}: ${data}` });
          }
        });
      }
    );
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.write(body);
    req.end();
  });
}

/**
 * ส่ง Email ผ่าน SMTP (nodemailer ถ้ามี)
 * @param {object} opts - { to, subject, text }
 */
export async function sendAlertEmail(opts) {
  const to = opts?.to || process.env.ALERT_EMAIL_TO;
  if (!to) return { ok: false, error: 'ALERT_EMAIL_TO not configured' };
  try {
    let createTransport;
    try {
      ({ createTransport } = await import('nodemailer'));
    } catch {
      return { ok: false, error: 'nodemailer not installed (npm i nodemailer)' };
    }
    const transport = createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
    await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER || 'alert@aqond.com',
      to,
      subject: opts.subject || '[AQOND] Reconcile Alert',
      text: opts.text || opts.body,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * แจ้งเตือนเมื่อเกิด Reconcile Alert
 * @param {object} alert - { omise_balance_thb, platform_balance_thb, diff_thb }
 */
export async function notifyReconcileAlert(alert) {
  const msg = `🚨 [AQOND] Reconcile Alert — ยอดเงินไม่ตรง!\n` +
    `Omise: ฿${Number(alert.omise_balance_thb || 0).toLocaleString()}\n` +
    `Platform: ฿${Number(alert.platform_balance_thb || 0).toLocaleString()}\n` +
    `ต่าง: ฿${Number(alert.diff_thb || 0).toLocaleString()}\n` +
    `กรุณาตรวจสอบที่ Admin > Security Center`;
  const results = [];
  const lineRes = await sendLineNotify(msg);
  results.push({ channel: 'Line', ok: lineRes.ok, error: lineRes.error });
  if (process.env.ALERT_EMAIL_TO) {
    const emailRes = await sendAlertEmail({
      to: process.env.ALERT_EMAIL_TO,
      subject: '[AQOND] Reconcile Alert — ยอดเงินไม่ตรง',
      text: msg.replace(/\n/g, '\r\n'),
    });
    results.push({ channel: 'Email', ok: emailRes.ok, error: emailRes.error });
  }
  return results;
}
