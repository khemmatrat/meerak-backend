/**
 * Penalty Manager — Partner No-Show
 * Refund 100% to client + Fine partner 20-30% of job value
 * If wallet insufficient → allow negative balance (debt)
 * @param {import('pg').Pool} pool - DB pool (injected from server)
 */
const round2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

async function getNoShowConfig(pool) {
  const r = await pool.query(
    `SELECT key, value_json FROM no_show_penalty_config`
  ).catch(() => ({ rows: [] }));
  const map = {};
  (r.rows || []).forEach((row) => { map[row.key] = parseFloat(row.value_json) || 0; });
  return {
    refundClientPercent: map.refund_client_percent ?? 100,
    finePartnerPercentMin: map.fine_partner_percent_min ?? 20,
    finePartnerPercentMax: map.fine_partner_percent_max ?? 30,
  };
}

/**
 * Apply no-show penalty: refund client, fine partner (debt if insufficient)
 * @param {import('pg').Pool} pool - DB pool
 * @param {object} params - { bookingId?, jobId?, providerId, clientId, jobValue }
 * @returns {Promise<{ success, refundAmount, fineAmount, providerDebtAfter }>}
 */
async function applyNoShowPenalty(pool, params) {
  const { bookingId, jobId, providerId, clientId, jobValue } = params;
  const cfg = await getNoShowConfig(pool);
  const refundAmount = round2(jobValue * (cfg.refundClientPercent / 100));
  const finePercent = (cfg.finePartnerPercentMin + cfg.finePartnerPercentMax) / 2;
  const fineAmount = round2(jobValue * (finePercent / 100));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Refund client
    await client.query(
      `UPDATE users SET wallet_balance = wallet_balance + $1, updated_at = NOW() WHERE id = $2`,
      [refundAmount, clientId]
    );

    // 2. Fine partner (อาจติดลบ = debt)
    await client.query(
      `UPDATE users SET wallet_balance = wallet_balance - $1, updated_at = NOW() WHERE id = $2`,
      [fineAmount, providerId]
    );

    // 3. Get provider balance after
    const balRow = await client.query('SELECT wallet_balance FROM users WHERE id = $1', [providerId]);
    const providerDebtAfter = parseFloat(balRow.rows?.[0]?.wallet_balance || 0);

    // 4. Record no_show_events
    await client.query(
      `INSERT INTO no_show_events (job_id, booking_id, provider_id, client_id, job_value, refund_amount, fine_amount, provider_debt_after)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [jobId || null, bookingId || null, providerId, clientId, jobValue, refundAmount, fineAmount, providerDebtAfter]
    );

    // 5. Ledger audit: no_show_refund (client) + no_show_fine (partner debt)
    const refId = `L-noshow-ref-${(bookingId || jobId || 'job')}-${Date.now()}`;
    const fineId = `L-noshow-fine-${(bookingId || jobId || 'job')}-${Date.now()}`;
    const billNo = bookingId ? `BOOK-${bookingId}` : `JOB-${jobId || 'unknown'}`;
    await client.query(
      `INSERT INTO payment_ledger_audit (id, event_type, payment_id, gateway, job_id, amount, currency, status, bill_no, transaction_no, user_id, metadata)
       VALUES ($1, 'no_show_refund', $2, 'wallet', $3, $4, 'THB', 'completed', $5, $6, $7, $8)`,
      [refId, String(bookingId || jobId || refId), String(jobId || bookingId || 'noshow'), refundAmount, billNo, `T-noshow-ref-${Date.now()}`, clientId, JSON.stringify({ leg: 'no_show_refund', booking_id: bookingId, job_id: jobId })]
    );
    await client.query(
      `INSERT INTO payment_ledger_audit (id, event_type, payment_id, gateway, job_id, amount, currency, status, bill_no, transaction_no, provider_id, metadata)
       VALUES ($1, 'no_show_fine', $2, 'wallet', $3, $4, 'THB', 'completed', $5, $6, $7, $8)`,
      [fineId, String(bookingId || jobId || fineId), String(jobId || bookingId || 'noshow'), fineAmount, billNo, `T-noshow-fine-${Date.now()}`, providerId, JSON.stringify({ leg: 'no_show_fine', provider_debt_after: providerDebtAfter })]
    );

    await client.query('COMMIT');
    return { success: true, refundAmount, fineAmount, providerDebtAfter };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export { applyNoShowPenalty, getNoShowConfig };
