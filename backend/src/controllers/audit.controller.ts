/**
 * Audit controller: read-only access for AUDITOR and ADMIN.
 * SELECT-only on ledger, reconciliation, financial_audit_log.
 * Phase 4D: filters include date range, entity_type, action, actor_id (RBAC at route level).
 */
import { Request, Response } from "express";
import { getPool } from "../store";

export const auditController = {
  async ledger(req: Request, res: Response): Promise<void> {
    try {
      const pool = getPool();
      if (!pool) {
        res.status(503).json({ error: "Database unavailable" });
        return;
      }
      const {
        from_date,
        to_date,
        user_id,
        limit = "500",
      } = req.query as {
        from_date?: string;
        to_date?: string;
        user_id?: string;
        limit?: string;
      };
      let query = `SELECT id, idempotency_key, transaction_group_id, event_type, direction, amount, currency,
                         wallet_id, user_id, system_account_code, balance_after, description,
                         gateway, payment_id, transaction_no, bill_no, created_at
                  FROM ledger_entries WHERE 1=1`;
      const params: (string | number)[] = [];
      let i = 1;
      if (from_date) {
        query += ` AND created_at >= $${i}`;
        params.push(from_date);
        i++;
      }
      if (to_date) {
        query += ` AND created_at <= $${i}`;
        params.push(to_date + "T23:59:59.999Z");
        i++;
      }
      if (user_id) {
        query += ` AND user_id = $${i}`;
        params.push(user_id);
        i++;
      }
      query += ` ORDER BY created_at DESC LIMIT $${i}`;
      params.push(Math.min(parseInt(limit, 10) || 500, 2000));

      const result = await pool.query(query, params);
      res.json({ entries: result.rows, count: result.rows.length });
    } catch (e: any) {
      console.error("Audit ledger error:", e);
      res.status(500).json({ error: e.message || "Failed to fetch ledger" });
    }
  },

  async reconciliation(req: Request, res: Response): Promise<void> {
    try {
      const pool = getPool();
      if (!pool) {
        res.status(503).json({ error: "Database unavailable" });
        return;
      }
      const {
        from_date,
        to_date,
        gateway,
        limit = "100",
      } = req.query as {
        from_date?: string;
        to_date?: string;
        gateway?: string;
        limit?: string;
      };
      let query = `SELECT id, run_date, gateway, status, total_internal_amount, total_external_amount,
                         matched_count, mismatch_count, missing_internal_count, missing_external_count,
                         started_at, completed_at
                  FROM reconciliation_runs WHERE 1=1`;
      const params: (string | number)[] = [];
      let i = 1;
      if (from_date) {
        query += ` AND run_date >= $${i}`;
        params.push(from_date);
        i++;
      }
      if (to_date) {
        query += ` AND run_date <= $${i}`;
        params.push(to_date);
        i++;
      }
      if (gateway) {
        query += ` AND gateway = $${i}`;
        params.push(gateway);
        i++;
      }
      query += ` ORDER BY started_at DESC LIMIT $${i}`;
      params.push(Math.min(parseInt(limit, 10) || 100, 500));

      const result = await pool.query(query, params);
      res.json({ runs: result.rows, count: result.rows.length });
    } catch (e: any) {
      console.error("Audit reconciliation error:", e);
      res
        .status(500)
        .json({ error: e.message || "Failed to fetch reconciliation" });
    }
  },

  async logs(req: Request, res: Response): Promise<void> {
    try {
      const pool = getPool();
      if (!pool) {
        res.status(503).json({ error: "Database unavailable" });
        return;
      }
      const {
        from_date,
        to_date,
        entity_type,
        entity_id,
        action,
        actor_id,
        limit = "500",
      } = req.query as {
        from_date?: string;
        to_date?: string;
        entity_type?: string;
        entity_id?: string;
        action?: string;
        actor_id?: string;
        limit?: string;
      };
      let query = `SELECT id, actor_type, actor_id, action, entity_type, entity_id, state_before, state_after,
                         reason, correlation_id, created_at
                  FROM financial_audit_log WHERE 1=1`;
      const params: (string | number)[] = [];
      let i = 1;
      if (from_date) {
        query += ` AND created_at >= $${i}`;
        params.push(from_date);
        i++;
      }
      if (to_date) {
        query += ` AND created_at <= $${i}`;
        params.push(to_date + "T23:59:59.999Z");
        i++;
      }
      if (entity_type) {
        query += ` AND entity_type = $${i}`;
        params.push(entity_type);
        i++;
      }
      if (entity_id) {
        query += ` AND entity_id = $${i}`;
        params.push(entity_id);
        i++;
      }
      if (action) {
        query += ` AND action = $${i}`;
        params.push(action);
        i++;
      }
      if (actor_id) {
        query += ` AND actor_id = $${i}`;
        params.push(actor_id);
        i++;
      }
      query += ` ORDER BY created_at DESC LIMIT $${i}`;
      params.push(Math.min(parseInt(limit, 10) || 500, 2000));

      const result = await pool.query(query, params);
      res.json({ logs: result.rows, count: result.rows.length });
    } catch (e: any) {
      console.error("Audit logs error:", e);
      res
        .status(500)
        .json({ error: e.message || "Failed to fetch audit logs" });
    }
  },
};
