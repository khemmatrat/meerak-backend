/**
 * Wallet controller: top-up, withdraw, balance.
 * Single source of truth = PostgreSQL ledger. Idempotent; double-entry.
 */
import { Request, Response } from "express";
import * as walletService from "../services/wallet.service";
import type { WithdrawChannel } from "../services/walletFee";

/**
 * user_id MUST come from verified JWT only (req.user.id). Body/query user_id is ignored for audit safety.
 */
function getUserId(req: Request): string {
  const userId = req.user?.id;
  if (!userId)
    throw new Error("Authentication required; user_id from JWT only");
  return userId;
}

export const walletController = {
  async topup(req: Request, res: Response): Promise<void> {
    try {
      const userId = getUserId(req);
      const body = req.body as {
        idempotency_key: string;
        amount: number;
        gateway: string;
        payment_id: string;
        bill_no: string;
        transaction_no: string;
      };
      if (
        !body.idempotency_key ||
        typeof body.amount !== "number" ||
        !body.gateway ||
        !body.payment_id ||
        !body.bill_no ||
        !body.transaction_no
      ) {
        res.status(400).json({
          error:
            "Missing: idempotency_key, amount, gateway, payment_id, bill_no, transaction_no",
        });
        return;
      }
      const result = await walletService.topup(
        body.idempotency_key,
        userId,
        body.amount,
        body.gateway,
        body.payment_id,
        body.bill_no,
        body.transaction_no,
        userId,
      );
      res.status(201).json(result);
    } catch (e: any) {
      if (e.message?.includes("Amount must be positive")) {
        res.status(400).json({ error: e.message });
        return;
      }
      console.error("Wallet topup error:", e);
      res.status(500).json({ error: e.message || "Top-up failed" });
    }
  },

  async withdraw(req: Request, res: Response): Promise<void> {
    try {
      const userId = getUserId(req);
      const body = req.body as {
        idempotency_key: string;
        amount_net: number;
        channel: WithdrawChannel;
        bank_info: string;
      };
      if (
        !body.idempotency_key ||
        typeof body.amount_net !== "number" ||
        !body.channel ||
        !body.bank_info
      ) {
        res.status(400).json({
          error: "Missing: idempotency_key, amount_net, channel, bank_info",
        });
        return;
      }
      const allowed: WithdrawChannel[] = [
        "promptpay",
        "bank_transfer",
        "truemoney",
      ];
      if (!allowed.includes(body.channel)) {
        res.status(400).json({
          error: "Invalid channel; use promptpay, bank_transfer, or truemoney",
        });
        return;
      }
      const result = await walletService.withdraw(
        body.idempotency_key,
        userId,
        body.amount_net,
        body.channel,
        body.bank_info,
        userId,
      );
      res.status(201).json(result);
    } catch (e: any) {
      if (
        e.message?.includes("Minimum withdrawal") ||
        e.message?.includes("Max net withdrawable") ||
        e.message?.includes("Insufficient balance")
      ) {
        res.status(400).json({ error: e.message });
        return;
      }
      console.error("Wallet withdraw error:", e);
      res.status(500).json({ error: e.message || "Withdrawal failed" });
    }
  },

  async balance(req: Request, res: Response): Promise<void> {
    try {
      const userId = getUserId(req);
      const result = await walletService.getBalance(userId);
      res.json(result);
    } catch (e: any) {
      console.error("Wallet balance error:", e);
      res.status(500).json({ error: e.message || "Balance failed" });
    }
  },
};
