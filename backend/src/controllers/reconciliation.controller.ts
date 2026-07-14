/**
 * Reconciliation controller: run reconciliation (internal ledger vs external rows).
 */
import { Request, Response } from "express";
import * as reconciliationService from "../services/reconciliation.service";

export const reconciliationController = {
  async run(req: Request, res: Response): Promise<void> {
    try {
      const body = req.body as {
        run_date: string;
        gateway: reconciliationService.ReconGateway;
        external_rows: reconciliationService.ExternalRow[];
      };
      if (
        !body.run_date ||
        !body.gateway ||
        !Array.isArray(body.external_rows)
      ) {
        res
          .status(400)
          .json({
            error:
              "Missing: run_date, gateway, external_rows (array of { ref, amount, date })",
          });
        return;
      }
      const allowed: reconciliationService.ReconGateway[] = [
        "promptpay",
        "bank_transfer",
        "truemoney",
      ];
      if (!allowed.includes(body.gateway)) {
        res
          .status(400)
          .json({
            error:
              "Invalid gateway; use promptpay, bank_transfer, or truemoney",
          });
        return;
      }
      const result = await reconciliationService.runReconciliation(
        body.run_date,
        body.gateway,
        body.external_rows,
        (req as any).user?.id,
      );
      res.status(201).json(result);
    } catch (e: any) {
      console.error("Reconciliation run error:", e);
      res.status(500).json({ error: e.message || "Reconciliation failed" });
    }
  },
};
