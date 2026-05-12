/**
 * Subscription payment — one ledger row per payment_id.
 *
 * active_until MUST be TIMESTAMPTZ. Configure the Node `pg` pool with
 * `options: '-c timezone=UTC'` (or run `SET TIME ZONE ''UTC''` after connect) so
 * `NOW()` semantics are consistent across app instances and regions.
 */

export async function validate(payment, event) {
  const userId = payment?.user_id || payment?.client_reference_id;
  if (!userId) {
    return { ok: false, failure_code: 'subscription_missing_user' };
  }

  const ref = String(payment?.client_reference_id || '');
  if (!ref.startsWith('sub_')) {
    return { ok: false, failure_code: 'subscription_invalid_reference' };
  }

  const amount = Number(payment?.amount_minor || 0) / 100;
  if (amount < 99) {
    return { ok: false, failure_code: 'subscription_amount_too_small' };
  }

  return { ok: true };
}

export async function execute(client, payment, event) {
  const paymentId = payment?.id || payment?.external_ref;
  const userId = payment?.user_id || payment?.client_reference_id;
  const amountMinor = Number(payment?.amount_minor || 0);
  const amount = (amountMinor / 100).toFixed(2);
  const currency = String(payment?.currency || 'THB').toUpperCase();
  const traceId = event?.trace_id || payment?.trace_id;
  const ref = String(payment?.client_reference_id || '');

  let plan = 'monthly';
  let durationDays = 30;
  if (ref.includes('yearly')) {
    plan = 'yearly';
    durationDays = 365;
  } else if (ref.includes('monthly')) {
    plan = 'monthly';
    durationDays = 30;
  }

  const idempotencyKey = `subscription:${paymentId}`;

  const ledger = await client.query(
    `INSERT INTO ledger_entries (
       idempotency_key, transaction_group_id, payment_id, user_id, event_type, direction,
       amount, currency, description, trace_id, created_at
     )
     VALUES ($1, gen_random_uuid(), $2, $3, $4, $5, $6::numeric, $7, $8, $9, NOW())
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING *`,
    [
      idempotencyKey,
      paymentId,
      userId,
      'SUBSCRIPTION_PAYMENT',
      'credit',
      amount,
      currency,
      `Subscription ${plan} payment`,
      traceId,
    ],
  );

  const ledgerEntry = ledger.rows[0] || null;
  if (!ledgerEntry) {
    return { ledger: null, domainEvents: [] };
  }

  let subscription = null;
  try {
    const r = await client.query(
      `INSERT INTO user_subscriptions (user_id, plan, active_until, updated_at)
       VALUES ($1, $2, NOW() + make_interval(0, 0, 0, $3::int, 0, 0, 0), NOW())
       ON CONFLICT (user_id) DO UPDATE
       SET plan = EXCLUDED.plan,
           active_until = GREATEST(
             COALESCE(user_subscriptions.active_until, NOW()),
             NOW()
           ) + make_interval(0, 0, 0, $3::int, 0, 0, 0),
           updated_at = NOW()
       WHERE user_subscriptions.user_id = EXCLUDED.user_id
       RETURNING *`,
      [userId, plan, durationDays],
    );
    subscription = r.rows[0] || null;
  } catch (e) {
    if (String(e?.code) !== '42P01') throw e;
  }

  const domainEvents = [
    {
      type: 'subscription.activated',
      idempotency_key: String(paymentId),
      payload: {
        user_id: userId,
        plan,
        duration_days: durationDays,
        active_until: subscription?.active_until || null,
        payment_id: paymentId,
        ledger_entry_id: ledgerEntry.id,
        trace_id: traceId,
      },
      occurred_at: new Date().toISOString(),
    },
  ];

  return { ledger: ledgerEntry, domainEvents, subscription };
}

export const subscriptionHandler = { validate, execute };
