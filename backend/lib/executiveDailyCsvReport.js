/**
 * Executive daily CSV report (financial snapshot) via email.
 * DB key: system_settings.executive_daily_report_schedule
 */
import { sendAlertEmail } from './alertNotifier.js';

const EXECUTIVE_DAILY_REPORT_SCHEDULE_KEY = 'executive_daily_report_schedule';
const DEFAULT_SCHEDULE = Object.freeze({
  enabled: false,
  send_time: '07:00',
  timezone: 'Asia/Bangkok',
  recipients: [],
  window_days: 30,
});

function toTzDateString(input = new Date(), timezone = 'Asia/Bangkok') {
  const d = input instanceof Date ? input : new Date(input);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function nowTzParts(input = new Date(), timezone = 'Asia/Bangkok') {
  const d = input instanceof Date ? input : new Date(input);
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(d);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    hm: `${map.hour}:${map.minute}`,
  };
}

function csvEscape(value) {
  const raw = String(value ?? '');
  return `"${raw.replace(/"/g, '""')}"`;
}

function toCsv(rows) {
  return `${rows.map((row) => row.map(csvEscape).join(',')).join('\n')}\n`;
}

function parseRecipients(raw) {
  if (Array.isArray(raw)) {
    return raw
      .map((s) => String(s || '').trim())
      .filter((s) => s.includes('@'));
  }
  return String(raw || '')
    .split(/[,\n;]/g)
    .map((s) => s.trim())
    .filter((s) => s.includes('@'));
}

function normalizeSendTime(value) {
  const m = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return DEFAULT_SCHEDULE.send_time;
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const min = Math.min(59, Math.max(0, Number(m[2])));
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function addDaysToDateString(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

export function resolveExecutiveDailyReportRecipients() {
  const raw =
    process.env.EXECUTIVE_DAILY_REPORT_EMAIL_TO ||
    process.env.OPS_WEEKLY_DIGEST_EMAIL_TO ||
    process.env.ALERT_EMAIL_TO ||
    '';
  return parseRecipients(raw);
}

export function normalizeExecutiveDailyReportSchedule(raw) {
  const out = JSON.parse(JSON.stringify(DEFAULT_SCHEDULE));
  if (raw && typeof raw === 'object') {
    if (typeof raw.enabled === 'boolean') out.enabled = raw.enabled;
    if (typeof raw.send_time === 'string') out.send_time = normalizeSendTime(raw.send_time);
    if (typeof raw.timezone === 'string' && raw.timezone.trim()) out.timezone = raw.timezone.trim();
    if (raw.recipients != null) out.recipients = parseRecipients(raw.recipients);
    if (raw.window_days != null) out.window_days = Math.min(30, Math.max(7, Number(raw.window_days) || 30));
  }
  if (!out.recipients.length) {
    out.recipients = resolveExecutiveDailyReportRecipients();
  }
  return out;
}

function computeNextRunPreview(schedule) {
  const timezone = schedule.timezone || 'Asia/Bangkok';
  if (!schedule.enabled) {
    return {
      next_run_local: null,
      next_run_date: null,
      next_run_time: null,
      next_run_timezone: timezone,
      next_run_note: 'Schedule is disabled',
    };
  }
  if (!schedule.recipients?.length) {
    return {
      next_run_local: null,
      next_run_date: null,
      next_run_time: null,
      next_run_timezone: timezone,
      next_run_note: 'No recipients configured',
    };
  }
  const now = nowTzParts(new Date(), timezone);
  const sendTime = normalizeSendTime(schedule.send_time);
  const runToday = now.hm < sendTime;
  const nextDate = runToday ? now.date : addDaysToDateString(now.date, 1);
  return {
    next_run_local: `${nextDate} ${sendTime}`,
    next_run_date: nextDate,
    next_run_time: sendTime,
    next_run_timezone: timezone,
    next_run_note: runToday ? 'Today' : 'Tomorrow',
  };
}

async function ensureExecutiveReportLogTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS executive_daily_report_log (
      id BIGSERIAL PRIMARY KEY,
      report_key TEXT NOT NULL UNIQUE,
      report_date DATE NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => { });
}

/**
 * @param {import('pg').Pool} pool
 */
export async function getExecutiveDailyReportSchedule(pool) {
  const r = await pool
    .query(`SELECT value FROM system_settings WHERE key = $1 LIMIT 1`, [EXECUTIVE_DAILY_REPORT_SCHEDULE_KEY])
    .catch(() => ({ rows: [] }));
  let parsed = null;
  const raw = r?.rows?.[0]?.value;
  if (raw != null) {
    try {
      parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (_) {
      parsed = null;
    }
  }
  return normalizeExecutiveDailyReportSchedule(parsed);
}

/**
 * @param {import('pg').Pool} pool
 * @param {Partial<{ enabled: boolean, send_time: string, timezone: string, recipients: string[] | string, window_days: number }>} patch
 */
export async function updateExecutiveDailyReportSchedule(pool, patch = {}) {
  const current = await getExecutiveDailyReportSchedule(pool);
  const merged = normalizeExecutiveDailyReportSchedule({
    ...current,
    ...patch,
    recipients: patch.recipients == null ? current.recipients : patch.recipients,
  });
  await pool.query(
    `INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [EXECUTIVE_DAILY_REPORT_SCHEDULE_KEY, JSON.stringify(merged)],
  );
  return merged;
}

/**
 * @param {import('pg').Pool} pool
 */
export async function getExecutiveDailyReportScheduleStatus(pool) {
  const schedule = await getExecutiveDailyReportSchedule(pool);
  await ensureExecutiveReportLogTable(pool);
  const last = await pool.query(
    `SELECT report_date, created_at, payload
     FROM executive_daily_report_log
     ORDER BY created_at DESC
     LIMIT 1`,
  ).catch(() => ({ rows: [] }));
  const row = last.rows?.[0] || null;
  const next = computeNextRunPreview(schedule);
  return {
    ...schedule,
    last_sent_at: row?.created_at ? new Date(row.created_at).toISOString() : null,
    last_report_date: row?.report_date || null,
    last_payload: row?.payload || null,
    ...next,
  };
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ reportDate?: string, force?: boolean, windowDays?: number, recipients?: string[] }} opts
 */
export async function sendExecutiveDailyCsvReport(pool, opts = {}) {
  const recipients = parseRecipients(opts.recipients || resolveExecutiveDailyReportRecipients());
  if (!recipients.length) {
    return { sent: false, reason: 'no_recipients' };
  }

  const reportDate = String(opts.reportDate || '').trim() || toTzDateString(new Date(), 'Asia/Bangkok');
  const windowDays = Math.min(30, Math.max(7, Number(opts.windowDays || process.env.EXECUTIVE_DAILY_REPORT_WINDOW_DAYS || 30)));
  const reportKey = `executive-daily:${reportDate}`;

  await ensureExecutiveReportLogTable(pool);
  if (!opts.force) {
    const dup = await pool.query(
      `SELECT 1 FROM executive_daily_report_log WHERE report_key = $1`,
      [reportKey],
    ).catch(() => ({ rows: [] }));
    if (dup.rows?.length) {
      return { sent: false, reason: 'deduped', report_key: reportKey, report_date: reportDate };
    }
  }

  const rangeRow = await pool.query(
    `SELECT ($1::date - (($2::int - 1) * INTERVAL '1 day'))::date AS from_date`,
    [reportDate, windowDays],
  ).catch(() => ({ rows: [{ from_date: reportDate }] }));
  const fromDate = rangeRow.rows?.[0]?.from_date || reportDate;

  const report = await pool.query(
    `WITH days AS (
       SELECT d::date AS day
       FROM generate_series($1::date, $2::date, INTERVAL '1 day') d
     ),
     pr AS (
       SELECT
         (created_at AT TIME ZONE 'Asia/Bangkok')::date AS day,
         COALESCE(SUM(CASE WHEN source_type IN ('deposit_margin_truemoney', 'deposit_margin_card') THEN amount ELSE 0 END), 0)::numeric AS revenue_b,
         COALESCE(SUM(CASE WHEN source_type = 'withdrawal_fee_margin' THEN amount ELSE 0 END), 0)::numeric AS revenue_c
       FROM platform_revenues
       WHERE (created_at AT TIME ZONE 'Asia/Bangkok')::date BETWEEN $1::date AND $2::date
       GROUP BY (created_at AT TIME ZONE 'Asia/Bangkok')::date
     ),
     commission AS (
       SELECT
         (created_at AT TIME ZONE 'Asia/Bangkok')::date AS day,
         COALESCE(SUM(CASE
           WHEN event_type = 'escrow_held' AND (metadata->>'leg') = 'commission' THEN amount
           WHEN event_type = 'escrow_refunded' AND (metadata->>'leg') = 'commission_reversed' THEN -amount
           WHEN event_type IN ('booking_fee', 'vip_subscription', 'post_job_fee', 'branding_package_payout') THEN amount
           ELSE 0
         END), 0)::numeric AS revenue_a
       FROM payment_ledger_audit
       WHERE (created_at AT TIME ZONE 'Asia/Bangkok')::date BETWEEN $1::date AND $2::date
       GROUP BY (created_at AT TIME ZONE 'Asia/Bangkok')::date
     )
     SELECT
       days.day,
       COALESCE(commission.revenue_a, 0)::float8 AS revenue_a_commission,
       COALESCE(pr.revenue_b, 0)::float8 AS revenue_b_deposit_margin,
       COALESCE(pr.revenue_c, 0)::float8 AS revenue_c_withdrawal_margin
     FROM days
     LEFT JOIN commission ON commission.day = days.day
     LEFT JOIN pr ON pr.day = days.day
     ORDER BY days.day ASC`,
    [fromDate, reportDate],
  ).catch(() => ({ rows: [] }));

  const rows = report.rows || [];
  const totals = rows.reduce(
    (acc, row) => {
      acc.revenueA += Number(row.revenue_a_commission || 0);
      acc.revenueB += Number(row.revenue_b_deposit_margin || 0);
      acc.revenueC += Number(row.revenue_c_withdrawal_margin || 0);
      return acc;
    },
    { revenueA: 0, revenueB: 0, revenueC: 0 },
  );

  const csvRows = [
    ['Executive Daily Financial CSV', '', '', '', '', ''],
    ['Report Date', reportDate, '', '', '', ''],
    ['Window', `${windowDays} days`, '', '', '', ''],
    ['From Date', String(fromDate), '', '', '', ''],
    ['To Date', reportDate, '', '', '', ''],
    [],
    ['Date', 'Revenue A Commission (THB)', 'Revenue B Deposit Margin (THB)', 'Revenue C Withdrawal Margin (THB)', 'Fee Margin B+C (THB)', 'Total A+B+C (THB)'],
    ...rows.map((r) => {
      const a = Number(r.revenue_a_commission || 0);
      const b = Number(r.revenue_b_deposit_margin || 0);
      const c = Number(r.revenue_c_withdrawal_margin || 0);
      return [String(r.day), a.toFixed(2), b.toFixed(2), c.toFixed(2), (b + c).toFixed(2), (a + b + c).toFixed(2)];
    }),
    [],
    ['TOTAL', totals.revenueA.toFixed(2), totals.revenueB.toFixed(2), totals.revenueC.toFixed(2), (totals.revenueB + totals.revenueC).toFixed(2), (totals.revenueA + totals.revenueB + totals.revenueC).toFixed(2)],
  ];

  const csv = toCsv(csvRows);
  const filename = `executive-daily-financial-${reportDate}.csv`;
  const to = recipients.join(',');
  const subject = `[MEERAK] Executive Daily CSV Report — ${reportDate}`;
  const text =
    `Executive daily financial CSV report\n` +
    `Date: ${reportDate}\n` +
    `Window: ${windowDays} days\n` +
    `Revenue A: ${totals.revenueA.toFixed(2)} THB\n` +
    `Revenue B: ${totals.revenueB.toFixed(2)} THB\n` +
    `Revenue C: ${totals.revenueC.toFixed(2)} THB\n` +
    `Sent at: ${new Date().toISOString()}`;

  const emailRes = await sendAlertEmail({
    to,
    subject,
    text,
    attachments: [
      {
        filename,
        content: csv,
        contentType: 'text/csv; charset=utf-8',
      },
    ],
  });

  if (!emailRes?.ok) {
    return {
      sent: false,
      reason: emailRes?.error || 'email_failed',
      report_key: reportKey,
      report_date: reportDate,
    };
  }

  await pool.query(
    `INSERT INTO executive_daily_report_log (report_key, report_date, payload)
     VALUES ($1, $2::date, $3::jsonb)
     ON CONFLICT (report_key) DO UPDATE SET payload = EXCLUDED.payload, created_at = NOW()`,
    [
      reportKey,
      reportDate,
      JSON.stringify({
        recipients,
        window_days: windowDays,
        row_count: rows.length,
        totals,
      }),
    ],
  ).catch(() => { });

  return {
    sent: true,
    report_key: reportKey,
    report_date: reportDate,
    recipients,
    window_days: windowDays,
    row_count: rows.length,
    totals,
  };
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ tickMs?: number }} opts
 */
export function startExecutiveDailyReportScheduler(pool, opts = {}) {
  const tickMs = Math.max(60 * 1000, Number(opts.tickMs || 5 * 60 * 1000));
  const tick = async () => {
    try {
      const schedule = await getExecutiveDailyReportSchedule(pool);
      if (!schedule.enabled || !schedule.recipients.length) return;
      const now = nowTzParts(new Date(), schedule.timezone || 'Asia/Bangkok');
      if (now.hm < schedule.send_time) return;
      const result = await sendExecutiveDailyCsvReport(pool, {
        reportDate: now.date,
        force: false,
        windowDays: schedule.window_days,
        recipients: schedule.recipients,
      });
      if (result.sent) {
        console.log(`[executive-daily-report] sent ${result.report_date} to ${schedule.recipients.length} recipients`);
      }
    } catch (e) {
      console.warn('[executive-daily-report:scheduler]', e?.message || e);
    }
  };
  const timer = setInterval(() => {
    void tick();
  }, tickMs);
  void tick();
  return () => clearInterval(timer);
}
