import fs from 'fs/promises';
import path from 'path';
import { listMerchantOrders } from '@/lib/server/merchantOrders';
import { listMerchantDisputes } from '@/lib/server/merchantDisputes';
import { getMerchantFeeSummary } from '@/lib/server/merchantFeeEngine';
import { resolveOrderSettlementNetMicro } from '@/lib/server/orderSettlementNet';
import {
  addWalletAvailableMicro,
  creditWalletForEscrowRelease,
  getWalletAvailableMicro,
  reconcileMerchantWalletCredits,
  seedWalletAvailableIfAbsent,
  type WalletCreditResult,
} from '@/lib/server/merchantWalletStore';

// Legacy JSON balance — read once to carry forward into the DB store, never written again.
const LEGACY_WALLET_FILE = path.join(process.cwd(), '.data', 'dev', 'merchant-wallets.json');

export type MerchantWallet = {
  merchant_id: string;
  available_micro: number;
  held_dispute_micro: number;
  pending_settlement_micro: number;
  total_earned_micro: number;
  total_fees_micro: number;
  net_earned_micro: number;
  updated_at: string;
};

/** Best-effort one-time carry-forward of the legacy JSON available balance into the DB store. */
async function seedLegacyAvailable(merchantId: string): Promise<void> {
  try {
    const raw = await fs.readFile(LEGACY_WALLET_FILE, 'utf8');
    const store = JSON.parse(raw) as Record<string, { available_micro?: number }>;
    const legacy = Number(store?.[merchantId]?.available_micro ?? 0);
    if (legacy > 0) await seedWalletAvailableIfAbsent(merchantId, legacy);
  } catch {
    /* no legacy file — nothing to carry forward */
  }
}

export async function syncMerchantWallet(
  merchantId: string,
  prefetchedFees?: Awaited<ReturnType<typeof getMerchantFeeSummary>>,
): Promise<MerchantWallet> {
  await seedLegacyAvailable(merchantId);
  // Finding A: self-heal any released hold whose credit was lost (legacy fire-and-forget drift).
  // Same-transaction credit makes new drift impossible; this repairs historical/partial states.
  try {
    await reconcileMerchantWalletCredits(merchantId);
  } catch (err) {
    console.warn('[merchant-wallet] reconciliation skipped', {
      merchant_id: merchantId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const feeSummary = prefetchedFees ?? (await getMerchantFeeSummary(merchantId));
  const totalFees = feeSummary.totals.fees_micro;

  const { orders } = await listMerchantOrders(merchantId);
  const disputes = await listMerchantDisputes(merchantId);

  const openDisputes = disputes.filter(
    (d) => !['resolved_refund', 'resolved_charge', 'resolved_mutual', 'closed'].includes(d.status),
  );
  const held = openDisputes.reduce((s, d) => s + d.held_amount_micro, 0);

  const delivered = orders.filter((o) => o.fulfillment_status === 'delivered');
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recentDelivered = delivered.filter((o) => {
    const t = o.delivered_at || o.created_at;
    return t && new Date(t).getTime() >= dayAgo;
  });

  let pendingSettle = 0;
  let totalEarned = 0;
  const netByOrder = new Map<string, number>();
  for (const o of delivered) {
    const net = await resolveOrderSettlementNetMicro(o.order_id, o.amount_micro || 0);
    netByOrder.set(o.order_id, net);
    totalEarned += net;
  }
  for (const o of recentDelivered) {
    pendingSettle += netByOrder.get(o.order_id) ?? 0;
  }

  const netEarned = Math.max(0, totalEarned - totalFees);
  const available = await getWalletAvailableMicro(merchantId);

  return {
    merchant_id: merchantId,
    available_micro: Math.max(0, available),
    held_dispute_micro: held,
    pending_settlement_micro: pendingSettle,
    total_earned_micro: totalEarned,
    total_fees_micro: totalFees,
    net_earned_micro: netEarned,
    updated_at: new Date().toISOString(),
  };
}

export async function releaseSettlementToAvailable(merchantId: string, amountMicro: number) {
  await addWalletAvailableMicro(merchantId, amountMicro);
  return syncMerchantWallet(merchantId);
}

/**
 * Idempotent — credit merchant available when escrow releases net (matches order_auto_confirm amount).
 * Backed by a transactional DB store: atomic `available += net` under a row lock, with DB-level
 * idempotency on order_id (unique constraint), so concurrent/duplicate credits cannot lose updates
 * or double-credit.
 */
export async function creditMerchantAvailableFromEscrowRelease(params: {
  merchantId: string;
  orderId: string;
  netAmountMicro: number;
}): Promise<WalletCreditResult | null> {
  if (params.netAmountMicro <= 0) return null;
  return creditWalletForEscrowRelease(params);
}

export async function adminReleaseDisputeHold(merchantId: string, _caseId: string, releaseMicro: number) {
  await addWalletAvailableMicro(merchantId, Math.max(0, releaseMicro));
  return syncMerchantWallet(merchantId);
}
