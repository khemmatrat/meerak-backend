/**
 * Partner hash — indexed lookup for Partner API trust endpoint.
 */
import { hashUserIdForPartner } from './userCommerceEvents.js';

export function computePartnerHash(userId) {
  return hashUserIdForPartner(String(userId || '').trim());
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} userId
 * @param {boolean} consent
 */
export async function syncPartnerHashForUser(pool, userId, consent) {
  const uid = String(userId || '').trim();
  if (!uid) return null;
  if (consent) {
    const hash = computePartnerHash(uid);
    await pool.query(
      `UPDATE users SET partner_hash = $2, updated_at = NOW() WHERE id = $1::uuid`,
      [uid, hash],
    );
    return hash;
  }
  await pool.query(
    `UPDATE users SET partner_hash = NULL, updated_at = NOW() WHERE id = $1::uuid`,
    [uid],
  );
  return null;
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ batchSize?: number }} [opts]
 */
export async function backfillPartnerHashes(pool, { batchSize = 500 } = {}) {
  const cap = Math.min(Math.max(Number(batchSize) || 500, 50), 2000);
  const r = await pool.query(
    `SELECT id FROM users
     WHERE data_sharing_consent = true AND (partner_hash IS NULL OR partner_hash = '')
     LIMIT $1`,
    [cap],
  );
  let updated = 0;
  for (const row of r.rows || []) {
    await syncPartnerHashForUser(pool, row.id, true);
    updated += 1;
  }
  return updated;
}
