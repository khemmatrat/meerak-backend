import type { AuthState } from '@/lib/bff';
import { riderClientAuthHeaders } from '@/lib/riderClientAuth';

export async function reorderOrder(orderId: string, buyerId: string) {
  const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ buyer_id: buyerId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'สั่งซ้ำไม่สำเร็จ');
  return data as {
    ok: boolean;
    items: Array<{ product_id: string; title: string; qty: number; unit_price_micro: number }>;
    merchant_id?: string;
    redirect: string;
    order_type: string;
  };
}

export function receiptPdfUrl(orderId: string, buyerId: string) {
  return `/api/orders/${encodeURIComponent(orderId)}/receipt.pdf?buyer_id=${encodeURIComponent(buyerId)}`;
}

export async function fetchRiderEarnings(riderId: string, userId?: string) {
  const q = new URLSearchParams({ rider_id: riderId });
  if (userId) q.set('user_id', userId);
  const res = await fetch(`/api/rider/earnings?${q}`, { cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'โหลดรายได้ไม่สำเร็จ');
  return data;
}

export function newRiderIdempotencyKey(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}`;
}

export async function requestRiderWithdraw(
  riderId: string,
  amountMicro?: number,
  auth?: AuthState | null,
  idempotencyKey?: string,
) {
  const res = await fetch('/api/rider/withdraw', {
    method: 'POST',
    headers: riderClientAuthHeaders(auth),
    body: JSON.stringify({
      rider_id: riderId,
      amount_micro: amountMicro,
      idempotency_key: idempotencyKey || newRiderIdempotencyKey(`withdraw-${riderId}`),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || 'ขอถอนไม่สำเร็จ');
  return data;
}

export type RiderCreditEntry = {
  id: string;
  rider_id: string;
  event_type: string;
  direction: 'credit' | 'debit';
  amount_micro: number;
  balance_after_micro?: number;
  job_id?: string;
  order_id?: string;
  payout_id?: string;
  reason?: string;
  actor_type?: string;
  created_at: string;
};

export type RiderCreditsPayload = {
  rider_id?: string;
  summary: {
    credit_limit_micro?: number;
    credit_used_micro?: number;
    available_credit_micro?: number;
    cash_balance_micro?: number;
    balance_micro: number;
    withdrawable_micro: number;
    pending_withdraw_micro: number;
    earned_micro: number;
    completed_jobs: number;
    source?: string;
  };
  entries: RiderCreditEntry[];
  total: number;
  source?: string;
};

export async function topupRiderCreditsFromWallet(
  riderId: string,
  amountMicro: number,
  userId?: string,
  auth?: AuthState | null,
  idempotencyKey?: string,
) {
  const res = await fetch('/api/rider/credits/topup/wallet', {
    method: 'POST',
    headers: riderClientAuthHeaders(auth),
    body: JSON.stringify({
      rider_id: riderId,
      user_id: userId,
      amount_micro: amountMicro,
      idempotency_key: idempotencyKey || newRiderIdempotencyKey(`topup-wallet-${riderId}`),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || data.message || 'เติมเครดิตไม่สำเร็จ') as Error & {
      status?: number;
      balance?: number;
      required?: number;
    };
    err.status = res.status;
    err.balance = data.balance;
    err.required = data.required;
    throw err;
  }
  return data as { ok: boolean; method: string; summary: RiderCreditsPayload['summary'] };
}

export async function createRiderCreditPromptPayCharge(
  amountThb: number,
  riderId?: string,
  auth?: AuthState | null,
) {
  const res = await fetch('/api/rider/credits/topup/promptpay', {
    method: 'POST',
    headers: riderClientAuthHeaders(auth),
    body: JSON.stringify({ amount: amountThb, rider_id: riderId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'สร้าง QR PromptPay ไม่สำเร็จ');
  return data as {
    charge_id: string;
    qr_code_url: string | null;
    amount: number;
    amount_micro: number;
    status: string;
  };
}

export async function pollRiderCreditTopupStatus(chargeId: string, auth?: AuthState | null) {
  const res = await fetch(`/api/rider/credits/topup/status/${encodeURIComponent(chargeId)}`, {
    cache: 'no-store',
    headers: riderClientAuthHeaders(auth),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'ตรวจสถานะไม่สำเร็จ');
  return data as {
    status: string;
    paid?: boolean;
    summary?: RiderCreditsPayload['summary'];
  };
}

/** @deprecated use topupRiderCreditsFromWallet */
export async function topupRiderCredits(
  riderId: string,
  amountMicro: number,
  userId?: string,
) {
  return topupRiderCreditsFromWallet(riderId, amountMicro, userId);
}

export async function fetchRiderCredits(
  riderId: string,
  userId?: string,
  limit = 40,
  auth?: AuthState | null,
): Promise<RiderCreditsPayload> {
  const q = new URLSearchParams({ rider_id: riderId, limit: String(limit) });
  if (userId) q.set('user_id', userId);
  const res = await fetch(`/api/rider/credits?${q}`, {
    cache: 'no-store',
    headers: riderClientAuthHeaders(auth),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'โหลดเครดิตไม่สำเร็จ');
  return data as RiderCreditsPayload;
}
