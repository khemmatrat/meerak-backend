/**
 * Production sign-off — merges automated checklist, manual QA report, payment regression, backup plan.
 */

import { buildCourseLaunchChecklist } from './courseLaunchChecklist.js';
import { runCoursePaymentRegression } from './coursePaymentRegression.js';
import { verifyCourseBackupRollbackPlan } from './courseBackupRollbackPlan.js';
import { loadManualQaReport, manualQaSignOffStatus, DEFAULT_MANUAL_QA_REPORT } from './courseManualQaReport.js';

const DEFAULT_QA_REPORT = DEFAULT_MANUAL_QA_REPORT;

export { loadManualQaReport };

function statusPaymentRegression(regression) {
  if (regression?.pass) return 'automated_pass';
  if (regression?.serverUp === false) return 'server_required';
  return 'failed';
}

function statusBackupRollback(plan) {
  if (plan?.pass) return 'verified';
  if (plan?.passCount >= (plan?.total || 7) - 1) return 'verified_with_warnings';
  return 'manual_required';
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ baseUrl?: string, manualQaReportPath?: string, skipHttp?: boolean }} [opts]
 */
export async function buildCourseProductionSignOff(pool, opts = {}) {
  const baseUrl = (opts.baseUrl || process.env.TEST_API_URL || 'http://localhost:3001').replace(/\/$/, '');
  const checklist = await buildCourseLaunchChecklist(pool, { skipSignOffExtras: true });
  const manualQa = loadManualQaReport(opts.manualQaReportPath);

  const paymentRegression = opts.skipHttp
    ? null
    : await runCoursePaymentRegression(baseUrl);

  const backupRollback = await verifyCourseBackupRollbackPlan({
    createLocalBackup: opts.createLocalBackup === true,
  });

  const signOff = {
    migration: checklist.signOff.migration,
    routeHealth: checklist.signOff.routeHealth,
    ledgerIntegrity: checklist.signOff.ledgerIntegrity,
    securityReview: checklist.signOff.securityReview,
    manualQa: manualQaSignOffStatus(manualQa),
    manualQaDetail: {
      passCount: manualQa.passCount,
      total: manualQa.total,
      generatedAt: manualQa.generatedAt,
      reportPath: manualQa.path,
    },
    paymentRegression: paymentRegression ? statusPaymentRegression(paymentRegression) : 'skipped',
    paymentRegressionDetail: paymentRegression
      ? { passCount: paymentRegression.passCount, total: paymentRegression.total }
      : null,
    backupRollbackPlan: statusBackupRollback(backupRollback),
    backupRollbackDetail: {
      passCount: backupRollback.passCount,
      total: backupRollback.total,
      backupDir: backupRollback.backupDir,
    },
  };

  const deployReady =
    checklist.ready &&
    signOff.manualQa === 'signed_off' &&
    signOff.paymentRegression === 'automated_pass' &&
    ['verified', 'verified_with_warnings'].includes(signOff.backupRollbackPlan);

  return {
    deployReady,
    signOff,
    checklist,
    manualQa,
    paymentRegression,
    backupRollback,
    generatedAt: new Date().toISOString(),
  };
}
