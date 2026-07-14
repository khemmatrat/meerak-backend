/**
 * Load persisted manual QA report (course-manual-qa-report.json).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_MANUAL_QA_REPORT = join(__dirname, '..', 'course-manual-qa-report.json');

export function loadManualQaReport(reportPath = DEFAULT_MANUAL_QA_REPORT) {
  if (!existsSync(reportPath)) {
    return { loaded: false, path: reportPath, pass: false, passCount: 0, total: 12 };
  }
  try {
    const data = JSON.parse(readFileSync(reportPath, 'utf8'));
    const passCount = Number(data.passCount || 0);
    const total = Number(data.total || 12);
    const generatedAt = data.generatedAt || null;
    const ageHours = generatedAt
      ? (Date.now() - new Date(generatedAt).getTime()) / 3600000
      : Infinity;
    return {
      loaded: true,
      path: reportPath,
      pass: data.pass === true && passCount === total,
      passCount,
      total,
      generatedAt,
      stale: ageHours > 72,
      signOff: data.signOff || null,
      results: data.results || [],
    };
  } catch (e) {
    return { loaded: false, path: reportPath, pass: false, error: e?.message };
  }
}

export function manualQaSignOffStatus(report) {
  if (!report.loaded) return 'run_required';
  if (report.pass && !report.stale) return 'signed_off';
  if (report.pass && report.stale) return 'signed_off_stale';
  return 'failed';
}
