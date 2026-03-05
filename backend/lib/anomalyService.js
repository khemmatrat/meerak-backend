/**
 * Anomaly Service — 5 ธงแดงมหาประลัย (High-Risk Triggers)
 * Records flagged events and applies Risk Scorer (score > 80 → auto-suspend)
 */

const RISK_POINTS = {
  identity_swap: 40,
  first_timer_burst: 25,
  teleportation: 30,
  rapid_ledger: 35,
  night_owl: 15,
};

const AUTO_SUSPEND_THRESHOLD = 80;

/**
 * Record an anomaly and optionally apply auto-suspend
 * @param {import('pg').Pool} pool
 * @param {string} userId
 * @param {string} anomalyType - identity_swap | first_timer_burst | teleportation | rapid_ledger | night_owl
 * @param {object} opts - { riskLevel, reason, metadata }
 */
async function recordAnomaly(pool, userId, anomalyType, opts = {}) {
  const riskLevel = opts.riskLevel || 'high';
  const reason = opts.reason || '';
  const metadata = opts.metadata || {};
  const points = RISK_POINTS[anomalyType] || 20;

  try {
    const existing = await pool.query(
      `SELECT COALESCE(SUM(risk_score), 0)::int AS total FROM security_anomalies WHERE user_id = $1 AND resolved_at IS NULL`,
      [userId]
    );
    const currentTotal = existing.rows?.[0]?.total || 0;
    const newTotal = Math.min(100, currentTotal + points);

    await pool.query(
      `INSERT INTO security_anomalies (user_id, anomaly_type, risk_level, risk_score, reason, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [userId, anomalyType, riskLevel, points, reason, JSON.stringify(metadata)]
    );

    if (newTotal >= AUTO_SUSPEND_THRESHOLD) {
      await autoSuspendForHighRisk(pool, userId, newTotal, anomalyType);
    }
  } catch (e) {
    console.error('[AnomalyService] recordAnomaly failed:', e?.message);
  }
}

async function autoSuspendForHighRisk(pool, userId, score, lastTrigger) {
  try {
    await pool.query(
      `UPDATE users SET account_status = 'suspended', updated_at = NOW() WHERE id = $1`,
      [userId]
    );
    await pool.query(
      `INSERT INTO system_event_log (actor_type, actor_id, action, entity_type, entity_id, state_after, reason)
       VALUES ('system', $1, 'ANOMALY_AUTO_SUSPEND', 'users', $1, $2, $3)`,
      [userId, JSON.stringify({ risk_score: score, trigger: lastTrigger }), `Risk score ${score} >= ${AUTO_SUSPEND_THRESHOLD}`]
    );
  } catch (e) {
    console.error('[AnomalyService] autoSuspend failed:', e?.message);
  }
}

/**
 * Record password or phone change for Identity Swap detection
 */
async function recordIdentityChange(pool, userId, eventType, ipAddress = null) {
  try {
    await pool.query(
      `INSERT INTO security_identity_events (user_id, event_type, ip_address) VALUES ($1, $2, $3)`,
      [userId, eventType, ipAddress]
    );
  } catch (e) {
    console.error('[AnomalyService] recordIdentityChange failed:', e?.message);
  }
}

/**
 * Check Identity Swap: password/phone change + withdrawal to new bank within 15 min
 * Returns true if should hold payout 24h
 */
async function checkIdentitySwap(pool, userId, bankDetails) {
  try {
    const recentIdentity = await pool.query(
      `SELECT 1 FROM security_identity_events
       WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '15 minutes'
       LIMIT 1`,
      [userId]
    );
    if (!recentIdentity.rows?.length) return false;

    const accountNum = bankDetails?.account_number || bankDetails?.accountNumber || bankDetails?.number || '';
    if (!accountNum) return false;

    const priorUse = await pool.query(
      `SELECT 1 FROM payout_requests
       WHERE user_id = $1 AND created_at < NOW()
         AND (bank_details->>'account_number' = $2 OR bank_details->>'accountNumber' = $2 OR bank_details->>'number' = $2)
       LIMIT 1`,
      [userId, String(accountNum)]
    );
    if (priorUse.rows?.length) return false;

    await recordAnomaly(pool, userId, 'identity_swap', {
      riskLevel: 'critical',
      reason: 'Password/phone change + withdrawal to new bank within 15 min',
      metadata: { bank_snippet: String(accountNum).slice(-4) },
    });
    return true;
  } catch (e) {
    console.error('[AnomalyService] checkIdentitySwap failed:', e?.message);
    return false;
  }
}

/**
 * Check First-Timer Burst: account < 48h + (amount > 20000 OR 10 jobs in 1h)
 */
async function checkFirstTimerBurst(pool, userId, amount = 0) {
  try {
    const user = await pool.query(
      `SELECT created_at FROM users WHERE id = $1`,
      [userId]
    );
    if (!user.rows?.length) return;
    const created = new Date(user.rows[0].created_at);
    const hoursSince = (Date.now() - created.getTime()) / (1000 * 60 * 60);
    if (hoursSince >= 48) return;

    let triggered = amount > 20000;
    if (!triggered) {
      const jobs = await pool.query(
        `SELECT COUNT(*)::int AS c FROM jobs WHERE accepted_by = $1 AND created_at >= NOW() - INTERVAL '1 hour'`,
        [userId]
      );
      triggered = (jobs.rows?.[0]?.c || 0) >= 10;
    }
    if (triggered) {
      await recordAnomaly(pool, userId, 'first_timer_burst', {
        riskLevel: 'medium',
        reason: 'New account (<48h) with high activity',
        metadata: { amount, hours_since_created: Math.round(hoursSince * 10) / 10 },
      });
    }
  } catch (e) {
    console.error('[AnomalyService] checkFirstTimerBurst failed:', e?.message);
  }
}

/**
 * Check Teleportation: Login from 2 IPs in different province/country within 30 min
 * Uses IP-to-geo (ip-api.com) to detect impossible travel
 */
async function checkTeleportation(pool, userId, currentIp) {
  try {
    const recentLogins = await pool.query(
      `SELECT DISTINCT ip_address FROM audit_log
       WHERE actor_id = $1 AND action = 'login_success' AND status = 'Success'
         AND ip_address IS NOT NULL AND ip_address != ''
         AND created_at >= NOW() - INTERVAL '30 minutes'`,
      [String(userId)]
    );
    const ips = [...new Set((recentLogins.rows || []).map((r) => r.ip_address).filter(Boolean))];
    if (currentIp && !ips.includes(currentIp)) ips.push(currentIp);
    const uniqueIps = [...new Set(ips)];
    if (uniqueIps.length < 2) return false;

    const { lookupIpGeo, isGeoFar } = await import('./geoLookup.js');
    const geos = await Promise.all(uniqueIps.map((ip) => lookupIpGeo(ip)));
    let hasFarPair = false;
    for (let i = 0; i < geos.length && !hasFarPair; i++) {
      for (let j = i + 1; j < geos.length; j++) {
        if (isGeoFar(geos[i], geos[j])) {
          hasFarPair = true;
          break;
        }
      }
    }
    if (hasFarPair) {
      await recordAnomaly(pool, userId, 'teleportation', {
        riskLevel: 'high',
        reason: 'Login from different province/country within 30 minutes (impossible travel)',
        metadata: {
          ips: uniqueIps,
          locations: uniqueIps.map((ip, idx) => ({ ip, ...(geos[idx] || {}) })),
        },
      });
      return true;
    }
    return false;
  } catch (e) {
    console.error('[AnomalyService] checkTeleportation failed:', e?.message);
    return false;
  }
}

/**
 * Check Night Owl: Sensitive data edit between 02:00-04:00 Bangkok
 */
function isNightOwlHour() {
  const now = new Date();
  const bangkok = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const hour = bangkok.getHours();
  return hour >= 2 && hour < 4;
}

/**
 * Check Rapid Ledger: 5+ wallet in/out in 1 min for same user
 */
async function checkRapidLedger(pool, userId) {
  try {
    const count = await pool.query(
      `SELECT COUNT(*)::int AS c FROM payment_ledger_audit
       WHERE (user_id::text = $1 OR provider_id::text = $1) AND created_at >= NOW() - INTERVAL '1 minute'
         AND event_type IN ('wallet_deposit', 'user_payout_withdrawal', 'escrow_held', 'escrow_released', 'wallet_tip')`,
      [String(userId)]
    );
    const c = count.rows?.[0]?.c || 0;
    if (c >= 5) {
      await recordAnomaly(pool, userId, 'rapid_ledger', {
        riskLevel: 'critical',
        reason: '5+ wallet transactions in 1 minute',
        metadata: { count: c },
      });
      return true;
    }
    return false;
  } catch (e) {
    console.error('[AnomalyService] checkRapidLedger failed:', e?.message);
    return false;
  }
}

/**
 * Get high-risk users for Admin UI
 */
async function getHighRiskUsers(pool, opts = {}) {
  const limit = Math.min(parseInt(opts.limit, 10) || 50, 100);
  const offset = parseInt(opts.offset, 10) || 0;
  try {
    const r = await pool.query(
      `SELECT a.user_id, u.phone, u.email, u.full_name, u.account_status,
              SUM(a.risk_score) AS total_score, COUNT(*) AS flag_count,
              array_agg(DISTINCT a.anomaly_type) AS anomaly_types,
              MAX(a.created_at) AS latest_at
       FROM security_anomalies a
       JOIN users u ON u.id = a.user_id
       WHERE a.resolved_at IS NULL
       GROUP BY a.user_id, u.phone, u.email, u.full_name, u.account_status
       HAVING SUM(a.risk_score) > 0
       ORDER BY total_score DESC, latest_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return (r.rows || []).map((row) => ({
      user_id: String(row.user_id),
      phone: row.phone,
      email: row.email,
      full_name: row.full_name,
      account_status: row.account_status,
      total_score: parseInt(row.total_score, 10),
      flag_count: parseInt(row.flag_count, 10),
      anomaly_types: Array.isArray(row.anomaly_types) ? row.anomaly_types : (row.anomaly_types || []),
      latest_at: row.latest_at ? new Date(row.latest_at).toISOString() : null,
    }));
  } catch (e) {
    console.error('[AnomalyService] getHighRiskUsers failed:', e?.message);
    return [];
  }
}

export {
  recordAnomaly,
  recordIdentityChange,
  checkIdentitySwap,
  checkFirstTimerBurst,
  checkTeleportation,
  checkRapidLedger,
  isNightOwlHour,
  getHighRiskUsers,
  RISK_POINTS,
  AUTO_SUSPEND_THRESHOLD,
};
