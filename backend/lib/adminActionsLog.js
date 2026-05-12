/**
 * Append-only audit for privileged manual corrections (payments, wallets, escrow).
 */

/**
 * @param {import('pg').Pool | import('pg').PoolClient} executor
 * @param {{
 *   actionType: string,
 *   actor: string,
 *   paymentId?: string|null,
 *   eventId?: string|null,
 *   correlationId?: string|null,
 *   beforeSnapshot?: object,
 *   afterSnapshot?: object,
 *   reason?: string|null,
 *   traceId?: string|null,
 *   metadata?: object,
 * }} input
 */
export async function logAdminAction(executor, input) {
  const action_type = String(input?.actionType || '').trim();
  const actor = String(input?.actor || '').trim();
  if (!action_type) throw new Error('logAdminAction: actionType required');
  if (!actor) throw new Error('logAdminAction: actor required');

  const correlationId =
    input.correlationId ?? input.paymentId ?? input.eventId ?? null;

  const beforeSnapshot = JSON.stringify(
    input.beforeSnapshot && typeof input.beforeSnapshot === 'object' ? input.beforeSnapshot : {},
  );
  const afterSnapshot = JSON.stringify(
    input.afterSnapshot && typeof input.afterSnapshot === 'object' ? input.afterSnapshot : {},
  );
  const metadata = JSON.stringify(
    input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
  );

  try {
    await executor.query(
      `INSERT INTO admin_actions_log (
         action_type, payment_id, correlation_id,
         before_snapshot, after_snapshot, actor, reason, trace_id, metadata
       )
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9::jsonb)`,
      [
        action_type,
        input.paymentId ?? null,
        correlationId ? String(correlationId) : null,
        beforeSnapshot,
        afterSnapshot,
        actor,
        input.reason ?? null,
        input.traceId ?? null,
        metadata,
      ],
    );
  } catch (e) {
    if (String(e?.code) === '42P01') {
      console.warn('[adminActionsLog] admin_actions_log missing; apply migration 187');
      return;
    }
    if (String(e?.code) === '42703') {
      await executor.query(
        `INSERT INTO admin_actions_log (
           action_type, payment_id,
           before_snapshot, after_snapshot, actor, reason, trace_id, metadata
         )
         VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, $8::jsonb)`,
        [
          action_type,
          input.paymentId ?? null,
          beforeSnapshot,
          afterSnapshot,
          actor,
          input.reason ?? null,
          input.traceId ?? null,
          metadata,
        ],
      );
      return;
    }
    throw e;
  }
}
