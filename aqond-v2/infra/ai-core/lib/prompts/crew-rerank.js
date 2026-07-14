/** P7 CrewAI-style re-rank prompt (Hermes multi-agent simulation in one JSON pass) */
export function crewRerankPrompt(payload) {
  return `You are a ranking crew for a Thai live-commerce marketplace.
Agents: (1) Metrics Analyst (2) Merchandising Strategist (3) Final Ranker.

Given candidates with conversion metrics, output a re-ranked list with scores 0-1 and short Thai/English reasons.

Respond JSON only:
{"ranked":[{"id":"...","score":0.0,"reason":"...","metrics":{}}],"crew_notes":"..."}

Prioritize: higher conversion_rate_pct, recent activity, live_joins for streams, purchases as tiebreaker.
Do not invent IDs — only reorder provided candidates.

Input:
${JSON.stringify(payload, null, 0)}`;
}

export function rulesCrewRerank({ entity_type, candidates }) {
  const scoreKey = "conversion_rate_pct";
  const sorted = [...(candidates || [])].sort((a, b) => {
    const sa = Number(a[scoreKey] ?? 0);
    const sb = Number(b[scoreKey] ?? 0);
    if (sb !== sa) return sb - sa;
    const pa = Number(a.purchases ?? a.live_joins ?? 0);
    const pb = Number(b.purchases ?? b.live_joins ?? 0);
    return pb - pa;
  });

  return {
    ranked: sorted.map((c, i) => ({
      id: c.stream_id || c.product_id || c.id,
      score: Math.max(0.05, Number((1 - i * 0.08).toFixed(2))),
      reason: `P7 rules: ${scoreKey}=${c[scoreKey] ?? 0}%`,
      metrics: c,
    })),
    crew_notes: `rules_fallback ${entity_type} count=${sorted.length}`,
    source: "rules",
  };
}
