/**
 * Phase 4B: KYC Review. Admin can list KYC submissions, view detail, approve/reject.
 * KYC status transitions are append-only; every decision is logged in financial_audit_log.
 * INVARIANT: No UPDATE/DELETE on ledger or audit tables; all admin mutations write audit logs.
 */
import { Request, Response } from "express";
import { getPool } from "../store";

export const adminKycController = {
  /**
   * GET /api/admin/kyc
   * List KYC submissions (pending / under_review). Requires ADMIN or AUDITOR.
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
    const status =
      (req.query.status as string) || "pending,under_review";
    let statuses = status
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (statuses.length === 0)
      statuses = ["pending", "under_review"];

    try {
      const placeholders = statuses
        .map((_, i) => `$${i + 1}`)
        .join(", ");
      const query = `
        SELECT u.id, u.email, u.full_name, u.phone, u.kyc_status, u.kyc_level, u.created_at,
               (SELECT COUNT(*) FROM kyc_documents k WHERE k.user_id = u.id) AS doc_count,
               (SELECT COUNT(*) FROM kyc_documents k WHERE k.user_id = u.id AND k.verification_status = 'pending') AS pending_docs
        FROM users u
        WHERE u.kyc_status IN (${placeholders})
          AND (u.deleted_at IS NULL OR u.deleted_at > CURRENT_TIMESTAMP)
        ORDER BY u.created_at DESC
        LIMIT $${statuses.length + 1} OFFSET $${statuses.length + 2}
      `;
      const result = await pool.query(query, [
        ...statuses,
        limit,
        offset,
      ]);

      const countResult = await pool.query(
        `SELECT COUNT(*) AS total FROM users u WHERE u.kyc_status IN (${placeholders}) AND (u.deleted_at IS NULL OR u.deleted_at > CURRENT_TIMESTAMP)`,
        statuses,
      );
      const total = parseInt(countResult.rows[0]?.total || "0", 10);

      res.json({
        submissions: result.rows,
        pagination: { limit, offset, total },
      });
    } catch (e: any) {
      console.error("Admin KYC list error:", e);
      res.status(500).json({ error: "Failed to list KYC submissions" });
    }
  },

  /**
   * GET /api/admin/kyc/:userId
   * KYC detail for a user (user + documents). Requires ADMIN or AUDITOR.
   */
  async get(req: Request, res: Response): Promise<void> {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "Database unavailable" });
      return;
    }

    const userId = req.params.userId;
    if (!userId) {
      res.status(400).json({ error: "User id required" });
      return;
    }

    try {
      const userResult = await pool.query(
        `SELECT id, email, full_name, phone, kyc_status, kyc_level, created_at, updated_at
         FROM users WHERE id::text = $1 OR firebase_uid = $1`,
        [userId],
      );
      if (userResult.rows.length === 0) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const docsResult = await pool.query(
        `SELECT id, document_type, document_url, document_hash, verification_status,
                rejection_reason, ai_confidence_score, uploaded_at, reviewed_at
         FROM kyc_documents WHERE user_id = $1 ORDER BY uploaded_at DESC`,
        [userResult.rows[0].id],
      );

      res.json({
        user: userResult.rows[0],
        documents: docsResult.rows,
      });
    } catch (e: any) {
      console.error("Admin KYC get error:", e);
      res.status(500).json({ error: "Failed to get KYC detail" });
    }
  },

  /**
   * POST /api/admin/kyc/:userId/approve
   * Approve KYC. ADMIN only. Writes to financial_audit_log.
   */
  async approve(req: Request, res: Response): Promise<void> {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "Database unavailable" });
      return;
    }

    const targetUserId = req.params.userId;
    const actorId = req.user?.id;
    if (!actorId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    try {
      const userCheck = await pool.query(
        `SELECT id, kyc_status FROM users WHERE id::text = $1 OR firebase_uid = $1`,
        [targetUserId],
      );
      if (userCheck.rows.length === 0) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      const user = userCheck.rows[0] as { id: string; kyc_status: string };
      const previousStatus = user.kyc_status;

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        await client.query(
          `UPDATE users SET kyc_status = 'verified', kyc_level = 'level_2', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [user.id],
        );
        await client.query(
          `UPDATE kyc_documents SET verification_status = 'verified', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $1 WHERE user_id = $2`,
          [actorId, user.id],
        );

        await client.query(
          `INSERT INTO financial_audit_log (actor_type, actor_id, action, entity_type, entity_id, state_before, state_after, reason, created_at)
           VALUES ('USER', $1, 'kyc_approve', 'kyc', $2, $3, $4, 'Admin KYC approval', CURRENT_TIMESTAMP)`,
          [
            actorId,
            user.id,
            JSON.stringify({ kyc_status: previousStatus }),
            JSON.stringify({ kyc_status: "verified", kyc_level: "level_2" }),
          ],
        );

        await client.query("COMMIT");
      } finally {
        client.release();
      }

      res.json({
        success: true,
        user_id: user.id,
        kyc_status: "verified",
        message: "KYC approved; decision recorded in financial_audit_log",
      });
    } catch (e: any) {
      console.error("Admin KYC approve error:", e);
      res.status(500).json({ error: "Failed to approve KYC" });
    }
  },

  /**
   * POST /api/admin/kyc/:userId/reject
   * Body: { reason?: string }
   * Reject KYC. ADMIN only. Writes to financial_audit_log.
   */
  async reject(req: Request, res: Response): Promise<void> {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "Database unavailable" });
      return;
    }

    const targetUserId = req.params.userId;
    const actorId = req.user?.id;
    const reason = (req.body?.reason as string) || "Rejected by admin";

    if (!actorId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    try {
      const userCheck = await pool.query(
        `SELECT id, kyc_status FROM users WHERE id::text = $1 OR firebase_uid = $1`,
        [targetUserId],
      );
      if (userCheck.rows.length === 0) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      const user = userCheck.rows[0] as { id: string; kyc_status: string };
      const previousStatus = user.kyc_status;

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        await client.query(
          `UPDATE users SET kyc_status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [user.id],
        );
        await client.query(
          `UPDATE kyc_documents SET verification_status = 'rejected', rejection_reason = $1, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $2 WHERE user_id = $3`,
          [reason, actorId, user.id],
        );

        await client.query(
          `INSERT INTO financial_audit_log (actor_type, actor_id, action, entity_type, entity_id, state_before, state_after, reason, created_at)
           VALUES ('USER', $1, 'kyc_reject', 'kyc', $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
          [
            actorId,
            user.id,
            JSON.stringify({ kyc_status: previousStatus }),
            JSON.stringify({ kyc_status: "rejected" }),
            reason,
          ],
        );

        await client.query("COMMIT");
      } finally {
        client.release();
      }

      res.json({
        success: true,
        user_id: user.id,
        kyc_status: "rejected",
        message: "KYC rejected; decision recorded in financial_audit_log",
      });
    } catch (e: any) {
      console.error("Admin KYC reject error:", e);
      res.status(500).json({ error: "Failed to reject KYC" });
    }
  },
};
