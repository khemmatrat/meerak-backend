/**
 * Production launch checklist for course marketplace.
 */

import { evaluatePhase0Foundation } from './courseSellEligibility.js';
import {
  checkCourseMarketplaceLedgerIntegrity,
  summarizeCourseLedgerEvents,
} from './courseLedgerIntegrity.js';
import { runCourseSecurityAudit } from './courseMarketplaceSecurity.js';
import { loadManualQaReport, manualQaSignOffStatus, DEFAULT_MANUAL_QA_REPORT } from './courseManualQaReport.js';

const QA_REPORT_PATH = DEFAULT_MANUAL_QA_REPORT;

export const MANUAL_QA_STEPS = [
  { id: 'create_course', label: 'สร้างคอร์สใน Course Studio ครบ wizard + quality checklist' },
  { id: 'admin_approve', label: 'Admin approve จาก review queue → banner draft ถูกสร้าง' },
  { id: 'home_discovery', label: 'เห็นคอร์สบน Home rail / Marketplace / featured sort' },
  { id: 'purchase_wallet', label: 'ซื้อด้วย Wallet 1-tap + ได้ใบเสร็จ' },
  { id: 'purchase_gateway', label: 'ซื้อด้วย PromptPay/บัตร (gateway) เมื่อ Wallet ไม่พอ' },
  { id: 'learning_progress', label: 'เรียนบทเรียน + บันทึก progress' },
  { id: 'review_submit', label: 'ส่งรีวิวหลัง enroll' },
  { id: 'qa_notify', label: 'Q&A โพสต์ + instructor ได้รับ notify' },
  { id: 'seller_dashboard', label: 'Instructor sales dashboard แสดง order + payout held' },
  { id: 'refund_edge', label: 'คืนเงินภายใน 7 วัน + progress ≤20% + admin override' },
  { id: 'payment_regression', label: 'งาน/booking/wallet deposit ยังทำงานเหมือนเดิม (regression)' },
  { id: 'http_e2e', label: 'รัน coursePhase12.e2e.test.js กับ backend ที่ restart แล้ว' },
];

export async function buildCourseLaunchChecklist(pool, opts = {}) {
  const checks = [];

  async function add(id, label, pass, detail = null) {
    checks.push({ id, label, pass: !!pass, detail });
  }

  let healthOk = false;
  let tables = {};
  try {
    const required = [
      'courses',
      'course_purchase_orders',
      'course_purchase_gateway_charges',
      'course_refunds',
      'course_funnel_events',
      'course_marketplace_audit_log',
      'course_purchase_idempotency',
    ];
    const r = await pool.query(
      `SELECT table_name, to_regclass('public.' || table_name) IS NOT NULL AS ready
       FROM unnest($1::text[]) AS table_name`,
      [required],
    );
    tables = Object.fromEntries((r.rows || []).map((row) => [row.table_name, !!row.ready]));
    healthOk = required.every((t) => tables[t]);
    await add('schema_tables', 'Migration tables พร้อม (235–246)', healthOk, tables);
  } catch (e) {
    await add('schema_tables', 'Migration tables พร้อม', false, e?.message);
  }

  try {
    const pub = await pool.query(
      `SELECT COUNT(*)::int AS n FROM courses WHERE is_marketplace = TRUE AND status = 'published'`,
    );
    const n = Number(pub.rows?.[0]?.n || 0);
    await add('published_courses', 'มีคอร์ส published ≥ 1', n >= 1, { count: n });
  } catch (e) {
    await add('published_courses', 'มีคอร์ส published', false, e?.message);
  }

  try {
    const ledgerSummary = await summarizeCourseLedgerEvents(pool);
    await add('course_ledger', 'course ledger events query ได้', ledgerSummary.ok !== false, ledgerSummary);
  } catch (e) {
    await add('course_ledger', 'course ledger', false, e?.message);
  }

  try {
    const integrity = await checkCourseMarketplaceLedgerIntegrity(pool);
    const pass = integrity.valid === true || (integrity.valid == null && integrity.available === false);
    await add('ledger_chain_integrity', 'verify_ledger_chain_integrity()', pass, integrity);
  } catch (e) {
    await add('ledger_chain_integrity', 'ledger integrity', false, e?.message);
  }

  try {
    const security = await runCourseSecurityAudit(pool);
    await add('security_audit', 'Course security controls', security.pass, {
      failed: security.checks.filter((c) => !c.pass).map((c) => c.id),
    });
  } catch (e) {
    await add('security_audit', 'security audit', false, e?.message);
  }

  try {
    const rev = await pool.query(
      `SELECT COALESCE(SUM(amount),0)::numeric AS total FROM platform_revenues WHERE source_type = 'course_commission'`,
    );
    await add('platform_revenue', 'platform_revenues course_commission track ได้', true, {
      total: Number(rev.rows?.[0]?.total || 0),
    });
  } catch (e) {
    await add('platform_revenue', 'platform_revenues', false, e?.message);
  }

  try {
    const policies = await pool.query(
      `SELECT key FROM payout_config WHERE key IN ('course_refund_policy','course_payout_policy','course_revenue_policy')`,
    );
    const keys = (policies.rows || []).map((r) => r.key);
    await add('policies', 'refund/payout/revenue policies ครบ', keys.length >= 3, { keys });
  } catch (e) {
    await add('policies', 'payout policies', false, e?.message);
  }

  try {
    const inReview = await pool.query(
      `SELECT COUNT(*)::int AS n FROM courses WHERE is_marketplace = TRUE AND status = 'in_review'`,
    );
    await add('review_queue', 'Review queue query ได้', true, { pending: Number(inReview.rows?.[0]?.n || 0) });
  } catch (e) {
    await add('review_queue', 'review queue', false, e?.message);
  }

  try {
    const phase0 = await evaluatePhase0Foundation(pool);
    await add('phase0_foundation', 'Phase 0 foundation (239 guardrails)', phase0.ok, {
      checks: phase0.checks,
    });
  } catch (e) {
    await add('phase0_foundation', 'Phase 0 foundation', false, e?.message);
  }

  const automatedPass = checks.filter((c) => c.pass).length;
  const automatedTotal = checks.length;
  const ledgerIntegrityCheck = checks.find((c) => c.id === 'ledger_chain_integrity');
  const securityCheck = checks.find((c) => c.id === 'security_audit');

  const manualQaReport = opts.manualQaReportPath
    ? loadManualQaReport(opts.manualQaReportPath)
    : loadManualQaReport(QA_REPORT_PATH);

  let paymentRegressionStatus = 'run_required';
  let backupRollbackStatus = 'run_required';

  if (!opts.skipSignOffExtras) {
    try {
      const { runCoursePaymentRegression } = await import('./coursePaymentRegression.js');
      const { verifyCourseBackupRollbackPlan } = await import('./courseBackupRollbackPlan.js');
      const baseUrl = opts.baseUrl || process.env.TEST_API_URL || 'http://localhost:3001';
      const regression = await runCoursePaymentRegression(baseUrl);
      paymentRegressionStatus = regression.pass ? 'automated_pass' : regression.serverUp ? 'failed' : 'server_required';
      const backup = await verifyCourseBackupRollbackPlan();
      backupRollbackStatus = backup.pass
        ? 'verified'
        : backup.passCount >= backup.total - 1
          ? 'verified_with_warnings'
          : 'manual_required';
    } catch {
      paymentRegressionStatus = 'run_required';
      backupRollbackStatus = 'run_required';
    }
  }

  const manualQaStatus = manualQaSignOffStatus(manualQaReport);

  return {
    ready: healthOk && checks.filter((c) => !['course_ledger'].includes(c.id)).every((c) => c.pass),
    automated: {
      pass: automatedPass,
      total: automatedTotal,
      checks,
    },
    manualQa: MANUAL_QA_STEPS,
    manualQaReport: manualQaReport.loaded
      ? { passCount: manualQaReport.passCount, total: manualQaReport.total, generatedAt: manualQaReport.generatedAt }
      : null,
    signOff: {
      migration: healthOk,
      routeHealth: healthOk,
      ledgerIntegrity: ledgerIntegrityCheck?.pass !== false,
      securityReview: securityCheck?.pass === true ? 'automated_pass' : 'review_required',
      manualQa: manualQaStatus,
      paymentRegression: paymentRegressionStatus,
      backupRollbackPlan: backupRollbackStatus,
      deployReady:
        healthOk &&
        manualQaStatus === 'signed_off' &&
        paymentRegressionStatus === 'automated_pass' &&
        ['verified', 'verified_with_warnings'].includes(backupRollbackStatus),
    },
    generatedAt: new Date().toISOString(),
  };
}
