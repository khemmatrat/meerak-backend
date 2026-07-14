/**
 * Phase 4C: Financial Dashboard — read-only.
 * All queries read from wallets, ledger_entries, reconciliation_runs. NO balance mutation.
 * ADMIN and AUDITOR can access (read-only). Maps to audit safety: no writes, no bypass.
 */
import { Request, Response } from "express";
import { getPool } from "../store";

export const adminFinancialController = {
  /**
   * GET /api/admin/financial/dashboard
   * Returns: total wallets, total balances, ledger volume (by day/gateway), reconciliation run status.
   */
  async dashboard(req: Request, res: Response): Promise<void> {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "Database unavailable" });
      return;
    }

    const fromDate = (req.query.from_date as string) || "";
    const toDate = (req.query.to_date as string) || "";
    const days = Math.min(
      parseInt(String(req.query.days || "30"), 10) || 30,
      90,
    );

    try {
      const from =
        fromDate ||
        new Date(Date.now() - days * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);
      const to =
        toDate ||
        new Date().toISOString().slice(0, 10);

      const [walletsResult, balancesResult, ledgerVolumeResult, reconResult] =
        await Promise.all([
          pool.query(
            `SELECT COUNT(*) AS total FROM wallets`,
          ),
          pool.query(
            `SELECT COALESCE(SUM(balance), 0)::text AS total FROM wallets`,
          ),
          pool.query(
            `SELECT DATE(created_at) AS day, gateway, 
                    COUNT(*) AS entry_count, 
                    COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE -amount END), 0)::text AS net_volume
             FROM ledger_entries
             WHERE created_at >= $1::date AND created_at <= $2::date + interval '1 day'
             GROUP BY DATE(created_at), gateway
             ORDER BY day DESC, gateway
             LIMIT 500`,
            [from, to],
          ),
          pool.query(
            `SELECT id, run_date, gateway, status, total_internal_amount, total_external_amount,
                    matched_count, mismatch_count, missing_internal_count, missing_external_count,
                    started_at, completed_at
             FROM reconciliation_runs
             ORDER BY started_at DESC
             LIMIT 50`,
          ),
        ]);

      const totalWallets = parseInt(walletsResult.rows[0]?.total || "0", 10);
      const totalBalances = parseFloat(
        balancesResult.rows[0]?.total || "0",
      );
      const ledgerVolume = ledgerVolumeResult.rows as Array<{
        day: string;
        gateway: string | null;
        entry_count: string;
        net_volume: string;
      }>;
      const reconciliationRuns = reconResult.rows as Array<Record<string, unknown>>;

      res.json({
        total_wallets: totalWallets,
        total_balances: totalBalances,
        ledger_volume: ledgerVolume.map((r) => ({
          day: r.day,
          gateway: r.gateway || "unknown",
          entry_count: parseInt(r.entry_count, 10),
          net_volume: parseFloat(r.net_volume),
        })),
        reconciliation_runs: reconciliationRuns,
      });
    } catch (e: any) {
      console.error("Financial dashboard error:", e);
      res.status(500).json({ error: "Failed to load financial dashboard" });
    }
  },
};
