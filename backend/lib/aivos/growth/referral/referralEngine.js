export function createReferralEngine({ storage, audit } = {}) {
  const table = 'growth_referrals';

  function userKey(tenantId, userId) {
    return `${tenantId}::${userId}`;
  }

  return {
    create({ tenantId, userId }) {
      const code = `REF-${tenantId.slice(0, 4)}-${userId.slice(0, 4)}-${Date.now().toString(36)}`.toUpperCase();
      const row = { code, tenantId, userId, createdAt: new Date().toISOString(), uses: 0 };
      const list = storage.get(table, userKey(tenantId, userId)) || [];
      storage.put(table, userKey(tenantId, userId), [...list, row]);
      audit?.record?.({ action: 'referral.create', tenantId, diff: { userId, code } });
      return { ok: true, code, referral: row };
    },

    list({ tenantId, userId }) {
      return storage.get(table, userKey(tenantId, userId)) || [];
    },
  };
}
