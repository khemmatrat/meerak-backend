/**

 * Admin: composite risk profile, support cases, support pack export,

 * KYC lifecycle + WHT panel, support case queue admin.

 */

import { buildUserRiskProfile } from './userRiskScoreService.js';

import {

  getOrCreateSupportCase,

  buildSupportPack,

  supportPackToCsv,

  assignSupportCase,

  closeSupportCase,

  getCaseHistory,

  logCaseEvent,

  generateCaseId,

} from './supportCaseService.js';
import { fireSupportCaseSlack } from './supportCaseSlackNotify.js';
import {
  getAutoAssignConfig,
  runBulkAutoAssign,
  maybeAutoAssignCase,
} from './supportCaseAutoAssign.js';
import {
  buildSupportCaseAuditBundle,
  auditBundleToCsv,
} from './supportCaseAuditBundleService.js';
import { buildUser360Pack, user360ToCsv } from './user360ExportService.js';
import { buildSupportCaseSla } from './supportCaseSlaService.js';

function num(v, fallback = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}



function parseJsonArray(raw) {

  if (Array.isArray(raw)) return raw.map((x) => String(x));

  if (typeof raw === 'string' && raw.trim()) {

    try {

      const p = JSON.parse(raw);

      if (Array.isArray(p)) return p.map((x) => String(x));

    } catch { /* ignore */ }

  }

  return [];

}



export function registerUserSupportAdminRoutes(app, pool, adminAuthMiddleware) {

  app.get('/api/admin/users/:id/risk-profile', adminAuthMiddleware, async (req, res) => {

    try {

      const userId = String(req.params.id || '').trim();

      const profile = await buildUserRiskProfile(pool, userId);

      if (!profile) return res.status(404).json({ error: 'User not found' });

      res.json({ profile });

    } catch (e) {

      console.error('[risk-profile]', e?.message);

      res.status(500).json({ error: e?.message || 'Failed' });

    }

  });



  app.get('/api/admin/users/:id/kyc-lifecycle', adminAuthMiddleware, async (req, res) => {

    try {

      const userId = String(req.params.id || '').trim();

      const userRes = await pool.query(

        `SELECT id, kyc_status, kyc_level, kyc_submitted_at, kyc_verified_at, kyc_next_reverify_at,

                kyc_rejection_reason, kyc_admin_instruction, kyc_resubmission_deadline,

                kyc_required_steps, kyc_resubmit_trigger

         FROM users WHERE id = $1::uuid`,

        [userId],

      );

      if (!userRes.rows?.length) return res.status(404).json({ error: 'User not found' });

      const user = userRes.rows[0];

      const now = new Date();

      const nextReverify = user.kyc_next_reverify_at ? new Date(user.kyc_next_reverify_at) : null;

      const verifiedStatuses = new Set(['verified', 'approved']);

      const needsReverify = verifiedStatuses.has(String(user.kyc_status || '').toLowerCase())

        && nextReverify && nextReverify <= now;



      const supplements = await pool.query(

        `SELECT id, requested_docs, instruction, deadline, status, created_by, completed_at, created_at

         FROM kyc_supplement_requests

         WHERE user_id = $1::uuid

         ORDER BY created_at DESC

         LIMIT 20`,

        [userId],

      ).catch(() => ({ rows: [] }));



      const whtRes = await pool.query(

        `SELECT COUNT(*)::int AS cnt,

                COALESCE(SUM(gross_income_amount), 0)::numeric AS gross,

                COALESCE(SUM(withheld_amount), 0)::numeric AS withheld,

                COALESCE(SUM(net_payable_amount), 0)::numeric AS net

         FROM tax_withholding_postings

         WHERE provider_user_id = $1::uuid`,

        [userId],

      ).catch(() => ({ rows: [{ cnt: 0, gross: 0, withheld: 0, net: 0 }] }));



      const whtRecent = await pool.query(

        `SELECT id, source_event_type, source_job_id, gross_income_amount, wht_rate_percent,

                withheld_amount, net_payable_amount, eligibility_status, eligibility_reason, created_at

         FROM tax_withholding_postings

         WHERE provider_user_id = $1::uuid

         ORDER BY created_at DESC

         LIMIT 10`,

        [userId],

      ).catch(() => ({ rows: [] }));



      const wht = whtRes.rows?.[0] || {};

      res.json({

        lifecycle: {

          kyc_status: user.kyc_status,

          kyc_level: user.kyc_level,

          submitted_at: user.kyc_submitted_at,

          verified_at: user.kyc_verified_at,

          next_reverify_at: user.kyc_next_reverify_at,

          needs_reverify: !!needsReverify,

          rejection_reason: user.kyc_rejection_reason,

          admin_instruction: user.kyc_admin_instruction,

          resubmission_deadline: user.kyc_resubmission_deadline,

          required_steps: parseJsonArray(user.kyc_required_steps),

          resubmit_trigger: user.kyc_resubmit_trigger,

        },

        supplement_requests: (supplements.rows || []).map((r) => ({

          id: r.id,

          requested_docs: parseJsonArray(r.requested_docs),

          instruction: r.instruction,

          deadline: r.deadline,

          status: r.status,

          created_by: r.created_by,

          completed_at: r.completed_at,

          created_at: r.created_at,

        })),

        wht: {

          posting_count: Number(wht.cnt || 0),

          gross_total: num(wht.gross),

          withheld_total: num(wht.withheld),

          net_total: num(wht.net),

          recent: (whtRecent.rows || []).map((r) => ({

            id: r.id,

            source_event_type: r.source_event_type,

            source_job_id: r.source_job_id,

            gross_income_amount: num(r.gross_income_amount),

            wht_rate_percent: num(r.wht_rate_percent),

            withheld_amount: num(r.withheld_amount),

            net_payable_amount: num(r.net_payable_amount),

            eligibility_status: r.eligibility_status,

            eligibility_reason: r.eligibility_reason,

            created_at: r.created_at,

          })),

        },

      });

    } catch (e) {

      console.error('[kyc-lifecycle]', e?.message);

      res.status(500).json({ error: e?.message || 'Failed' });

    }

  });



  app.post('/api/admin/users/:id/support-case', adminAuthMiddleware, async (req, res) => {

    try {

      const userId = String(req.params.id || '').trim();

      const openedBy = req.adminUser?.email || req.adminUser?.id || 'admin';

      const subject = req.body?.subject ? String(req.body.subject).slice(0, 200) : null;

      const forceNew = !!req.body?.force_new;



      if (forceNew) {

        const caseId = generateCaseId();

        const r = await pool.query(

          `INSERT INTO user_support_cases (case_id, user_id, status, priority, subject, opened_by)

           VALUES ($1, $2::uuid, 'open', 'normal', $3, $4)

           RETURNING case_id, id, status, priority, subject, created_at, user_id`,

          [caseId, userId, subject || 'New support case', openedBy],

        );

        await logCaseEvent(pool, caseId, 'opened', openedBy, { subject: subject || null });

        fireSupportCaseSlack(pool, {
          kind: 'opened',
          caseRow: r.rows[0],
          actor: openedBy,
        });

        let autoAssign = null;
        try {
          autoAssign = await maybeAutoAssignCase(pool, r.rows[0], { actor: openedBy });
        } catch {
          /* non-fatal */
        }

        return res.status(201).json({ case: r.rows[0], created: true, auto_assign: autoAssign });

      }



      const result = await getOrCreateSupportCase(pool, userId, { openedBy, subject });

      res.status(result.created ? 201 : 200).json(result);

    } catch (e) {

      if (String(e?.code) === '42P01') {

        return res.status(503).json({ error: 'Run migration 229_user_support_risk_alerts.sql' });

      }

      res.status(500).json({ error: e?.message || 'Failed' });

    }

  });



  app.get('/api/admin/users/:id/support-case', adminAuthMiddleware, async (req, res) => {

    try {

      const userId = String(req.params.id || '').trim();

      const r = await pool.query(

        `SELECT case_id, status, priority, subject, opened_by, assigned_to, created_at, updated_at, closed_at

         FROM user_support_cases

         WHERE user_id = $1::uuid

         ORDER BY created_at DESC

         LIMIT 1`,

        [userId],

      ).catch(() => ({ rows: [] }));

      res.json({ case: r.rows?.[0] || null });

    } catch (e) {

      res.status(500).json({ error: e?.message });

    }

  });



  app.get('/api/admin/users/:id/support-cases', adminAuthMiddleware, async (req, res) => {

    try {

      const userId = String(req.params.id || '').trim();

      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 5), 50);

      const r = await pool.query(

        `SELECT case_id, status, priority, subject, opened_by, assigned_to, created_at, updated_at, closed_at

         FROM user_support_cases

         WHERE user_id = $1::uuid

         ORDER BY created_at DESC

         LIMIT $2`,

        [userId, limit],

      );

      res.json({ cases: r.rows || [] });

    } catch (e) {

      res.status(500).json({ error: e?.message });

    }

  });



  app.get('/api/admin/support-cases/sla', adminAuthMiddleware, async (req, res) => {

    try {

      const sla = await buildSupportCaseSla(pool);

      res.json({ sla });

    } catch (e) {

      if (String(e?.code) === '42P01') {

        return res.json({

          sla: {

            counts: { open_total: 0, open_stale_24h: 0, unassigned_priority: 0 },

            stale_open_cases: [],

            unassigned_urgent_cases: [],

          },

        });

      }

      console.error('[support-cases-sla]', e?.message);

      res.status(500).json({ error: e?.message });

    }

  });



  app.get('/api/admin/support-cases/auto-assign/status', adminAuthMiddleware, async (req, res) => {

    try {

      res.json({ auto_assign: getAutoAssignConfig() });

    } catch (e) {

      res.status(500).json({ error: e?.message });

    }

  });



  app.post('/api/admin/support-cases/auto-assign/run', adminAuthMiddleware, async (req, res) => {

    try {

      const actor = req.adminUser?.email || req.adminUser?.id || 'admin';

      const limit = Number(req.body?.limit) || 50;

      const result = await runBulkAutoAssign(pool, { actor, limit });

      res.json(result);

    } catch (e) {

      console.error('[support-cases-auto-assign]', e?.message);

      res.status(500).json({ error: e?.message });

    }

  });



  app.get('/api/admin/support-cases/:caseId/audit-bundle.json', adminAuthMiddleware, async (req, res) => {

    try {

      const bundle = await buildSupportCaseAuditBundle(pool, req.params.caseId);

      if (!bundle) return res.status(404).json({ error: 'Case not found' });

      res.json({ bundle });

    } catch (e) {

      console.error('[audit-bundle]', e?.message);

      res.status(500).json({ error: e?.message });

    }

  });



  app.get('/api/admin/support-cases/:caseId/audit-bundle.csv', adminAuthMiddleware, async (req, res) => {

    try {

      const bundle = await buildSupportCaseAuditBundle(pool, req.params.caseId);

      if (!bundle) return res.status(404).json({ error: 'Case not found' });

      const csv = auditBundleToCsv(bundle);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');

      res.setHeader('Content-Disposition', `attachment; filename="audit-bundle-${req.params.caseId}.csv"`);

      res.send(csv);

    } catch (e) {

      console.error('[audit-bundle-csv]', e?.message);

      res.status(500).json({ error: e?.message });

    }

  });



  app.get('/api/admin/support-cases', adminAuthMiddleware, async (req, res) => {

    try {

      const status = req.query.status ? String(req.query.status).trim() : null;

      const assigned = req.query.assigned_to ? String(req.query.assigned_to).trim() : null;

      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 10), 100);

      const params = [];

      const wheres = [];

      if (status) {

        params.push(status);

        wheres.push(`c.status = $${params.length}`);

      }

      if (assigned) {

        params.push(assigned);

        wheres.push(`c.assigned_to = $${params.length}`);

      }

      params.push(limit);

      const where = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';

      const rows = await pool.query(

        `SELECT c.case_id, c.user_id, c.status, c.priority, c.subject, c.opened_by,

                c.assigned_to, c.created_at, c.updated_at, c.closed_at,

                u.email AS user_email, u.full_name AS user_name

         FROM user_support_cases c

         LEFT JOIN users u ON u.id = c.user_id

         ${where}

         ORDER BY

           CASE c.priority

             WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3

           END,

           c.updated_at DESC

         LIMIT $${params.length}`,

        params,

      );

      res.json({ cases: rows.rows || [] });

    } catch (e) {

      if (String(e?.code) === '42P01') return res.json({ cases: [] });

      res.status(500).json({ error: e?.message });

    }

  });



  app.get('/api/admin/support-cases/:caseId', adminAuthMiddleware, async (req, res) => {

    try {

      const caseId = String(req.params.caseId || '').trim();

      const r = await pool.query(

        `SELECT c.*, u.email AS user_email, u.full_name AS user_name, u.phone AS user_phone

         FROM user_support_cases c

         LEFT JOIN users u ON u.id = c.user_id

         WHERE c.case_id = $1`,

        [caseId],

      );

      if (!r.rows?.length) return res.status(404).json({ error: 'Case not found' });

      const history = await getCaseHistory(pool, caseId);

      res.json({ case: r.rows[0], history });

    } catch (e) {

      res.status(500).json({ error: e?.message });

    }

  });



  app.patch('/api/admin/support-cases/:caseId/assign', adminAuthMiddleware, async (req, res) => {

    try {

      const caseId = String(req.params.caseId || '').trim();

      const assignedTo = String(req.body?.assigned_to || '').trim();

      if (!assignedTo) return res.status(400).json({ error: 'assigned_to required' });

      const actor = req.adminUser?.email || req.adminUser?.id || 'admin';

      const row = await assignSupportCase(pool, caseId, assignedTo, actor);

      if (!row) return res.status(404).json({ error: 'Case not found' });

      res.json({ case: row });

    } catch (e) {

      res.status(500).json({ error: e?.message });

    }

  });



  app.patch('/api/admin/support-cases/:caseId/close', adminAuthMiddleware, async (req, res) => {

    try {

      const caseId = String(req.params.caseId || '').trim();

      const actor = req.adminUser?.email || req.adminUser?.id || 'admin';

      const resolution = req.body?.resolution ? String(req.body.resolution).slice(0, 500) : null;

      const status = req.body?.status === 'resolved' ? 'resolved' : 'closed';

      const row = await closeSupportCase(pool, caseId, actor, { resolution, status });

      if (!row) return res.status(404).json({ error: 'Case not found or already closed' });

      res.json({ case: row });

    } catch (e) {

      res.status(500).json({ error: e?.message });

    }

  });



  app.get('/api/admin/users/:id/support-pack.json', adminAuthMiddleware, async (req, res) => {

    try {

      const userId = String(req.params.id || '').trim();

      const caseId = req.query.case_id ? String(req.query.case_id) : undefined;

      const pack = await buildSupportPack(pool, userId, {

        caseId,

        openedBy: req.adminUser?.email || 'admin',

      });

      if (!pack) return res.status(404).json({ error: 'User not found' });

      res.setHeader('Content-Type', 'application/json');

      res.setHeader(

        'Content-Disposition',

        `attachment; filename="support-${pack.case.case_id}.json"`,

      );

      res.send(JSON.stringify(pack, null, 2));

    } catch (e) {

      res.status(500).json({ error: e?.message || 'Export failed' });

    }

  });



  app.get('/api/admin/users/:id/support-pack.csv', adminAuthMiddleware, async (req, res) => {

    try {

      const userId = String(req.params.id || '').trim();

      const caseId = req.query.case_id ? String(req.query.case_id) : undefined;

      const pack = await buildSupportPack(pool, userId, { caseId, openedBy: req.adminUser?.email || 'admin' });

      if (!pack) return res.status(404).json({ error: 'User not found' });

      const csv = supportPackToCsv(pack);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');

      res.setHeader(

        'Content-Disposition',

        `attachment; filename="support-${pack.case.case_id}.csv"`,

      );

      res.send('\uFEFF' + csv);

    } catch (e) {

      res.status(500).json({ error: e?.message || 'Export failed' });

    }

  });



  app.get('/api/admin/users/:id/user-360.json', adminAuthMiddleware, async (req, res) => {

    try {

      const userId = String(req.params.id || '').trim();

      const caseId = req.query.case_id ? String(req.query.case_id) : undefined;

      const pack = await buildUser360Pack(pool, userId, {

        caseId,

        openedBy: req.adminUser?.email || 'admin',

      });

      if (!pack) return res.status(404).json({ error: 'User not found' });

      res.setHeader('Content-Type', 'application/json');

      res.setHeader(

        'Content-Disposition',

        `attachment; filename="user-360-${userId.slice(0, 8)}.json"`,

      );

      res.send(JSON.stringify(pack, null, 2));

    } catch (e) {

      console.error('[user-360.json]', e?.message);

      res.status(500).json({ error: e?.message || 'Export failed' });

    }

  });



  app.get('/api/admin/users/:id/user-360.csv', adminAuthMiddleware, async (req, res) => {

    try {

      const userId = String(req.params.id || '').trim();

      const caseId = req.query.case_id ? String(req.query.case_id) : undefined;

      const pack = await buildUser360Pack(pool, userId, { caseId, openedBy: req.adminUser?.email || 'admin' });

      if (!pack) return res.status(404).json({ error: 'User not found' });

      const csv = user360ToCsv(pack);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');

      res.setHeader(

        'Content-Disposition',

        `attachment; filename="user-360-${userId.slice(0, 8)}.csv"`,

      );

      res.send('\uFEFF' + csv);

    } catch (e) {

      console.error('[user-360.csv]', e?.message);

      res.status(500).json({ error: e?.message || 'Export failed' });

    }

  });

}

