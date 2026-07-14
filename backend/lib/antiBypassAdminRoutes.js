/**
 * Admin APIs — anti-bypass rules CRUD + masked evaluate tester + telemetry snapshot (PR-1).
 * Does not wire job chat traffic yet (PR-2).
 */

import crypto from 'crypto';
import { appendFileSync } from 'node:fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __agentDbgAntiPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'debug-caa88d.log',
);

function agentDbgAnti(payload) {
  try {
    appendFileSync(
      __agentDbgAntiPath,
      `${JSON.stringify({ sessionId: 'caa88d', timestamp: Date.now(), ...payload })}\n`,
    );
  } catch (_) {
    /* ignore */
  }
}
import {
  compileSafeAntiBypassRegex,
  evaluateAntiBypassText,
  getAntiBypassTextFilterMode,
} from './antiBypassTextFilter.js';
import {
  getAntiBypassTelemetrySnapshot,
  recordAntiBypassReasons,
} from './antiBypassTelemetry.js';

const RULE_READ_ROLES = new Set([
  'ADMIN',
  'SUPER_ADMIN',
  'DEVELOPER',
  'SUPPORT',
  'AUDITOR',
  'ACCOUNTANT',
  'STAFF_KYC',
]);

const RULE_WRITE_ROLES = new Set(['ADMIN', 'SUPER_ADMIN']);

function assertAntiBypassRead(req, res) {
  const r = req.adminUser?.role;
  if (!RULE_READ_ROLES.has(r)) {
    res.status(403).json({ error: 'Forbidden' });
    return false;
  }
  return true;
}

function assertAntiBypassWrite(req, res) {
  const r = req.adminUser?.role;
  if (!RULE_WRITE_ROLES.has(r)) {
    res.status(403).json({
      error: 'Only ADMIN or SUPER_ADMIN can modify anti-bypass rules',
    });
    return false;
  }
  return true;
}

function assertRegexSuperAdmin(req, res) {
  if (req.adminUser?.role !== 'SUPER_ADMIN') {
    res.status(403).json({
      error: 'Regex rules require SUPER_ADMIN (ReDoS / safety policy)',
    });
    return false;
  }
  return true;
}

async function safeRulesQuery(pool, text, params = []) {
  try {
    return await pool.query(text, params);
  } catch (e) {
    if (e?.code === '42P01') {
      const err = new Error(
        'anti_bypass_rules table missing — run migration 203',
      );
      err.code = 'MIGRATION_REQUIRED';
      throw err;
    }
    throw e;
  }
}

/**
 * @param {import('express').Express} app
 * @param {import('pg').Pool} pool
 * @param {(req: any, res: any, next: any) => void} adminAuthMiddleware
 */
export function registerAntiBypassAdminRoutes(app, pool, adminAuthMiddleware) {
  app.get('/api/admin/anti-bypass/rules', adminAuthMiddleware, async (req, res) => {
    // #region agent log
    agentDbgAnti({
      hypothesisId: 'H3',
      location: 'antiBypassAdminRoutes.js:GET /rules handler',
      message: 'entered after adminAuthMiddleware',
      data: {
        adminRolePresent: !!(req.adminUser && req.adminUser.role),
        role: req.adminUser?.role || null,
      },
    });
    // #endregion
    try {
      if (!assertAntiBypassRead(req, res)) return;
      const r = await safeRulesQuery(
        pool,
        `SELECT id, kind, scope, pattern, enabled, severity, created_by, created_at, updated_at
         FROM anti_bypass_rules
         ORDER BY enabled DESC, created_at DESC`,
      );
      res.json({ rules: r.rows });
    } catch (e) {
      if (e?.code === 'MIGRATION_REQUIRED') {
        return res.status(503).json({ error: e.message });
      }
      console.error('GET /api/admin/anti-bypass/rules:', e);
      res.status(500).json({ error: 'Failed to load rules' });
    }
  });

  app.post('/api/admin/anti-bypass/rules', adminAuthMiddleware, async (req, res) => {
    try {
      if (!assertAntiBypassWrite(req, res)) return;
      const kind = String(req.body?.kind || '').toLowerCase();
      const scope = String(req.body?.scope || 'text').toLowerCase();
      const pattern = req.body?.pattern;
      const enabled = req.body?.enabled !== false;
      const severity = String(req.body?.severity || 'block').toLowerCase();

      if (!['keyword', 'regex'].includes(kind)) {
        return res.status(400).json({ error: 'kind must be keyword or regex' });
      }
      if (!['text', 'image_ocr'].includes(scope)) {
        return res.status(400).json({ error: 'scope must be text or image_ocr' });
      }
      if (!['block', 'warn'].includes(severity)) {
        return res.status(400).json({ error: 'severity must be block or warn' });
      }
      if (pattern == null || String(pattern).trim() === '') {
        return res.status(400).json({ error: 'pattern required' });
      }

      if (kind === 'regex' && !assertRegexSuperAdmin(req, res)) return;

      if (kind === 'regex') {
        try {
          compileSafeAntiBypassRegex(String(pattern));
        } catch (err) {
          return res.status(400).json({ error: String(err.message || err) });
        }
      }

      const id = crypto.randomUUID();
      const createdBy = req.adminUser?.id ? String(req.adminUser.id) : null;

      await safeRulesQuery(
        pool,
        `INSERT INTO anti_bypass_rules (id, kind, scope, pattern, enabled, severity, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, kind, scope, String(pattern), enabled, severity, createdBy],
      );

      const row = await safeRulesQuery(pool, `SELECT * FROM anti_bypass_rules WHERE id = $1`, [
        id,
      ]);
      res.status(201).json({ rule: row.rows[0] });
    } catch (e) {
      if (e?.code === 'MIGRATION_REQUIRED') {
        return res.status(503).json({ error: e.message });
      }
      console.error('POST /api/admin/anti-bypass/rules:', e);
      res.status(500).json({ error: 'Failed to create rule' });
    }
  });

  app.patch('/api/admin/anti-bypass/rules/:id', adminAuthMiddleware, async (req, res) => {
    try {
      if (!assertAntiBypassWrite(req, res)) return;
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id required' });

      const curQ = await safeRulesQuery(
        pool,
        `SELECT * FROM anti_bypass_rules WHERE id = $1`,
        [id],
      );
      if (!curQ.rows?.length) return res.status(404).json({ error: 'Not found' });
      const cur = curQ.rows[0];

      let nextKind = cur.kind;
      if (req.body.kind !== undefined) {
        nextKind = String(req.body.kind).toLowerCase();
        if (!['keyword', 'regex'].includes(nextKind)) {
          return res.status(400).json({ error: 'invalid kind' });
        }
      }

      if (nextKind === 'regex' && !assertRegexSuperAdmin(req, res)) return;

      let nextPattern =
        req.body.pattern !== undefined ? String(req.body.pattern) : String(cur.pattern || '');
      let nextScope =
        req.body.scope !== undefined ? String(req.body.scope).toLowerCase() : String(cur.scope);
      let nextEnabled = req.body.enabled !== undefined ? !!req.body.enabled : !!cur.enabled;
      let nextSeverity =
        req.body.severity !== undefined
          ? String(req.body.severity).toLowerCase()
          : String(cur.severity);

      if (!['text', 'image_ocr'].includes(nextScope)) {
        return res.status(400).json({ error: 'invalid scope' });
      }
      if (!['block', 'warn'].includes(nextSeverity)) {
        return res.status(400).json({ error: 'severity must be block or warn' });
      }

      if (nextKind === 'regex') {
        try {
          compileSafeAntiBypassRegex(nextPattern);
        } catch (err) {
          return res.status(400).json({ error: String(err.message || err) });
        }
      }

      await safeRulesQuery(
        pool,
        `UPDATE anti_bypass_rules
         SET kind = $1, scope = $2, pattern = $3, enabled = $4, severity = $5, updated_at = NOW()
         WHERE id = $6`,
        [nextKind, nextScope, nextPattern, nextEnabled, nextSeverity, id],
      );

      const row = await safeRulesQuery(pool, `SELECT * FROM anti_bypass_rules WHERE id = $1`, [
        id,
      ]);
      res.json({ rule: row.rows[0] });
    } catch (e) {
      if (e?.code === 'MIGRATION_REQUIRED') {
        return res.status(503).json({ error: e.message });
      }
      console.error('PATCH /api/admin/anti-bypass/rules/:id:', e);
      res.status(500).json({ error: 'Failed to update rule' });
    }
  });

  app.delete('/api/admin/anti-bypass/rules/:id', adminAuthMiddleware, async (req, res) => {
    try {
      if (!assertAntiBypassWrite(req, res)) return;
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id required' });

      const r = await safeRulesQuery(
        pool,
        `DELETE FROM anti_bypass_rules WHERE id = $1 RETURNING id`,
        [id],
      );
      if (!r.rows?.length) return res.status(404).json({ error: 'Not found' });
      res.json({ deleted: id });
    } catch (e) {
      if (e?.code === 'MIGRATION_REQUIRED') {
        return res.status(503).json({ error: e.message });
      }
      console.error('DELETE /api/admin/anti-bypass/rules/:id:', e);
      res.status(500).json({ error: 'Failed to delete rule' });
    }
  });

  app.post('/api/admin/anti-bypass/evaluate-test', adminAuthMiddleware, async (req, res) => {
    try {
      if (!assertAntiBypassRead(req, res)) return;
      const text = req.body?.text ?? '';
      const scope = req.body?.scope === 'image_ocr' ? 'image_ocr' : 'text';

      let dbRules = [];
      try {
        const q = await safeRulesQuery(
          pool,
          `SELECT id, kind, scope, pattern, enabled, severity FROM anti_bypass_rules WHERE enabled = true`,
        );
        dbRules = q.rows;
      } catch (e) {
        if (e?.code !== 'MIGRATION_REQUIRED') throw e;
        dbRules = [];
      }

      const filterMode = getAntiBypassTextFilterMode();
      const result = evaluateAntiBypassText(text, { filterMode, dbRules, scope });

      if (
        process.env.ANTI_BYPASS_TELEMETRY === 'on' &&
        result.reasons?.length &&
        filterMode !== 'off'
      ) {
        recordAntiBypassReasons(scope, result.reasons);
      }

      res.json({
        filterMode,
        ...result,
      });
    } catch (e) {
      console.error('POST /api/admin/anti-bypass/evaluate-test:', e);
      res.status(500).json({ error: 'Evaluate failed' });
    }
  });

  app.get('/api/admin/anti-bypass/telemetry', adminAuthMiddleware, (req, res) => {
    if (!assertAntiBypassRead(req, res)) return;
    if (process.env.ANTI_BYPASS_TELEMETRY !== 'on') {
      return res.json({
        enabled: false,
        counts: {},
        hint: 'Set ANTI_BYPASS_TELEMETRY=on to collect in-process counters',
      });
    }
    res.json({ enabled: true, counts: getAntiBypassTelemetrySnapshot() });
  });
}
