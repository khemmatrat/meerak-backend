/**
 * Security Pulse API — Cyber Command Center
 * GET /api/admin/security/stats, POST /api/admin/security/verify-all
 * Live metrics: failed logins, ledger integrity, suspicious payouts, rate limit status
 */
export function registerSecurityPulseRoutes(app, pool, adminAuthMiddleware, getRateLimitSize, auditService) {
  if (!pool) return;

  // ── GET /api/admin/security/stats ──
  app.get('/api/admin/security/stats', adminAuthMiddleware, async (req, res) => {
    try {
      const adminId = req.adminUser?.id || 'unknown';

      // 1. Failed logins (24h) — from audit_log (user + admin)
      let failedLogins24h = 0;
      try {
        const fl = await pool.query(`
          SELECT COUNT(*)::int AS cnt FROM audit_log
          WHERE (action = 'login_failed' OR action = 'admin_login_failed' OR action = 'admin_login_denied')
          AND status = 'Failed'
          AND created_at >= NOW() - INTERVAL '24 hours'
        `);
        failedLogins24h = fl.rows?.[0]?.cnt ?? 0;
      } catch (_) {}

      // 1b. Brute-force detection: IPs with >=5 failed logins in 24h
      let bruteForceIps = [];
      try {
        const bf = await pool.query(`
          SELECT ip_address AS ip, COUNT(*)::int AS cnt
          FROM audit_log
          WHERE (action = 'login_failed' OR action = 'admin_login_failed')
          AND status = 'Failed' AND ip_address IS NOT NULL AND ip_address != ''
          AND created_at >= NOW() - INTERVAL '24 hours'
          GROUP BY ip_address HAVING COUNT(*) >= 5
          ORDER BY cnt DESC LIMIT 10
        `);
        bruteForceIps = (bf.rows || []).map((r) => ({ ip: r.ip, count: r.cnt }));
      } catch (_) {}

      // 2. Ledger integrity — latest from verify
      let ledgerIntegrity = { valid: null, totalRows: 0, note: 'Not run' };
      try {
        const ir = await pool.query('SELECT verify_ledger_chain_integrity() AS result');
        const r = ir.rows?.[0]?.result;
        if (r) {
          ledgerIntegrity = {
            valid: !!r.valid,
            totalRows: r.total_rows ?? 0,
            firstBroken: r.first_broken ?? null,
            note: r.valid ? 'Chain valid' : 'Tamper detected',
          };
        }
      } catch (_) {
        ledgerIntegrity = { valid: null, totalRows: 0, note: 'verify_ledger_chain_integrity not available' };
      }

      // 3. Suspicious payouts — amount > 50k THB or created in last 24h
      let suspiciousPayouts = [];
      try {
        const sp = await pool.query(`
          SELECT pr.id, pr.user_id, pr.amount, pr.status, pr.created_at, u.full_name, u.phone
          FROM payout_requests pr
          JOIN users u ON u.id = pr.user_id
          WHERE pr.status IN ('pending', 'approved')
          AND (pr.amount >= 50000 OR pr.created_at >= NOW() - INTERVAL '24 hours')
          ORDER BY pr.created_at DESC LIMIT 20
        `);
        suspiciousPayouts = (sp.rows || []).map((r) => ({
          id: r.id,
          userId: r.user_id,
          amount: parseFloat(r.amount) || 0,
          status: r.status,
          createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
          userName: r.full_name || r.phone,
        }));
      } catch (_) {}

      // 4. Rate limit status
      const rateLimitEntries = typeof getRateLimitSize === 'function' ? getRateLimitSize() : 0;

      // 5. Recent security events (24h)
      let recentEvents = [];
      try {
        const ev = await pool.query(`
          SELECT id, actor_type, actor_id, action, entity_type, entity_id, reason, created_at
          FROM system_event_log
          WHERE created_at >= NOW() - INTERVAL '24 hours'
          ORDER BY created_at DESC LIMIT 50
        `);
        const auditEv = await pool.query(`
          SELECT id, actor_id, action, entity_name, entity_id, status, ip_address, created_at
          FROM audit_log
          WHERE (action LIKE '%login%' OR action LIKE '%logout%' OR action LIKE '%suspend%' OR action LIKE '%ban%' OR action LIKE '%force_logout%' OR status = 'Failed')
          AND created_at >= NOW() - INTERVAL '24 hours'
          ORDER BY created_at DESC LIMIT 30
        `);
        const toLabel = (r) => {
          if (r.action === 'login_failed') return `Failed login attempt (IP: ${r.ip_address || r.entity_id})`;
          if (r.action === 'admin_login_failed') return `Admin login failed: ${r.entity_id} (IP: ${r.ip_address || '—'})`;
          if (r.action === 'admin_login_denied') return `Admin access denied: ${r.entity_id}`;
          if (r.action === 'force_logout') return `Force logout: user ${r.entity_id}`;
          if (r.action?.includes('suspend')) return `Account suspended: ${r.entity_id}`;
          if (r.action?.includes('ban')) return `User banned: ${r.entity_id}`;
          return r.action || '—';
        };
        recentEvents = [
          ...(ev.rows || []).map((r) => ({
            source: 'system_event',
            id: r.id,
            actorType: r.actor_type,
            actorId: r.actor_id,
            action: r.action,
            entityType: r.entity_type,
            entityId: r.entity_id,
            reason: r.reason,
            label: r.action === 'COLLISION_24HR_BAN' ? `24h ban: user ${r.entity_id}` : r.action,
            createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
          })),
          ...(auditEv.rows || []).map((r) => ({
            source: 'audit_log',
            id: r.id,
            actorId: r.actor_id,
            action: r.action,
            entityName: r.entity_name,
            entityId: r.entity_id,
            status: r.status,
            ipAddress: r.ip_address,
            label: toLabel(r),
            createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
          })),
        ].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 30);
      } catch (_) {}

      // Log access
      try {
        await pool.query(
          `INSERT INTO system_event_log (actor_type, actor_id, action, entity_type, state_after)
           VALUES ('admin', $1, 'SECURITY_STATS_ACCESS', 'security', $2)`,
          [adminId, JSON.stringify({ at: new Date().toISOString() })]
        );
      } catch (_) {}

      res.json({
        failedLogins24h,
        bruteForceIps,
        ledgerIntegrity,
        suspiciousPayouts,
        rateLimitEntries,
        recentEvents,
      });
    } catch (e) {
      console.error('GET /api/admin/security/stats error:', e);
      res.status(500).json({ error: 'Failed to fetch security stats' });
    }
  });

  // ── GET /api/admin/security/blocked-ips ──
  app.get('/api/admin/security/blocked-ips', adminAuthMiddleware, async (req, res) => {
    try {
      const r = await pool.query(`
        SELECT id, ip_address::text AS ip, reason, blocked_by, blocked_at, expires_at, status
        FROM security_blocked_ips WHERE status = 'active'
        ORDER BY blocked_at DESC LIMIT 200
      `);
      res.json({ blockedIps: r.rows || [] });
    } catch (e) {
      if (e.code === '42P01') return res.json({ blockedIps: [] }); // table not exists
      console.error('GET blocked-ips error:', e);
      res.status(500).json({ error: 'Failed to fetch blocked IPs' });
    }
  });

  // ── POST /api/admin/security/block-ip ──
  app.post('/api/admin/security/block-ip', adminAuthMiddleware, async (req, res) => {
    try {
      const adminId = req.adminUser?.id || 'unknown';
      const { ip, reason } = req.body || {};
      if (!ip || typeof ip !== 'string') return res.status(400).json({ error: 'ip required' });
      const ipClean = ip.trim().replace(/^\[|\]$/g, '');
      await pool.query(`
        INSERT INTO security_blocked_ips (ip_address, reason, blocked_by, status)
        SELECT $1::inet, $2, $3, 'active'
        WHERE NOT EXISTS (SELECT 1 FROM security_blocked_ips WHERE ip_address = $1::inet AND status = 'active')
      `, [ipClean, reason || 'Manual block via Security Center', adminId]);
      await pool.query(
        `INSERT INTO system_event_log (actor_type, actor_id, action, entity_type, state_after)
         VALUES ('admin', $1, 'SECURITY_BLOCK_IP', 'ip', $2)`,
        [adminId, JSON.stringify({ ip: ipClean, reason: reason || '', at: new Date().toISOString() })]
      );
      res.json({ success: true, ip: ipClean });
    } catch (e) {
      if (e.code === '42P01') return res.status(501).json({ error: 'Run migration 077 first' });
      console.error('POST block-ip error:', e);
      res.status(500).json({ error: e.message || 'Failed to block IP' });
    }
  });

  // ── POST /api/admin/security/unblock-ip ──
  app.post('/api/admin/security/unblock-ip', adminAuthMiddleware, async (req, res) => {
    try {
      const adminId = req.adminUser?.id || 'unknown';
      const { ip } = req.body || {};
      if (!ip) return res.status(400).json({ error: 'ip required' });
      await pool.query(
        `UPDATE security_blocked_ips SET status = 'removed' WHERE ip_address = $1::inet AND status = 'active'`,
        [ip.trim()]
      );
      await pool.query(
        `INSERT INTO system_event_log (actor_type, actor_id, action, entity_type, state_after)
         VALUES ('admin', $1, 'SECURITY_UNBLOCK_IP', 'ip', $2)`,
        [adminId, JSON.stringify({ ip: ip.trim(), at: new Date().toISOString() })]
      );
      res.json({ success: true, ip: ip.trim() });
    } catch (e) {
      if (e.code === '42P01') return res.status(501).json({ error: 'Run migration 077 first' });
      console.error('POST unblock-ip error:', e);
      res.status(500).json({ error: e.message || 'Failed to unblock IP' });
    }
  });

  // ── GET /api/admin/security/high-risk-users ──
  app.get('/api/admin/security/high-risk-users', adminAuthMiddleware, async (req, res) => {
    try {
      const { getHighRiskUsers } = await import('../lib/anomalyService.js');
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
      const offset = parseInt(req.query.offset, 10) || 0;
      const users = await getHighRiskUsers(pool, { limit, offset });
      res.json({ users });
    } catch (e) {
      if (e.code === '42P01') return res.json({ users: [] });
      console.error('GET high-risk-users error:', e);
      res.status(500).json({ error: 'Failed to fetch high-risk users' });
    }
  });

  // ── POST /api/admin/security/verify-all ──
  app.post('/api/admin/security/verify-all', adminAuthMiddleware, async (req, res) => {
    try {
      const adminId = req.adminUser?.id || 'unknown';

      // Run verify_ledger_chain_integrity
      const result = await pool.query('SELECT verify_ledger_chain_integrity() AS result');
      const data = result.rows?.[0]?.result || {};
      const valid = data.valid === true;

      await pool.query(
        `INSERT INTO system_event_log (actor_type, actor_id, action, entity_type, state_after)
         VALUES ('admin', $1, 'SECURITY_VERIFY_ALL', 'ledger', $2)`,
        [adminId, JSON.stringify({ valid, totalRows: data.total_rows, firstBroken: data.first_broken, at: new Date().toISOString() })]
      );

      res.json({
        valid,
        totalRows: data.total_rows ?? 0,
        firstBroken: data.first_broken ?? null,
        message: valid ? 'Ledger checksum chain verified' : 'Integrity check failed: chain broken',
      });
    } catch (e) {
      if (e.message && (e.message.includes('verify_ledger_chain_integrity') || e.message.includes('does not exist'))) {
        return res.status(501).json({
          valid: false,
          totalRows: 0,
          firstBroken: null,
          message: 'Verification function not installed. Run migration 073.',
        });
      }
      console.error('POST /api/admin/security/verify-all error:', e);
      res.status(500).json({ error: e.message });
    }
  });
}
