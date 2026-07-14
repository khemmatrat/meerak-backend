/**
 * P7 CrewAI-style re-rank via ai-core Hermes orchestration
 */
const AI_CORE_URL = (process.env.AI_CORE_URL || "http://ai-core:8100").replace(/\/$/, "");
const AI_CORE_KEY = process.env.AI_CORE_API_KEY || "";

export async function crewRerank({ entity_type, candidates, context = {} }) {
  try {
    const r = await fetch(`${AI_CORE_URL}/v1/crew/rerank`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-AI-Core-Api-Key": AI_CORE_KEY,
      },
      body: JSON.stringify({ entity_type, candidates, context }),
      signal: AbortSignal.timeout(120000),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return { ok: false, error: data.error || `crew_${r.status}`, detail: data };
    }
    return { ok: true, ...data };
  } catch (e) {
    return { ok: false, error: "ai_core_unreachable", detail: e.message };
  }
}

export function rulesRerank(candidates, { scoreKey = "conversion_rate_pct" } = {}) {
  const sorted = [...candidates].sort((a, b) => {
    const sa = Number(a[scoreKey] ?? 0);
    const sb = Number(b[scoreKey] ?? 0);
    if (sb !== sa) return sb - sa;
    return Number(b.purchases ?? 0) - Number(a.purchases ?? 0);
  });
  return {
    source: "rules",
    ranked: sorted.map((c, i) => ({
      id: c.stream_id || c.product_id || c.id,
      score: Math.max(0.1, 1 - i * 0.05),
      reason: `conversion ${c[scoreKey] ?? 0}% · purchases ${c.purchases ?? 0}`,
      metrics: c,
    })),
  };
}
