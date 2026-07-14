import { getRecentEvents, auditHealth } from './audit.js';

export function computeSoakMetrics() {
  const events = getRecentEvents(50_000);
  const observeStarts = events.filter((e) => e.kind === 'observe.start');
  const observeCompletes = events.filter((e) => e.kind === 'observe.complete');
  const enforceDecisions = events.filter((e) => e.kind === 'enforce.decision');
  const shadowEvals = events.filter((e) => e.kind === 'shadow.eval');
  const denies = enforceDecisions.filter((e) => e.decision === 'deny');
  const shadowHits = shadowEvals.filter((e) => e.shadow?.would_block);

  const latencies = observeCompletes
    .map((e) => e.response_meta?.latency_ms)
    .filter((n) => typeof n === 'number' && n >= 0)
    .sort((a, b) => a - b);

  const p99 = latencies.length ? latencies[Math.floor(latencies.length * 0.99)] || latencies.at(-1) : null;

  const traceIds = new Set(observeStarts.map((e) => e.trace_id).filter(Boolean));
  const withAgent = observeStarts.filter((e) => e.agent_id).length;

  return {
    generated_at: new Date().toISOString(),
    audit: auditHealth(),
    counts: {
      observe_start: observeStarts.length,
      observe_complete: observeCompletes.length,
      enforce_decision: enforceDecisions.length,
      shadow_eval: shadowEvals.length,
      deny: denies.length,
      shadow_would_block: shadowHits.length,
    },
    coverage: {
      trace_attributed: withAgent,
      trace_unique: traceIds.size,
      audit_pair_ratio:
        observeStarts.length > 0 ? observeCompletes.length / observeStarts.length : null,
    },
    latency_ms: {
      samples: latencies.length,
      p50: latencies.length ? latencies[Math.floor(latencies.length * 0.5)] : null,
      p99,
    },
    recent_denies: denies.slice(-5).map((e) => ({
      trace_id: e.trace_id,
      code: e.code,
      reason: e.reason,
      risk_class: e.risk_class,
    })),
  };
}
