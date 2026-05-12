/**
 * Payment status transition log (Phase 1B skeleton — NOT wired to runtime flows).
 * Table is append-only at DB level; use INSERT only.
 */

/**
 * @param {import('pg').Pool|import('pg').PoolClient} client
 * @param {{
 *   paymentId: string,
 *   fromStatus?: string|null,
 *   toStatus: string,
 *   transitionSource?: string,
 *   traceId?: string|null,
 *   metadata?: Record<string, unknown>,
 * }} params
 */
export async function appendTransitionSkeleton(client, params) {
  const {
    paymentId,
    fromStatus = null,
    toStatus,
    transitionSource = 'system',
    traceId = null,
    metadata = {},
  } = params;

  const { rows } = await client.query(
    `INSERT INTO payment_status_transitions (
       payment_id, from_status, to_status, transition_source, trace_id, metadata
     )
     VALUES ($1::uuid, $2::text, $3::text, $4::text, $5::text, $6::jsonb)
     RETURNING *`,
    [paymentId, fromStatus, toStatus, transitionSource, traceId, metadata],
  );
  return rows[0] || null;
}

/**
 * Append-only table; read ordered by id ASC only (no created_at ordering).
 * @param {import('pg').Pool|import('pg').PoolClient} client
 * @param {string} paymentId
 */
export async function fetchTransitionsForPaymentSkeleton(client, paymentId) {
  const { rows } = await client.query(
    `SELECT * FROM payment_status_transitions WHERE payment_id = $1::uuid ORDER BY id ASC`,
    [paymentId],
  );
  return rows;
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} client
 * @param {string} paymentUuid
 */
export async function countTransitionsForPayment(client, paymentUuid) {
  const { rows } = await client.query(
    `SELECT COUNT(*)::bigint AS c FROM payment_status_transitions WHERE payment_id = $1::uuid`,
    [paymentUuid],
  );
  return rows[0] ? Number(rows[0].c) : 0;
}
