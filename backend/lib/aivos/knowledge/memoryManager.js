function ensureMemory(store) {
  if (store?.kind !== 'memory') return null;
  if (!store._tables.knowledgeMemory) store._tables.knowledgeMemory = new Map();
  return store._tables.knowledgeMemory;
}

export function createMemoryManager({ store } = {}) {
  const table = () => ensureMemory(store);

  function scopeKey(scope, key) {
    return `${scope}::${key}`;
  }

  function set(scope, key, value, { skillId, sessionId } = {}) {
    const mem = table();
    if (!mem) throw new Error('memory_manager_requires_memory_store');
    const fullKey = scopeKey(scope, skillId ? `${skillId}:${key}` : sessionId ? `${sessionId}:${key}` : key);
    const row = { scope, key: fullKey, value, skillId, sessionId, updated_at: new Date().toISOString() };
    mem.set(fullKey, row);
    return { ...row };
  }

  function get(scope, key, { skillId, sessionId } = {}) {
    const fullKey = scopeKey(scope, skillId ? `${skillId}:${key}` : sessionId ? `${sessionId}:${key}` : key);
    return table()?.get(fullKey)?.value ?? null;
  }

  function listScope(scope) {
    return [...(table()?.values() || [])].filter((r) => r.scope === scope).map((r) => ({ ...r }));
  }

  return {
    set,
    get,
    listScope,
    longTerm: {
      set: (key, value, opts) => set('long_term', key, value, opts),
      get: (key, opts) => get('long_term', key, opts),
    },
    session: {
      set: (sessionId, key, value) => set('session', key, value, { sessionId }),
      get: (sessionId, key) => get('session', key, { sessionId }),
    },
    shared: {
      set: (key, value) => set('shared', key, value),
      get: (key) => get('shared', key),
    },
    perSkill(skillId) {
      return {
        set: (key, value) => set('skill', key, value, { skillId }),
        get: (key) => get('skill', key, { skillId }),
        list: () => listScope('skill').filter((r) => r.skillId === skillId),
      };
    },
  };
}
