import { randomUUID } from 'crypto';

export function createKernelStore(seed = {}) {
  const working = new Map(); // key: `${jobId}:${layer}:${key}` -> { value, ttl, created_at }
  const semantic = [];
  const episodes = [];
  const brandDna = new Map();

  for (const row of seed.semantic || []) semantic.push({ ...row });
  for (const row of seed.brandDna || []) brandDna.set(`${row.brand_key}@${row.version}`, row);

  const now = () => new Date().toISOString();

  return {
    kind: 'memory',
    async getWorking(jobId, layer, key) {
      return working.get(`${jobId}:${layer}:${key}`) || null;
    },
    async setWorking(jobId, layer, key, value, ttlSec) {
      const rec = { id: randomUUID(), job_id: jobId, layer, key, value, ttlSec: ttlSec || null, created_at: now() };
      working.set(`${jobId}:${layer}:${key}`, rec);
      return rec;
    },
    async appendEpisode(userId, payload) {
      const rec = { id: randomUUID(), user_id: userId, payload, created_at: now() };
      episodes.push(rec);
      return rec;
    },
    async listEpisodes() {
      return episodes.map((e) => ({ ...e }));
    },
    async upsertSemantic({ ownerId, namespace, contentType, key, content, embedding, jobId }) {
      const id = randomUUID();
      const rec = {
        id,
        owner_id: ownerId || null,
        namespace: namespace || 'global',
        content_type: contentType || 'generic',
        key,
        content,
        embedding: embedding || null,
        source_job_id: jobId || null,
        created_at: now(),
      };
      semantic.push(rec);
      return rec;
    },
    async searchSemantic({ ownerId, namespace, contentTypes, limit = 5, query }) {
      const ns = namespace || 'global';
      const filtered = semantic.filter((r) => (!ownerId || r.owner_id === ownerId) && (!ns || r.namespace === ns) && (!contentTypes || contentTypes.includes(r.content_type)));
      const results = filtered.slice(0, limit).map((r) => ({ ...r, score: 0.99 }));
      return results;
    },
    async getBrandDna(brandKey, version = 1) {
      return brandDna.get(`${brandKey}@${version}`) || null;
    },
    async listSemantic() {
      return semantic.map((r) => ({ ...r }));
    },
  };
}
