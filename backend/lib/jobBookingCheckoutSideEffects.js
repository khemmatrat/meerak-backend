/**
 * Task 10: deterministic, schema-aware writes for job checkout (escrow held).
 * Never emits SQL against tables that are not present (to_regclass + column set).
 */

/**
 * @param {import('pg').PoolClient} client
 * @param {string} table
 * @returns {Promise<Set<string>>}
 */
export async function getTableColumnNames(client, table) {
  const r = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  return new Set((r.rows || []).map((x) => x.column_name));
}

/**
 * True if public.{name} exists as a base table (information_schema).
 * @param {import('pg').PoolClient} client
 * @param {string} fqTable e.g. 'public.job_bookings'
 */
export async function regclassExists(client, fqTable) {
  const dot = fqTable.indexOf('.');
  const schema = dot >= 0 ? fqTable.slice(0, dot) : 'public';
  const rel = dot >= 0 ? fqTable.slice(dot + 1) : fqTable;
  const r = await client.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = $1
         AND table_name = $2
         AND table_type = 'BASE TABLE'
     ) AS ok`,
    [schema, rel],
  );
  return !!r.rows?.[0]?.ok;
}

/**
 * Prefer job_bookings (legacy column shape, canonical shape, or skip if unknown),
 * else jobs.payment_details merge, else advance_jobs.escrow_status.
 *
 * @param {import('pg').PoolClient} client
 * @param {{ paymentId: string, jobId: string }} p
 * @returns {Promise<{ path: string }>}
 */
export async function applyJobCheckoutSideEffects(client, p) {
  const paymentId = String(p.paymentId || '').trim();
  const jobId = String(p.jobId || '').trim();
  if (!paymentId || !jobId) return { path: 'noop_missing_ids' };

  const bare = jobId.replace(/^job_/i, '');
  const idVariants = [...new Set([jobId, bare].filter(Boolean))];

  if (await regclassExists(client, 'public.job_bookings')) {
    const cols = await getTableColumnNames(client, 'job_bookings');
    const hasLegacy =
      cols.has('payment_status') && cols.has('escrow_status');
    const hasCanonical =
      cols.has('job_id') && cols.has('payment_id') && cols.has('status');

    if (hasLegacy) {
      const parts = [`payment_status = 'PAID'`, `escrow_status = 'HELD'`, `updated_at = NOW()`];
      if (cols.has('paid_at')) parts.push(`paid_at = COALESCE(paid_at, NOW())`);
      const setSql = parts.join(', ');
      const whereOr = [];
      if (cols.has('id')) whereOr.push(`id::text IN ($1, $2)`);
      if (cols.has('job_id')) whereOr.push(`job_id::text IN ($1, $2)`);
      if (!whereOr.length) {
        return { path: 'job_bookings_unknown_columns' };
      }
      await client.query(
        `UPDATE job_bookings
           SET ${setSql}
         WHERE (${whereOr.join(' OR ')})
           AND (payment_status IS NULL OR payment_status <> 'PAID')`,
        idVariants,
      );
      return { path: 'job_bookings_legacy' };
    }

    if (hasCanonical) {
      await client.query(
        `INSERT INTO job_bookings (job_id, payment_id, status, updated_at)
         VALUES ($1, $2, 'PAID_ESCROW_HELD', NOW())
         ON CONFLICT (job_id) DO UPDATE SET
           payment_id = EXCLUDED.payment_id,
           status = EXCLUDED.status,
           updated_at = NOW()`,
        [jobId, paymentId],
      );
      return { path: 'job_bookings_canonical_upsert' };
    }

    return { path: 'job_bookings_skip_unknown_shape' };
  }

  if (await regclassExists(client, 'public.jobs')) {
    const cols = await getTableColumnNames(client, 'jobs');
    if (cols.has('payment_details')) {
      await client.query(
        `UPDATE jobs
         SET payment_details = COALESCE(payment_details, '{}'::jsonb)
             || jsonb_build_object(
                  'task10_job_checkout',
                  jsonb_build_object(
                    'payment_id', to_jsonb($1::text),
                    'escrow', to_jsonb('held'::text),
                    'at', to_jsonb(NOW()::text)
                  )
                ),
             updated_at = NOW()
         WHERE id::text = $2 OR id::text = $3`,
        [paymentId, idVariants[0], idVariants[1] ?? idVariants[0]],
      );
      return { path: 'jobs_payment_details' };
    }
  }

  if (await regclassExists(client, 'public.advance_jobs')) {
    const cols = await getTableColumnNames(client, 'advance_jobs');
    if (cols.has('escrow_status')) {
      await client.query(
        `UPDATE advance_jobs
         SET escrow_status = 'held',
             updated_at = NOW()
         WHERE id::text = $1 OR id::text = $2`,
        [idVariants[0], idVariants[1] ?? idVariants[0]],
      );
      return { path: 'advance_jobs_escrow_held' };
    }
  }

  return { path: 'none' };
}
