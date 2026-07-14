/**
 * Composite user risk profile — anomalies + linked accounts (device/IP/bank).
 */

function num(v, fallback = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function tierFromScore(score) {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  if (s >= 75) return 'critical';
  if (s >= 50) return 'high';
  if (s >= 25) return 'medium';
  if (s > 0) return 'low';
  return 'none';
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} userId
 */
export async function buildUserRiskProfile(pool, userId) {
  const uid = String(userId || '').trim();
  if (!uid) return null;

  const [
    anomalyRes,
    deviceHopRes,
    linkedIpRes,
    bankDupRes,
    velocityRes,
    userRes,
  ] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(risk_score), 0)::int AS total,
              COUNT(*)::int AS flag_count,
              jsonb_agg(jsonb_build_object(
                'type', anomaly_type, 'score', risk_score, 'level', risk_level, 'reason', reason
              ) ORDER BY created_at DESC) FILTER (WHERE id IS NOT NULL) AS flags
       FROM security_anomalies
       WHERE user_id = $1::uuid AND resolved_at IS NULL`,
      [uid],
    ).catch(() => ({ rows: [{ total: 0, flag_count: 0, flags: [] }] })),
    pool.query(
      `SELECT COUNT(DISTINCT ip_address)::int AS ip_count_24h
       FROM user_login_sessions
       WHERE user_id = $1::uuid
         AND created_at > NOW() - INTERVAL '24 hours'
         AND ip_address IS NOT NULL`,
      [uid],
    ).catch(() => ({ rows: [{ ip_count_24h: 0 }] })),
    pool.query(
      `SELECT DISTINCT s2.user_id::text AS linked_user_id,
              u.email AS linked_email,
              u.full_name AS linked_name,
              s1.ip_address AS shared_ip,
              MAX(s2.created_at) AS last_seen
       FROM user_login_sessions s1
       JOIN user_login_sessions s2
         ON s2.ip_address = s1.ip_address
        AND s2.user_id <> s1.user_id
        AND s2.created_at > NOW() - INTERVAL '90 days'
       JOIN users u ON u.id = s2.user_id
       WHERE s1.user_id = $1::uuid
         AND s1.created_at > NOW() - INTERVAL '90 days'
         AND s1.ip_address IS NOT NULL
       GROUP BY s2.user_id, u.email, u.full_name, s1.ip_address
       ORDER BY MAX(s2.created_at) DESC
       LIMIT 15`,
      [uid],
    ).catch(() => ({ rows: [] })),
    pool.query(
      `WITH mine AS (
         SELECT DISTINCT regexp_replace(COALESCE(elem->>'account_number', ''), '[^0-9]', '', 'g') AS acct_norm,
                COALESCE(elem->>'account_number', '') AS account_number_raw,
                COALESCE(elem->>'bank_name', elem->>'provider_name', '') AS bank_name
         FROM users u
         CROSS JOIN LATERAL jsonb_array_elements(COALESCE(u.bank_accounts, '[]'::jsonb)) elem
         WHERE u.id = $1::uuid
       ),
       payout_mine AS (
         SELECT DISTINCT regexp_replace(COALESCE(p.bank_details->>'account_number', ''), '[^0-9]', '', 'g') AS acct_norm,
                COALESCE(p.bank_details->>'account_number', '') AS account_number_raw,
                COALESCE(p.bank_details->>'bank_name', p.bank_details->>'provider_name', '') AS bank_name
         FROM payout_requests p
         WHERE p.user_id = $1::uuid AND COALESCE(p.bank_details->>'account_number', '') <> ''
       ),
       all_mine AS (
         SELECT * FROM mine WHERE length(acct_norm) >= 6
         UNION SELECT * FROM payout_mine WHERE length(acct_norm) >= 6
       )
       SELECT DISTINCT ON (m.acct_norm, u.id)
         m.account_number_raw AS account_number,
         m.bank_name,
         u.id::text AS linked_user_id,
         u.full_name AS linked_name,
         u.email AS linked_email,
         'bank_accounts' AS link_type
       FROM all_mine m
       JOIN users u ON u.id <> $1::uuid
       CROSS JOIN LATERAL jsonb_array_elements(COALESCE(u.bank_accounts, '[]'::jsonb)) elem
       WHERE regexp_replace(COALESCE(elem->>'account_number', ''), '[^0-9]', '', 'g') = m.acct_norm
       LIMIT 15`,
      [uid],
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE event_type = 'wallet_deposit' AND created_at > NOW() - INTERVAL '24 hours')::int AS deposits_24h,
         COUNT(*) FILTER (WHERE event_type = 'user_payout_withdrawal' AND created_at > NOW() - INTERVAL '24 hours')::int AS withdrawals_24h
       FROM payment_ledger_audit
       WHERE user_id = $1::text`,
      [uid],
    ).catch(() => ({ rows: [{}] })),
    pool.query(
      `SELECT id, email, full_name, kyc_status, account_status, wallet_frozen FROM users WHERE id = $1::uuid`,
      [uid],
    ).catch(() => ({ rows: [] })),
  ]);

  const anomalyTotal = Number(anomalyRes.rows?.[0]?.total || 0);
  const anomalyFlags = anomalyRes.rows?.[0]?.flags || [];
  const ipCount24h = Number(deviceHopRes.rows?.[0]?.ip_count_24h || 0);
  const linkedByIp = (linkedIpRes.rows || []).map((r) => ({
    linked_user_id: r.linked_user_id,
    linked_email: r.linked_email,
    linked_name: r.linked_name,
    shared_ip: r.shared_ip,
    link_type: 'shared_ip',
    last_seen: r.last_seen,
  }));
  const linkedByBank = (bankDupRes.rows || []).map((r) => ({
    linked_user_id: r.linked_user_id,
    linked_email: r.linked_email,
    linked_name: r.linked_name,
    account_number: r.account_number,
    bank_name: r.bank_name,
    link_type: r.link_type || 'duplicate_bank',
  }));

  const dep24 = Number(velocityRes.rows?.[0]?.deposits_24h || 0);
  const wd24 = Number(velocityRes.rows?.[0]?.withdrawals_24h || 0);

  const components = [];
  let composite = 0;

  const anomalyPts = Math.min(40, anomalyTotal);
  if (anomalyPts > 0) {
    components.push({ code: 'security_anomalies', points: anomalyPts, detail: `${anomalyRes.rows?.[0]?.flag_count || 0} flags` });
    composite += anomalyPts;
  }

  if (ipCount24h > 3) {
    const pts = Math.min(20, 10 + (ipCount24h - 3) * 2);
    components.push({ code: 'device_hopping', points: pts, detail: `${ipCount24h} IP / 24h` });
    composite += pts;
  }

  if (linkedByIp.length > 0) {
    const pts = Math.min(25, linkedByIp.length * 8);
    components.push({ code: 'linked_ip_accounts', points: pts, detail: `${linkedByIp.length} users share IP` });
    composite += pts;
  }

  if (linkedByBank.length > 0) {
    const pts = Math.min(40, linkedByBank.length * 15);
    components.push({ code: 'duplicate_bank', points: pts, detail: `${linkedByBank.length} duplicate bank` });
    composite += pts;
  }

  if (dep24 >= 10) {
    const pts = dep24 >= 20 ? 15 : 10;
    components.push({ code: 'deposit_velocity', points: pts, detail: `${dep24} deposits / 24h` });
    composite += pts;
  }

  if (wd24 >= 5) {
    const pts = wd24 >= 10 ? 12 : 8;
    components.push({ code: 'withdraw_velocity', points: pts, detail: `${wd24} withdrawals / 24h` });
    composite += pts;
  }

  const user = userRes.rows?.[0] || {};
  const kyc = String(user.kyc_status || '').toLowerCase();
  if (!['verified', 'approved'].includes(kyc) && wd24 > 0) {
    components.push({ code: 'kyc_unverified_withdrawal', points: 12, detail: 'KYC not verified + withdrawals' });
    composite += 12;
  }

  composite = Math.min(100, composite);

  const linkedAccounts = [...linkedByIp, ...linkedByBank];
  const uniqueLinked = new Map();
  for (const l of linkedAccounts) {
    if (!uniqueLinked.has(l.linked_user_id)) uniqueLinked.set(l.linked_user_id, l);
  }

  return {
    user_id: uid,
    composite_score: composite,
    composite_tier: tierFromScore(composite),
    anomaly_score: anomalyTotal,
    anomaly_flag_count: Number(anomalyRes.rows?.[0]?.flag_count || 0),
    anomaly_flags: Array.isArray(anomalyFlags) ? anomalyFlags.slice(0, 10) : [],
    device_hopping_24h: ipCount24h > 3,
    ip_count_24h: ipCount24h,
    linked_accounts: [...uniqueLinked.values()],
    linked_account_count: uniqueLinked.size,
    linked_by_ip: linkedByIp,
    linked_by_bank: linkedByBank,
    score_components: components,
    account_status: user.account_status || null,
    wallet_frozen: !!user.wallet_frozen,
    kyc_status: user.kyc_status || null,
  };
}
