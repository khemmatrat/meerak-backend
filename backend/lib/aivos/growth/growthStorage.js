function now() {
  return new Date().toISOString();
}

function table(store, name) {
  if (store?.kind !== 'memory') return null;
  if (!store._tables[name]) store._tables[name] = new Map();
  return store._tables[name];
}

export function growthKey(tenantId, ...parts) {
  return [tenantId, ...parts].filter(Boolean).join('::');
}

export function createGrowthStorage({ store } = {}) {
  return {
    store,
    key: growthKey,
    now,

    get(tableName, key) {
      return table(store, tableName)?.get(key) || null;
    },

    put(tableName, key, value) {
      const t = table(store, tableName);
      if (!t) throw new Error('growth_storage_requires_memory_store');
      t.set(key, value);
      return value;
    },

    delete(tableName, key) {
      return table(store, tableName)?.delete(key) || false;
    },

    list(tableName, { prefix } = {}) {
      const t = table(store, tableName);
      if (!t) return [];
      return [...t.entries()]
        .filter(([k]) => !prefix || k.startsWith(prefix))
        .map(([, v]) => v);
    },

    tables: {
      profiles: 'growth_profiles',
      journeys: 'growth_journeys',
      habits: 'growth_habits',
      missions: 'growth_missions',
      feed: 'growth_feed_items',
      recommendations: 'growth_recommendations',
      rewards: 'growth_reward_ledger',
      loop: 'growth_loop_state',
      loyalty: 'growth_loyalty',
      notifications: 'growth_notifications',
    },
  };
}
