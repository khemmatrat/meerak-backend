/**
 * Ledger Controller - Append-only payment ledger for audit & reconciliation.
 * Only INSERT is allowed. No UPDATE/DELETE — even platform owner cannot edit.
 */
import { Request, Response } from "express";
import { getPool } from "../store";

export const ledgerController = {
  /**
   * Append a single ledger entry (INSERT only). Used by frontend/webhooks
   * to record payment_created, payment_completed, etc. for PromptPay, TrueMoney, Bank Transfer.
   */
  async append(req: Request, res: Response): Promise<void> {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "Database unavailable" });
      return;
    }

    const body = req.body as {
      id?: string;
      event_type: string;
      payment_id: string;
      gateway: string;
      job_id: string;
      amount: number;
      currency?: string;
      status: string;
      bill_no: string;
      transaction_no: string;
      payment_no?: string;
      user_id?: string;
      provider_id?: string;
      metadata?: Record<string, unknown>;
      request_id?: string;
      trace_id?: string;
      created_by?: string;
    };

    const allowedEvents = [
      "payment_created",
      "payment_completed",
      "payment_failed",
      "payment_expired",
      "payment_refunded",
      "escrow_held",
      "escrow_released",
      "escrow_refunded",
    ];
    const allowedGateways = [
      "promptpay",
      "stripe",
      "truemoney",
      "wallet",
      "bank_transfer",
    ];
    const allowedStatuses = [
      "pending",
      "completed",
      "failed",
      "expired",
      "refunded",
    ];

    if (
      !body.event_type ||
      !allowedEvents.includes(body.event_type) ||
      !body.payment_id ||
      !body.gateway ||
      !allowedGateways.includes(body.gateway) ||
      !body.job_id ||
      typeof body.amount !== "number" ||
      !body.bill_no ||
      !body.transaction_no ||
      !body.status ||
      !allowedStatuses.includes(body.status)
    ) {
      res
        .status(400)
        .json({ error: "Invalid ledger entry: missing or invalid fields" });
      return;
    }

    const id =
      body.id ||
      `ledger_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const currency = body.currency || "THB";
    const metadata = body.metadata ? JSON.stringify(body.metadata) : "{}";

    try {
      await pool.query(
        `INSERT INTO payment_ledger_audit (
          id, event_type, payment_id, gateway, job_id, amount, currency, status,
          bill_no, transaction_no, payment_no, user_id, provider_id, metadata,
          request_id, trace_id, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          id,
          body.event_type,
          body.payment_id,
          body.gateway,
          body.job_id,
          body.amount,
          currency,
          body.status,
          body.bill_no,
          body.transaction_no,
          body.payment_no || null,
          body.user_id || null,
          body.provider_id || null,
          metadata,
          body.request_id || null,
          body.trace_id || null,
          body.created_by || null,
        ],
      );
      res.status(201).json({ id, status: "appended" });
    } catch (err: any) {
      if (err.code === "23505") {
        res.status(409).json({ error: "Duplicate ledger id", id });
        return;
      }
      console.error("Ledger append error:", err);
      res.status(500).json({ error: "Failed to append ledger entry" });
    }
  },
};
