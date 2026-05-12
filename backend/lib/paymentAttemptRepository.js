/**
 * Payment attempts (Phase 1B).
 */

/**
 * Read-only anchor rows for a gateway transaction (ORDER BY id ASC).
 * @param {import('pg').Pool|import('pg').PoolClient} client
 * @param {string} gatewayTransactionUuid
 */
export async function fetchAttemptsByGatewayTransactionIdOrderedById(client, gatewayTransactionUuid) {
  const { rows } = await client.query(
    `SELECT * FROM payment_attempts WHERE gateway_transaction_id = $1::uuid ORDER BY id ASC`,
    [gatewayTransactionUuid],
  );
  return rows;
}

/**
 * Dual-write anchor: exactly one attempt row per gateway_transactions.id (migration 194 unique index).
 * @param {import('pg').Pool|import('pg').PoolClient} client
 * @param {{
 *   paymentId: string,
 *   provider: string,
 *   method: string,
 *   gatewayTransactionId: string,
 *   providerReference?: string|null,
 *   mirroredStatus: string,
 *   metadata?: Record<string, unknown>,
 * }} params
 */
export async function insertGatewayAnchoredAttemptMirror(client, params) {
  const {
    paymentId,
    provider,
    method,
    gatewayTransactionId,
    providerReference = null,
    mirroredStatus,
    metadata = {},
  } = params;
  const { rows } = await client.query(
    `INSERT INTO payment_attempts (
       payment_id, provider, method, gateway_transaction_id, provider_reference, status, metadata
     )
     VALUES ($1::uuid, $2::text, $3::text, $4::uuid, $5::text, $6::text, $7::jsonb)
     RETURNING *`,
    [paymentId, provider, method, gatewayTransactionId, providerReference, mirroredStatus, metadata],
  );
  return rows[0] || null;
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} client
 * @param {{
 *   paymentId: string,
 *   provider: string,
 *   method: string,
 *   gatewayTransactionId?: string|null,
 *   providerReference?: string|null,
 *   status?: string,
 *   expiresAt?: Date|string|null,
 *   metadata?: Record<string, unknown>,
 * }} params
 */
export async function insertPaymentAttemptSkeleton(client, params) {
  const {
    paymentId,
    provider,
    method,
    gatewayTransactionId = null,
    providerReference = null,
    status = 'pending',
    expiresAt = null,
    metadata = {},
  } = params;

  const { rows } = await client.query(
    `INSERT INTO payment_attempts (
       payment_id, provider, method, gateway_transaction_id, provider_reference, status, expires_at, metadata
     )
     VALUES ($1::uuid, $2::text, $3::text, $4::uuid, $5::text, $6::text, $7::timestamptz, $8::jsonb)
     RETURNING *`,
    [
      paymentId,
      provider,
      method,
      gatewayTransactionId,
      providerReference,
      status,
      expiresAt,
      metadata,
    ],
  );
  return rows[0] || null;
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} client
 * @param {string} paymentId
 */
export async function fetchAttemptsForPaymentSkeleton(client, paymentId) {
  const { rows } = await client.query(
    `SELECT * FROM payment_attempts WHERE payment_id = $1::uuid ORDER BY id ASC`,
    [paymentId],
  );
  return rows;
}
