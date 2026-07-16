/**
 * Rider face incident alerts — Nexus Admin webhook + email fallback.
 */
import { sendAlertEmail } from './alertNotifier.js';

export async function notifyRiderFaceIncident(incident) {
  const url =
    process.env.RIDER_FACE_INCIDENT_WEBHOOK_URL ||
    process.env.ADMIN_SECURITY_WEBHOOK_URL ||
    process.env.KYC_SUBMISSION_OPS_WEBHOOK_URL ||
    '';
  const payload = {
    type: 'rider_face_incident',
    severity: incident.severity || 'high',
    incident_type: incident.incident_type,
    rider_id: incident.rider_id,
    user_id: incident.user_id,
    match_score: incident.match_score,
    rider_suspended: incident.rider_suspended,
    created_at: new Date().toISOString(),
    metadata: incident.metadata || {},
  };

  let notified = false;
  if (url) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      const secret =
        process.env.RIDER_FACE_INCIDENT_WEBHOOK_SECRET ||
        process.env.ADMIN_SECURITY_WEBHOOK_SECRET;
      if (secret) headers['X-Webhook-Secret'] = secret;
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      });
      notified = res.ok;
    } catch (e) {
      console.warn('RIDER_FACE_INCIDENT webhook failed:', e?.message || e);
    }
  }

  const emailTo =
    process.env.RIDER_FACE_ALERT_EMAIL ||
    process.env.ADMIN_LOGIN_ALERT_EMAIL ||
    process.env.ALERT_EMAIL_TO;
  if (emailTo) {
    try {
      await sendAlertEmail({
        to: emailTo,
        subject: `[Rider Face] ${incident.incident_type} — ${incident.rider_id}`,
        text: JSON.stringify(payload, null, 2),
      });
      notified = true;
    } catch (e) {
      console.warn('RIDER_FACE alert email failed:', e?.message || e);
    }
  }

  return notified;
}
