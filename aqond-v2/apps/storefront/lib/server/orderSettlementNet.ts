import type { DatabaseSync } from 'node:sqlite';
import { getEscrowDatabase } from '@/lib/server/escrowDbStore';
import { getEscrowPgPool } from '@/lib/server/escrowPgStore';
import { getEscrowStorageBackend } from '@/lib/server/escrowStore';
import { computeCommissionAmounts } from '@/lib/server/platformCommission';

/** Merchant-facing settlement — net after platform commission (invisible to merchant UI). */
export async function resolveOrderSettlementNetMicro(
  orderId: string,
  grossAmountMicro: number,
  database?: DatabaseSync,
): Promise<number> {
  if (getEscrowStorageBackend() === 'postgres') {
    const release = await getEscrowPgPool().query(
      `SELECT amount_micro FROM order_auto_confirm_releases WHERE order_id = $1 LIMIT 1`,
      [orderId],
    );
    if (release.rows[0]?.amount_micro != null) {
      return Number(release.rows[0].amount_micro);
    }
    const ledger = await getEscrowPgPool().query(
      `SELECT net_amount_micro FROM platform_commission_ledger WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [orderId],
    );
    if (ledger.rows[0]?.net_amount_micro != null) {
      return Number(ledger.rows[0].net_amount_micro);
    }
    return grossAmountMicro;
  }

  const db = database ?? getEscrowDatabase();
  const release = db
    .prepare(`SELECT amount_micro FROM order_auto_confirm_releases WHERE order_id = ? LIMIT 1`)
    .get(orderId) as { amount_micro: number } | undefined;
  if (release?.amount_micro != null) return release.amount_micro;

  const ledger = db
    .prepare(
      `SELECT net_amount_micro FROM platform_commission_ledger WHERE order_id = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .get(orderId) as { net_amount_micro: number } | undefined;
  if (ledger?.net_amount_micro != null) return ledger.net_amount_micro;

  return grossAmountMicro;
}

export function estimateMarketplaceNetMicro(grossAmountMicro: number): number {
  return computeCommissionAmounts(grossAmountMicro).net_amount_micro;
}
