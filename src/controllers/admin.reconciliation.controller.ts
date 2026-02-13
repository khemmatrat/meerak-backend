/**
 * Admin reconciliation: upload settlement file (CSV or JSON rows).
 * Requires ADMIN role. Logs who uploaded, source, checksum immutably.
 */
import { Request, Response } from "express";
import * as reconciliationUploadService from "../services/reconciliationUpload.service";
import type { ReconGateway } from "../services/reconciliation.service";

export const adminReconciliationController = {
  async upload(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const body = req.body as {
        gateway: ReconGateway;
        settlement_date: string;
        csv_text?: string;
        external_rows?: { ref: string; amount: number; date: string }[];
        filename?: string;
      };

      if (!body.gateway || !body.settlement_date) {
        res.status(400).json({
          error:
            "Missing: gateway, settlement_date. Provide csv_text or external_rows.",
        });
        return;
      }

      const allowed: ReconGateway[] = [
        "promptpay",
        "bank_transfer",
        "truemoney",
      ];
      if (!allowed.includes(body.gateway)) {
        res.status(400).json({
          error: "Invalid gateway; use promptpay, bank_transfer, or truemoney",
        });
        return;
      }

      const hasCsv =
        typeof body.csv_text === "string" && body.csv_text.trim().length > 0;
      const hasRows =
        Array.isArray(body.external_rows) && body.external_rows.length > 0;
      if (!hasCsv && !hasRows) {
        res.status(400).json({
          error:
            "Provide csv_text (string) or external_rows (array of { ref, amount, date })",
        });
        return;
      }

      const result = await reconciliationUploadService.uploadAndReconcile(
        body.gateway,
        body.settlement_date,
        hasCsv ? body.csv_text! : null,
        hasRows ? body.external_rows! : null,
        body.filename || null,
        userId,
      );

      res.status(201).json(result);
    } catch (e: any) {
      console.error("Reconciliation upload error:", e);
      res
        .status(500)
        .json({ error: e.message || "Reconciliation upload failed" });
    }
  },
};
