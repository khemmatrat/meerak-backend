/** MTTR / MTBF — failure and recovery timeline (in-memory; persisted on demand). */

const failures = [];
const MAX = Number(process.env.AGK_RELIABILITY_MAX_EVENTS || 5_000);

function trim() {
  while (failures.length > MAX) failures.shift();
}

export function recordFailure(type, meta = {}) {
  const row = {
    id: `${Date.now()}-${failures.length}`,
    at: Date.now(),
    type,
    meta,
    recovered_at: null,
    recovery_ms: null,
  };
  failures.push(row);
  trim();
  return row;
}

export function recordRecovery(type, meta = {}) {
  for (let i = failures.length - 1; i >= 0; i--) {
    const f = failures[i];
    if (!f.recovered_at && (type ? f.type === type : true)) {
      f.recovered_at = Date.now();
      f.recovery_ms = f.recovered_at - f.at;
      f.recovery_meta = meta;
      return f;
    }
  }
  return null;
}

function avg(nums) {
  if (!nums.length) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

export function computeReliability() {
  const recovered = failures.filter((f) => f.recovery_ms != null);
  const unrecovered = failures.filter((f) => f.recovered_at == null);
  const recoveryTimes = recovered.map((f) => f.recovery_ms);

  const intervals = [];
  for (let i = 1; i < failures.length; i++) {
    intervals.push(failures[i].at - failures[i - 1].at);
  }

  return {
    generated_at: new Date().toISOString(),
    failure_count: failures.length,
    unrecovered_count: unrecovered.length,
    mttr_ms: avg(recoveryTimes),
    mtbf_ms: avg(intervals),
    last_failure_at: failures.at(-1)?.at || null,
    last_recovery_ms: recovered.at(-1)?.recovery_ms || null,
    recent: failures.slice(-10),
  };
}
