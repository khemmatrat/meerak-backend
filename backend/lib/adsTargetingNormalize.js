/**
 * Normalize mobile targetingRules → Social Core AdsTargetingRulesBlob
 */
export function normalizeTargetingRules(raw = {}) {
  if (!raw || typeof raw !== 'object') return {};

  const out = { ...raw };

  if (out.geographyIso && !out.geographyAllows?.length) {
    const text = String(out.geographyIso).trim();
    if (text) {
      out.geographyAllows = text
        .split(/[\s,|]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 20);
    }
    delete out.geographyIso;
  }

  if (Array.isArray(out.geographyAllows)) {
    out.geographyAllows = out.geographyAllows.map((g) => String(g).trim()).filter(Boolean).slice(0, 20);
  }

  return out;
}
