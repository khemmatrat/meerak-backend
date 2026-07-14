/**
 * In-process counters for anti-bypass hits (no PII stored).
 * Enable aggregation via GET /api/admin/anti-bypass/telemetry when ANTI_BYPASS_TELEMETRY=on.
 */

const counts = new Map();

export function recordAntiBypassReasons(scope, reasons) {
  if (process.env.ANTI_BYPASS_TELEMETRY !== 'on') return;
  const sc = scope || 'text';
  const list = Array.isArray(reasons) ? reasons : [];
  for (const r of list) {
    const key = `${sc}:${String(r).slice(0, 120)}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
}

export function getAntiBypassTelemetrySnapshot() {
  return Object.fromEntries(counts.entries());
}

/** Dev/tests only */
export function resetAntiBypassTelemetry() {
  counts.clear();
}
