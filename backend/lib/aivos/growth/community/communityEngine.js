export function createCommunityEngine({ storage } = {}) {
  const table = 'growth_community';

  return {
    feed({ tenantId }, { limit = 20 } = {}) {
      const items = storage.list(table, { prefix: `${tenantId}::` }).slice(0, limit);
      return { items, tenantId, kind: 'work' };
    },

    post({ tenantId, userId }, { title, body }) {
      const id = `comm-${Date.now()}`;
      const row = { id, tenantId, userId, title, body, createdAt: new Date().toISOString() };
      storage.put(table, `${tenantId}::${id}`, row);
      return { ok: true, item: row };
    },
  };
}
