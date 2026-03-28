/**
 * Midnight reconciliation (Asia/Bangkok) + webhook outbox + monthly BOT compliance export.
 */
import { runNightlyGatewayReconciliation } from './internalGatewayReconciliation.js';
import { processGatewayWebhookOutbox } from './gatewayWebhookOutbox.js';
import { generateMonthlyComplianceReport } from './internalGatewayComplianceReport.js';

let lastReconBangkokDate = '';
let webhookTimer = null;
let reconTimer = null;
let complianceTimer = null;
const schedulerStartedAt = Date.now();
let lastWebhookProcessAt = /** @type {string | null} */ (null);
let lastWebhookDurationMs = 0;
let lastReconRunAt = /** @type {string | null} */ (null);
let lastComplianceReportAt = /** @type {string | null} */ (null);
/** @type {string} YYYY-MM of report period (previous calendar month, Bangkok) */
let lastComplianceReportPeriodKey = '';

/**
 * Heartbeat for /api/admin/internal-gateway/pulse
 */
export function getGatewaySchedulerHeartbeat() {
  return {
    schedulerStartedAt: new Date(schedulerStartedAt).toISOString(),
    lastWebhookProcessAt,
    lastWebhookDurationMs,
    lastReconRunAt,
    lastComplianceReportAt,
    lastComplianceReportPeriodKey,
    alive: !!(webhookTimer && reconTimer && complianceTimer),
  };
}

function bangkokDateString() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function inBangkokMidnightWindow() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
  return hour === 0 && minute < 6;
}

/**
 * First day of month 00:00–00:45 Asia/Bangkok — run monthly compliance snapshot for the previous month.
 */
function inBangkokFirstOfMonthComplianceWindow() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const day = parseInt(parts.find((p) => p.type === 'day')?.value || '0', 10);
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
  return day === 1 && hour === 0 && minute < 45;
}

/** Previous calendar month as YYYY-MM in Asia/Bangkok (the period compliance covers). */
function bangkokPreviousMonthYyyyMm() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(new Date());
  let y = parseInt(parts.find((p) => p.type === 'year')?.value || '0', 10);
  let m = parseInt(parts.find((p) => p.type === 'month')?.value || '0', 10);
  m -= 1;
  if (m < 1) {
    m = 12;
    y -= 1;
  }
  return `${y}-${String(m).padStart(2, '0')}`;
}

/**
 * @param {import('pg').Pool} pool
 */
export function startGatewayBackgroundServices(pool) {
  if (webhookTimer) clearInterval(webhookTimer);
  webhookTimer = setInterval(() => {
    const t0 = Date.now();
    processGatewayWebhookOutbox(pool)
      .then(() => {
        lastWebhookProcessAt = new Date().toISOString();
        lastWebhookDurationMs = Date.now() - t0;
      })
      .catch((e) => console.warn('[gateway-webhook]', e.message));
  }, 60_000);

  if (complianceTimer) clearInterval(complianceTimer);
  complianceTimer = setInterval(() => {
    try {
      if (!inBangkokFirstOfMonthComplianceWindow()) return;
      const periodKey = bangkokPreviousMonthYyyyMm();
      if (lastComplianceReportPeriodKey === periodKey) return;
      generateMonthlyComplianceReport(pool)
        .then((r) => {
          if (r.skipped || r.id) {
            lastComplianceReportPeriodKey = periodKey;
            lastComplianceReportAt = new Date().toISOString();
          }
          if (r.skipped) console.log('[gateway-compliance]', r.reason || 'skipped');
          else if (r.id) console.log('[gateway-compliance] filed', r.id);
        })
        .catch((e) => console.warn('[gateway-compliance]', e.message));
    } catch (e) {
      console.warn('[gateway-compliance-schedule]', e.message);
    }
  }, 60_000);

  if (reconTimer) clearInterval(reconTimer);
  reconTimer = setInterval(() => {
    try {
      if (!inBangkokMidnightWindow()) return;
      const d = bangkokDateString();
      if (lastReconBangkokDate === d) return;
      lastReconBangkokDate = d;
      runNightlyGatewayReconciliation(pool)
        .then((r) => {
          lastReconRunAt = new Date().toISOString();
          console.log('[gateway-recon]', r);
        })
        .catch((e) => console.warn('[gateway-recon]', e.message));
    } catch (e) {
      console.warn('[gateway-recon-schedule]', e.message);
    }
  }, 60_000);

  console.log(
    '🧩 Gateway: webhook outbox every 60s; nightly recon (Asia/Bangkok) in 00:00–00:05; monthly compliance on 1st 00:00–00:45 BKK'
  );

  setImmediate(() => {
    const t0 = Date.now();
    processGatewayWebhookOutbox(pool)
      .then(() => {
        lastWebhookProcessAt = new Date().toISOString();
        lastWebhookDurationMs = Date.now() - t0;
      })
      .catch((e) => console.warn('[gateway-webhook]', e.message));
  });

  setImmediate(() => {
    const periodKey = bangkokPreviousMonthYyyyMm();
    generateMonthlyComplianceReport(pool)
      .then((r) => {
        if (r.skipped || r.id) {
          lastComplianceReportPeriodKey = periodKey;
          lastComplianceReportAt = new Date().toISOString();
        }
        if (r.skipped) console.log('[gateway-compliance] startup', r.reason || 'skipped');
        else if (r.id) console.log('[gateway-compliance] startup filed', r.id);
      })
      .catch((e) => console.warn('[gateway-compliance]', e.message));
  });
}
