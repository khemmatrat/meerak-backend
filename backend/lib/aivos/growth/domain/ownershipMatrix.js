export const OWNERSHIP_MATRIX = Object.freeze({
  'growth.profile': { entity: 'GrowthProfile', storage: 'growth_profiles' },
  'growth.journey': { entity: 'Journey', storage: 'growth_journeys' },
  'growth.habit': { entity: 'Habit', storage: 'growth_habits' },
  'growth.mission': { entity: 'Mission', storage: 'growth_missions' },
  'growth.reward': { entity: 'Reward', storage: 'growth_reward_ledger' },
  'growth.recommendation': { entity: 'Recommendation', storage: 'growth_recommendations' },
  'growth.feed': { entity: 'FeedItem', storage: 'growth_feed_items' },
  'growth.loop': { entity: 'GrowthLoopState', storage: 'growth_loop_state' },
  'growth.loyalty': { entity: 'LoyaltyTier', storage: 'growth_loyalty' },
  'growth.notification': { entity: 'Notification', storage: 'growth_notifications' },
  'growth.personalization': { entity: 'PersonalAI Persona', storage: 'growth_persona' },
  'growth.analytics': { entity: 'AnalyticsFact', storage: 'growth_kpi_rollups' },
  'growth.churn': { entity: 'ChurnScore', storage: 'growth_churn_scores' },
});

const FORBIDDEN_PREFIXES = Object.freeze([
  'workflow.',
  'billing.',
  'revenue.',
  'marketplace.',
  'application.',
  'tenant.',
  'integration.',
  'knowledge.',
  'learning.',
  'analytics.',
]);

export function assertGrowthWriteOwner(moduleOwner, tableName) {
  const entry = OWNERSHIP_MATRIX[moduleOwner];
  if (!entry) {
    const err = new Error('growth_unknown_write_owner');
    err.code = 'GROWTH_OWNERSHIP_VIOLATION';
    throw err;
  }
  if (entry.storage !== tableName) {
    const err = new Error('growth_storage_namespace_mismatch');
    err.code = 'GROWTH_OWNERSHIP_VIOLATION';
    err.details = { moduleOwner, expected: entry.storage, actual: tableName };
    throw err;
  }
  for (const prefix of FORBIDDEN_PREFIXES) {
    if (tableName.startsWith(prefix.replace('.', '')) || tableName.includes(prefix.replace('.', '_'))) {
      const err = new Error('growth_foreign_storage_write_forbidden');
      err.code = 'GROWTH_OWNERSHIP_VIOLATION';
      throw err;
    }
  }
  return true;
}

export function isForeignStorageNamespace(tableName) {
  return FORBIDDEN_PREFIXES.some((p) => tableName.startsWith(p.replace('.', '')));
}
