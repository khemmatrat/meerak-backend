/**
 * Phase 4A: User Management (RBAC).
 * - List users with roles from user_roles (USER / ADMIN / AUDITOR).
 * - View user detail; assign or change roles (ADMIN only).
 * - Every role change writes to financial_audit_log (audit safety).
 * INVARIANT: No admin API without JWT; role change requires ADMIN; audit log is append-only.
 */
import { Request, Response } from "express";
import { getPool } from "../store";

export const adminUserController = {
  /**
   * GET /api/admin/users
   * List users with role. Requires ADMIN or AUDITOR.
   */
  async list(req: Request, res: Response): Promise<void> {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "Database unavailable" });
      return;
    }

    const limit = Math.min(
      parseInt(String(req.query.limit || "50"), 10) || 50,
      200,
    );
    const offset = Math.max(parseInt(String(req.query.offset || "0"), 10) || 0);
    const search =
      typeof req.query.search === "string" ? req.query.search.trim() : "";

    try {
      let query = `
        SELECT u.id, u.firebase_uid, u.email, u.phone, u.full_name,
               u.kyc_status, u.account_status, u.created_at,
               COALESCE(ur.role, 'USER') AS role
        FROM users u
        LEFT JOIN user_roles ur ON ur.user_id = u.id::text
        WHERE (u.deleted_at IS NULL OR u.deleted_at > CURRENT_TIMESTAMP)
      `;
      const params: (string | number)[] = [];
      let i = 1;
      if (search) {
        query += ` AND (u.email ILIKE $${i} OR u.full_name ILIKE $${i} OR u.phone ILIKE $${i})`;
        params.push("%" + search + "%");
        i++;
      }
      query += ` ORDER BY u.created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
      params.push(limit, offset);

      const result = await pool.query(query, params);

      const countResult = await pool.query(
        `SELECT COUNT(*) AS total FROM users u WHERE (u.deleted_at IS NULL OR u.deleted_at > CURRENT_TIMESTAMP)` +
          (search
            ? ` AND (u.email ILIKE $1 OR u.full_name ILIKE $1 OR u.phone ILIKE $1)`
            : ""),
        search ? ["%" + search + "%"] : [],
      );
      const total = parseInt(countResult.rows[0]?.total || "0", 10);

      res.json({
        users: result.rows,
        pagination: { limit, offset, total },
      });
    } catch (e: any) {
      console.error("Admin users list error:", e);
      res.status(500).json({ error: "Failed to list users" });
    }
  },

  /**
   * GET /api/admin/users/:id
   * User detail + role. Requires ADMIN or AUDITOR.
   */
  async get(req: Request, res: Response): Promise<void> {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "Database unavailable" });
      return;
    }

    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: "User id required" });
      return;
    }

    try {
      const result = await pool.query(
        `SELECT u.id, u.firebase_uid, u.email, u.phone, u.full_name,
                u.kyc_status, u.kyc_level, u.account_status, u.created_at, u.updated_at,
                COALESCE(ur.role, 'USER') AS role
         FROM users u
         LEFT JOIN user_roles ur ON ur.user_id = u.id::text
         WHERE u.id::text = $1 OR u.firebase_uid = $1`,
        [id],
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const user = result.rows[0] as Record<string, unknown>;

      const walletResult = await pool.query(
        `SELECT id, user_id, currency, balance, updated_at FROM wallets WHERE user_id = $1 LIMIT 1`,
        [user.id ?? user.firebase_uid],
      );
      if (walletResult.rows.length > 0) {
        (user as Record<string, unknown>).wallet_balance = parseFloat(
          String(walletResult.rows[0].balance ?? 0),
        );
      } else {
        (user as Record<string, unknown>).wallet_balance = 0;
      }

      res.json({ user });
    } catch (e: any) {
      console.error("Admin user get error:", e);
      res.status(500).json({ error: "Failed to get user" });
    }
  },

  /**
   * PATCH /api/admin/users/:id/role
   * Body: { role: 'USER' | 'ADMIN' | 'AUDITOR' }
   * ADMIN only. Writes to financial_audit_log (audit safety).
   */
  async updateRole(req: Request, res: Response): Promise<void> {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "Database unavailable" });
      return;
    }

    const targetUserId = req.params.id;
    const actorId = req.user?.id;
    if (!actorId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const role = (req.body?.role as string)?.toUpperCase();
    if (!["USER", "ADMIN", "AUDITOR"].includes(role)) {
      res.status(400).json({
        error: "role must be one of: USER, ADMIN, AUDITOR",
      });
      return;
    }

    try {
      const userCheck = await pool.query(
        `SELECT id FROM users WHERE id::text = $1 OR firebase_uid = $1`,
        [targetUserId],
      );
      if (userCheck.rows.length === 0) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      const resolvedId = userCheck.rows[0].id;

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const prev = await client.query(
          `SELECT role FROM user_roles WHERE user_id = $1`,
          [String(resolvedId)],
        );
        const previousRole =
          prev.rows.length > 0 ? prev.rows[0].role : "USER";

        await client.query(
          `INSERT INTO user_roles (user_id, role, updated_at)
           VALUES ($1, $2, CURRENT_TIMESTAMP)
           ON CONFLICT (user_id) DO UPDATE SET role = $2, updated_at = CURRENT_TIMESTAMP`,
          [String(resolvedId), role],
        );

        await client.query(
          `INSERT INTO financial_audit_log (actor_type, actor_id, action, entity_type, entity_id, state_before, state_after, reason, created_at)
           VALUES ('USER', $1, 'role_change', 'user_roles', $2, $3, $4, 'Admin RBAC update', CURRENT_TIMESTAMP)`,
          [
            actorId,
            String(resolvedId),
            JSON.stringify({ role: previousRole }),
            JSON.stringify({ role }),
          ],
        );

        await client.query("COMMIT");
      } finally {
        client.release();
      }

      res.json({
        success: true,
        user_id: String(resolvedId),
        role,
        message: "Role updated; change recorded in financial_audit_log",
      });
    } catch (e: any) {
      console.error("Admin update role error:", e);
      res.status(500).json({ error: "Failed to update role" });
    }
  },
};
