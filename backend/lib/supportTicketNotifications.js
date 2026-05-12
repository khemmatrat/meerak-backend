/**
 * Notify admins & subscribed clients when support tickets change.
 * ENV: SUPPORT_SLACK_WEBHOOK_URL, SUPPORT_ALERT_EMAIL_TO (fallback ALERT_EMAIL_TO)
 */
import { sendFcmToTokens } from './fcmAdmin.js';
import { sendAlertEmail } from './alertNotifier.js';

function slackEscape(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function postSlack(text) {
  const url = process.env.SUPPORT_SLACK_WEBHOOK_URL;
  if (!url || url.includes('xxxx')) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (e) {
    console.warn('[support slack]', e?.message);
  }
}

async function loadAdminFcmTokens(pool) {
  try {
    const r = await pool.query(
      `SELECT token FROM fcm_tokens WHERE source = 'admin' AND token IS NOT NULL AND token != ''`
    );
    return (r.rows || []).map((x) => x.token).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * @param {import('socket.io').Server} io
 * @param {*} pool
 * @param {{ kind: string, ticket: Record<string, any>, snippet?: string, fromSender?: string }} detail
 */
export async function notifySupportStakeholders(io, pool, detail) {
  const { kind, ticket, snippet, fromSender } = detail;
  if (!ticket?.id) return;

  const isEmergency = !!ticket.isEmergency || !!ticket.is_emergency;
  const subject = ticket.subject || '(ไม่มีหัวข้อ)';
  const prefix = isEmergency ? '🆘 EMERGENCY Support' : '💬 Support';
  const title =
    kind === 'ticket_created'
      ? `${prefix}: ตั๋วใหม่`
      : kind === 'user_message'
        ? `${prefix}: ข้อความจากผู้ใช้`
        : kind === 'admin_message'
          ? `${prefix}: ตอบกลับจากทีม`
          : `${prefix}: อัปเดต`;

  const bodyLine = [
    ticket.id,
    subject,
    snippet ? `— ${String(snippet).slice(0, 140)}` : '',
    fromSender ? `(${fromSender})` : '',
  ]
    .filter(Boolean)
    .join(' ');

  try {
    io?.to?.('admin')?.emit?.('support_event', {
      kind,
      ticketId: ticket.id,
      isEmergency,
      subject,
      userId: ticket.userId,
    });
    io?.to?.(`support-ticket:${ticket.id}`)?.emit?.('support_messages_refresh', {
      ticketId: ticket.id,
      kind,
    });
  } catch (_) {}

  const adminFacing = kind === 'ticket_created' || kind === 'user_message';

  const tokens = adminFacing ? await loadAdminFcmTokens(pool) : [];
  if (adminFacing && tokens.length) {
    try {
      await sendFcmToTokens(tokens, {
        title: isEmergency ? `🆘 ${title}` : title,
        body: bodyLine.slice(0, 240),
      });
    } catch (e) {
      console.warn('[support FCM]', e?.message);
    }
  }

  const emailTo = process.env.SUPPORT_ALERT_EMAIL_TO || process.env.ALERT_EMAIL_TO;
  if (emailTo && adminFacing && (kind === 'ticket_created' || kind === 'user_message')) {
    await sendAlertEmail({
      to: emailTo,
      subject: `${isEmergency ? '[EMERGENCY] ' : ''}[AQOND Support] ${ticket.id}`,
      text: `${title}\n\n${bodyLine}\n\nเปิดใน Admin > Support Center`,
    });
  }

  const slackWorthy =
    adminFacing && (kind === 'ticket_created' || (kind === 'user_message' && isEmergency));
  if (slackWorthy && process.env.SUPPORT_SLACK_WEBHOOK_URL) {
    const t = `${title}\n${slackEscape(bodyLine)}${isEmergency ? '\n*PRIORITY: EMERGENCY / SAFETY*' : ''}`;
    await postSlack(t);
  }
}
