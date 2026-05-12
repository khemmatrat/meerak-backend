/**
 * Payment intent persistence (Phase 1B).
 * Dual-write bridge (Task 19B): mirror gateway_transactions.status verbatim onto `payments.status`.
 */

/**
 * Freeze: no reinterpretation — empty/null gateway status collapses to PENDING only.
 * @param {unknown} gwStatus gateway_transactions.status column value
 */
export function mirrorGatewayStatusToCanonicalColumn(gwStatus) {
  const s = gwStatus == null ? '' : String(gwStatus).trim();
  return s === '' ? 'PENDING' : s;
}

/**
 * Find canonical payment keyed by anchored attempt→gateway tx (ORDER BY payments.id — not created_at).
 * @param {import('pg').Pool|import('pg').PoolClient} client
 * @param {string} gatewayTransactionUuid
 * @returns {Promise<string|null>}
 */
export async function findCanonicalPaymentIdByGatewayTxId(client, gatewayTransactionUuid) {
  const { rows } = await client.query(
    `SELECT p.id::text AS id
     FROM payments p
     INNER JOIN payment_attempts pa
       ON pa.payment_id = p.id AND pa.gateway_transaction_id = $1::uuid
     ORDER BY p.id ASC
     LIMIT 1`,
    [gatewayTransactionUuid],
  );
  return rows[0]?.id ? String(rows[0].id) : null;
}

/**
 * Dual-write mirrored payment row (caller runs inside gateway commit transaction).
 * @param {import('pg').Pool|import('pg').PoolClient} client
 * @param {{
 *   userId: string,
 *   jobUuid: string,
 *   mirroredStatus: string,
 *   amountMinor: number|string,
 *   currency?: string,
 *   metadata?: Record<string, unknown>,
 * }} params
 */
export async function insertPaymentDualWriteMirror(client, params) {
  const purpose = 'job_checkout';
  const referenceType = 'job';
  const {
    userId,
    jobUuid,
    mirroredStatus,
    amountMinor,
    currency = 'THB',
    metadata = {},
  } = params;
  const { rows } = await client.query(
    `INSERT INTO payments (
       user_id, purpose, reference_type, reference_id, currency, amount_minor, status, metadata
     )
     VALUES ($1::uuid, $2::text, $3::text, $4::uuid, $5::bpchar, $6::bigint, $7::text, $8::jsonb)
     RETURNING *`,
    [userId, purpose, referenceType, jobUuid, currency, amountMinor, mirroredStatus, metadata],
  );
  return rows[0] || null;
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} client
 * @param {{
 *   userId: string,
 *   purpose: string,
 *   referenceType?: string|null,
 *   referenceId?: string|null,
 *   currency?: string,
 *   amountMinor: number|string,
 *   status?: string,
 *   metadata?: Record<string, unknown>,
 * }} params
 */
export async function insertPaymentSkeleton(client, params) {
  const {
    userId,
    purpose,
    referenceType = null,
    referenceId = null,
    currency = 'THB',
    amountMinor,
    status = 'created',
    metadata = {},
  } = params;

  const { rows } = await client.query(
    `INSERT INTO payments (
       user_id, purpose, reference_type, reference_id, currency, amount_minor, status, metadata
     )
     VALUES ($1::uuid, $2::text, $3::text, $4::uuid, $5::bpchar, $6::bigint, $7::text, $8::jsonb)
     RETURNING *`,
    [userId, purpose, referenceType, referenceId, currency, amountMinor, status, metadata],
  );
  return rows[0] || null;
}

/**
 * Read-only by contract (canonical shadow loader / diagnostics).
 * @param {import('pg').Pool|import('pg').PoolClient} client
 * @param {string} paymentId
 */
export async function fetchPaymentByIdSkeleton(client, paymentId) {
  const { rows } = await client.query(`SELECT * FROM payments WHERE id = $1::uuid LIMIT 1`, [paymentId]);
  return rows[0] || null;
}

/**
 * Run work inside a transaction (caller supplies pool).
 * @template T
 * @param {import('pg').Pool} pool
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 */
export async function runInPaymentTransactionSkeleton(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
