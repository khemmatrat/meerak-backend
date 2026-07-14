/**

 * Alert Slack/Discord + email fallback when user wallet reconcile fails (variance warn).

 * Env: SLACK_WEBHOOK_URL, DISCORD_WEBHOOK_URL, RECONCILE_ALERT_WEBHOOK_URL,

 *      RECONCILE_ALERT_EMAIL_TO or ALERT_EMAIL_TO, SMTP_*

 * Dedupe: one alert per user per day per variance bucket via reconcile_alert_log.

 */

import { sendAlertEmail } from './alertNotifier.js';



function num(v) {

  const n = parseFloat(v);

  return Number.isFinite(n) ? n : 0;

}



function resolveWebhookUrl() {

  const slack = String(process.env.SLACK_WEBHOOK_URL || '').trim();

  if (slack) return { url: slack, kind: 'slack' };

  const discord = String(process.env.DISCORD_WEBHOOK_URL || '').trim();

  if (discord) return { url: discord, kind: 'discord' };

  const generic = String(process.env.RECONCILE_ALERT_WEBHOOK_URL || '').trim();

  if (generic) return { url: generic, kind: generic.includes('discord.com') ? 'discord' : 'slack' };

  return null;

}



function resolveAlertEmailTo() {

  return String(process.env.RECONCILE_ALERT_EMAIL_TO || process.env.ALERT_EMAIL_TO || '').trim() || null;

}



function buildMessage(payload) {

  const lines = [

    '🚨 *MEERAK Reconcile FAIL*',

    `User: \`${payload.user_id}\``,

    payload.email ? `Email: ${payload.email}` : null,

    payload.case_id ? `Case: \`${payload.case_id}\`` : null,

    `Expected: ฿${num(payload.expected_balance).toLocaleString('en-US')}`,

    `Actual: ฿${num(payload.actual_balance).toLocaleString('en-US')}`,

    `Variance: ฿${num(payload.variance).toLocaleString('en-US')}`,

    payload.admin_url ? `Admin: ${payload.admin_url}` : null,

    `Time: ${new Date().toISOString()}`,

  ].filter(Boolean);

  return lines.join('\n');

}



function buildPlainEmailText(payload) {

  return buildMessage(payload).replace(/\*/g, '');

}



async function postWebhook(url, kind, text) {

  const body =

    kind === 'discord'

      ? { content: text.slice(0, 1900) }

      : { text: text.slice(0, 3900) };

  const res = await fetch(url, {

    method: 'POST',

    headers: { 'Content-Type': 'application/json' },

    body: JSON.stringify(body),

  });

  const snippet = await res.text().catch(() => '');

  return { status: res.status, snippet: snippet.slice(0, 200) };

}



/**

 * @param {import('pg').Pool} pool

 * @param {{

 *   userId: string,

 *   email?: string,

 *   caseId?: string,

 *   expected_balance: number,

 *   actual_balance: number,

 *   variance: number,

 *   status: string,

 * }} reconcile

 */

export async function maybeAlertReconcileFail(pool, reconcile) {

  if (!reconcile || reconcile.status !== 'warn') return { sent: false, reason: 'not_warn' };

  const variance = Math.abs(num(reconcile.variance));

  if (variance < 0.01) return { sent: false, reason: 'zero_variance' };



  const hook = resolveWebhookUrl();

  const emailTo = resolveAlertEmailTo();

  if (!hook && !emailTo) return { sent: false, reason: 'no_webhook_or_email_configured' };



  const userId = String(reconcile.userId || '').trim();

  const day = new Date().toISOString().slice(0, 10);

  const bucket = Math.floor(variance);

  const alertKey = `${day}:v${bucket}`;



  try {

    const dup = await pool.query(

      `SELECT id FROM reconcile_alert_log WHERE user_id = $1::uuid AND alert_key = $2`,

      [userId, alertKey],

    );

    if (dup.rows?.length) return { sent: false, reason: 'deduped', alert_key: alertKey };

  } catch (e) {

    if (String(e?.code) === '42P01') return { sent: false, reason: 'table_missing' };

    throw e;

  }



  const adminBase = String(process.env.ADMIN_APP_URL || process.env.ADMIN_URL || 'http://localhost:5173').replace(/\/$/, '');

  const msgPayload = {

    user_id: userId,

    email: reconcile.email,

    case_id: reconcile.caseId,

    expected_balance: reconcile.expected_balance,

    actual_balance: reconcile.actual_balance,

    variance: reconcile.variance,

    admin_url: `${adminBase}/?focusUserId=${encodeURIComponent(userId)}`,

  };

  const text = buildMessage(msgPayload);

  const plainText = buildPlainEmailText(msgPayload);



  let httpStatus = 0;

  let snippet = '';

  let webhookKind = hook?.kind || null;



  if (hook) {

    try {

      const r = await postWebhook(hook.url, hook.kind, text);

      httpStatus = r.status;

      snippet = r.snippet;

    } catch (e) {

      snippet = String(e?.message || e).slice(0, 200);

      httpStatus = 0;

    }

  }



  const slackSent = httpStatus >= 200 && httpStatus < 300;

  let emailStatus = null;

  let emailError = null;

  let emailSent = false;



  if ((!hook || !slackSent) && emailTo) {

    const emailRes = await sendAlertEmail({

      to: emailTo,

      subject: `[MEERAK] Reconcile FAIL — ${userId.slice(0, 8)}`,

      text: plainText,

    });

    emailSent = !!emailRes.ok;

    emailStatus = emailSent ? 200 : 0;

    emailError = emailRes.ok ? null : (emailRes.error || 'email_failed').slice(0, 200);

  }



  try {

    await pool.query(

      `INSERT INTO reconcile_alert_log (

         user_id, alert_key, variance, webhook_url_kind, http_status, response_snippet,

         payload, email_status, email_error

       )

       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)

       ON CONFLICT (user_id, alert_key) DO NOTHING`,

      [

        userId,

        alertKey,

        reconcile.variance,

        webhookKind,

        httpStatus,

        snippet,

        JSON.stringify({

          expected: reconcile.expected_balance,

          actual: reconcile.actual_balance,

          email_to: emailTo || null,

          email_sent: emailSent,

        }),

        emailStatus,

        emailError,

      ],

    );

  } catch {

    /* non-fatal */

  }



  return {

    sent: slackSent || emailSent,

    slack_sent: slackSent,

    email_sent: emailSent,

    http_status: httpStatus,

    alert_key: alertKey,

    webhook_kind: webhookKind,

    email_error: emailError,

  };

}

