import { approveShop, rejectShop, getOwnerDashboard } from '@/lib/server/merchantShops';
import { getDisputeCase, listMerchantDisputes } from '@/lib/server/merchantDisputes';
import { adminReleaseDisputeHold, releaseSettlementToAvailable, syncMerchantWallet } from '@/lib/server/merchantWallet';
import fs from 'fs/promises';
import path from 'path';

const ADMIN_KEY = process.env.AQOND_ADMIN_KEY || 'aqond-admin-dev';

export function verifyAdminKey(key?: string | null): boolean {
  return !!key && key === ADMIN_KEY;
}

export async function adminDashboard() {
  const owners = await fs.readdir(path.join(process.cwd(), '.data', 'dev')).catch(() => []);
  let pendingShops: any[] = [];
  try {
    const raw = await fs.readFile(path.join(process.cwd(), '.data', 'dev', 'merchant-shops.json'), 'utf8');
    const store = JSON.parse(raw);
    for (const [ownerId, profile] of Object.entries(store) as any) {
      for (const shop of profile.shops || []) {
        if (shop.status === 'pending') {
          pendingShops.push({ ...shop, owner_id: ownerId });
        }
      }
    }
  } catch {
    pendingShops = [];
  }

  let openDisputes: any[] = [];
  try {
    const raw = await fs.readFile(path.join(process.cwd(), '.data', 'dev', 'merchant-disputes.json'), 'utf8');
    openDisputes = (JSON.parse(raw).cases || []).filter(
      (c: any) => !['resolved_refund', 'resolved_charge', 'resolved_mutual', 'closed'].includes(c.status),
    );
  } catch {
    openDisputes = [];
  }

  return { pending_shops: pendingShops, open_disputes: openDisputes };
}

export async function adminApproveShop(shopId: string, ownerId?: string) {
  return approveShop(shopId, ownerId);
}

export async function adminRejectShop(shopId: string, reason?: string) {
  return rejectShop(shopId, reason);
}

export async function adminResolveDispute(
  caseId: string,
  input: { action: 'refund' | 'charge' | 'release_hold'; note?: string },
) {
  const storePath = path.join(process.cwd(), '.data', 'dev', 'merchant-disputes.json');
  const store = JSON.parse(await fs.readFile(storePath, 'utf8'));
  const hit = store.cases.find((c: any) => c.id === caseId);
  if (!hit) return null;

  const { appendDisputeTimeline } = await import('@/lib/server/merchantDisputes');
  await appendDisputeTimeline(caseId, 'admin', `admin_${input.action}`, input.note || 'Admin ตัดสิน');

  if (input.action === 'refund') {
    hit.status = 'resolved_refund';
    hit.resolution_note = input.note || 'Admin สั่งคืนเงิน';
    hit.held_amount_micro = 0;
  } else if (input.action === 'charge') {
    hit.status = 'resolved_charge';
    hit.resolution_note = input.note || 'Admin สั่งเรียกเก็บ';
    await adminReleaseDisputeHold(hit.merchant_id, caseId, hit.order_total_micro - hit.refund_amount_micro);
    hit.held_amount_micro = 0;
  } else {
    hit.status = 'closed';
    hit.resolution_note = input.note || 'Admin ปลดเงินพัก';
    await adminReleaseDisputeHold(hit.merchant_id, caseId, hit.held_amount_micro);
    hit.held_amount_micro = 0;
  }
  hit.updated_at = new Date().toISOString();
  await fs.writeFile(storePath, JSON.stringify(store, null, 2), 'utf8');
  await syncMerchantWallet(hit.merchant_id);
  return hit;
}

export async function adminSettleMerchant(merchantId: string) {
  const w = await syncMerchantWallet(merchantId);
  return releaseSettlementToAvailable(merchantId, w.pending_settlement_micro);
}
