import type { EscrowAdapter } from '../contracts';

export type EscrowHoldRecord = {
  hold_id: string;
  order_id: string;
  amount_micro: number;
  reason: string;
  status: 'held' | 'released' | 'refunded';
  to_merchant_id?: string;
  to_buyer_id?: string;
  refund_reference?: string;
  created_at: string;
  updated_at: string;
};

/** B2.7-S003 — existing escrow adapter (in-memory / file-backed via inject). */
export function createExistingEscrowAdapter(
  store: { holds: EscrowHoldRecord[] },
  persist?: () => Promise<void>,
): EscrowAdapter {
  const save = async () => {
    if (persist) await persist();
  };

  return {
    async hold(params) {
      const existing = store.holds.find(
        (h) => h.order_id === params.order_id && h.status === 'held',
      );
      if (existing) return { hold_id: existing.hold_id };
      const hold_id = `esc-${params.order_id.slice(-10)}-${Date.now().toString(36)}`;
      store.holds.push({
        hold_id,
        order_id: params.order_id,
        amount_micro: params.amount_micro,
        reason: params.reason,
        status: 'held',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      await save();
      return { hold_id };
    },
    async release(params) {
      const hit = store.holds.find((h) => h.hold_id === params.hold_id);
      if (!hit) throw new Error('escrow_hold_not_found');
      hit.status = 'released';
      hit.to_merchant_id = params.to_merchant_id;
      hit.updated_at = new Date().toISOString();
      await save();
      return { status: 'released' };
    },
    async refund(params) {
      const hit = store.holds.find((h) => h.hold_id === params.hold_id);
      if (!hit) throw new Error('escrow_hold_not_found');
      hit.status = 'refunded';
      hit.to_buyer_id = params.to_buyer_id;
      hit.refund_reference = `RF-${Date.now().toString(36)}`;
      hit.updated_at = new Date().toISOString();
      await save();
      return { status: 'refunded', reference: hit.refund_reference };
    },
  };
}
