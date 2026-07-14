import { guardianApiBase, isKnowledgeEnabled } from './config.js';

/**
 * Phase 2 — Knowledge Plane query (curated read model).
 */
export async function queryKnowledge(input = {}) {
  if (!isKnowledgeEnabled()) {
    return { ok: false, code: 'guardian.unavailable', reason: 'agk_knowledge_off' };
  }

  const base = guardianApiBase();
  if (!base) return { ok: false, code: 'guardian.unavailable' };

  const params = new URLSearchParams({
    q: input.query || input.q || '',
    locale: input.locale || 'th',
  });
  if (input.tenant_id) params.set('tenant_id', input.tenant_id);

  try {
    const res = await fetch(`${base}/guardian/v1/knowledge/query?${params}`, {
      headers: { 'X-Guardian-Mode': 'enforce' },
      signal: AbortSignal.timeout(5000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, ...json };
    return { ok: true, ...json.data };
  } catch {
    return { ok: false, code: 'guardian.unavailable', reason: 'timeout' };
  }
}
