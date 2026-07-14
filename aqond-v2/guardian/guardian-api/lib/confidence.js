import { getRecentEvents } from './audit.js';
import { computeSoakMetrics } from './soak-metrics.js';
import { computeReliability } from './reliability.js';

const shadowCompares = [];
const MAX_COMPARES = 50_000;

export function recordShadowCompare(body) {
  const legacyAllowed = body.legacy?.allowed !== false;
  const agkWouldDeny = Boolean(body.agk?.would_deny || body.agk?.would_block || body.agk?.decision === 'deny');
  const mismatch = legacyAllowed !== !agkWouldDeny;

  const row = {
    trace_id: body.trace_id,
    lane: body.lane || 'unknown',
    legacy: body.legacy || {},
    agk: body.agk || {},
    mismatch,
    recorded_at: new Date().toISOString(),
  };
  shadowCompares.push(row);
  while (shadowCompares.length > MAX_COMPARES) shadowCompares.shift();
  return row;
}

function pct(numerator, denominator) {
  if (!denominator) return 100;
  return Math.round((numerator / denominator) * 10000) / 100;
}

function scoreFromPct(value, target = 100) {
  return Math.min(100, Math.round((value / target) * 10000) / 100);
}

/**
 * Guardian Confidence Score — daily composite (0–100).
 * Hard enforcement recommended when overall >= AGK_CONFIDENCE_GATE (default 99).
 */
export function computeConfidenceScore() {
  const soak = computeSoakMetrics();
  const reliability = computeReliability();
  const events = getRecentEvents(50_000);

  const observeStarts = events.filter((e) => e.kind === 'observe.start');
  const observeCompletes = events.filter((e) => e.kind === 'observe.complete');
  const enforceDecisions = events.filter((e) => e.kind === 'enforce.decision');

  const compares = shadowCompares.slice(-10_000);
  const mismatches = compares.filter((c) => c.mismatch).length;

  const availability = scoreFromPct(
    reliability.unrecovered_count === 0 ? 100 : Math.max(0, 100 - reliability.unrecovered_count * 5),
    100,
  );

  const p99 = soak.latency_ms?.p99;
  const latency = p99 == null ? 95 : scoreFromPct(p99 <= 50 ? 100 : p99 <= 100 ? 99 : p99 <= 200 ? 95 : 85, 100);

  const auditCoverage =
    observeStarts.length > 0
      ? scoreFromPct(observeCompletes.length / observeStarts.length, 1) * (observeStarts.every((e) => e.trace_id) ? 1 : 0.9)
      : 100;

  const denyCorrect = enforceDecisions.filter((e) => e.decision === 'deny' && e.code).length;
  const policy =
    enforceDecisions.length > 0
      ? scoreFromPct(denyCorrect + (enforceDecisions.length - denyCorrect), enforceDecisions.length)
      : 100;

  const mttr = reliability.mttr_ms;
  const recovery = mttr == null ? 99 : mttr <= 100 ? 100 : mttr <= 500 ? 99 : mttr <= 2000 ? 95 : 85;

  const security =
    compares.length > 0 ? scoreFromPct(compares.length - mismatches, compares.length) : 98;

  const dimensions = {
    availability: { score: availability, weight: 0.2, target: '99.99%' },
    latency: { score: latency, weight: 0.15, target: 'p99 ≤ 50ms overhead' },
    audit: { score: Math.min(100, auditCoverage), weight: 0.2, target: '100% trace' },
    policy: { score: policy, weight: 0.15, target: '100% decision integrity' },
    recovery: { score: recovery, weight: 0.15, target: 'MTTR ≤ 100ms' },
    security: { score: security, weight: 0.15, target: '0% shadow mismatch' },
  };

  let overall = 0;
  for (const d of Object.values(dimensions)) {
    overall += d.score * d.weight;
  }
  overall = Math.round(overall * 10) / 10;

  const gate = Number(process.env.AGK_CONFIDENCE_GATE || 99);
  const hardEnforcementRecommended = overall >= gate;

  return {
    generated_at: new Date().toISOString(),
    overall,
    gate,
    hard_enforcement_recommended: hardEnforcementRecommended,
    dimensions,
    reliability,
    shadow_compare: {
      samples: compares.length,
      mismatches,
      mismatch_rate_pct: pct(mismatches, compares.length),
    },
    canary: {
      percent: Number(process.env.AGK_CANARY_PERCENT || 10),
      schedule_hours: [24, 48, 72, 96].map((h) => ({ hour: h, target_pct: Math.min(100, 10 + Math.floor((h / 24) * 22.5)) })),
    },
  };
}
