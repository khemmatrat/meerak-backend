import {
  buildRefundId,
  buildReturnId,
  composeRefundDetailView,
  createRefundDetail,
  createReturnRequest,
  type RefundDetailView,
  type RefundOrderItem,
  type ReturnRequestDraft,
} from '@aqond/return-core';
import type { OrderDetail } from '@/lib/server/orderDetail';
import { fetchOrderDetail } from '@/lib/server/orderDetail';
import { loadServerReturnConfig } from '@/lib/server/returnConfigStore';
import { getReturnEscrowAdapter } from '@/lib/server/returnEscrowAdapter';
import { marketplaceItemImageUrl } from '@/lib/marketplaceVisual';
import {
  listMerchantReturnNotices,
  markMerchantReturnResponded,
  upsertMerchantReturnNotice,
} from '@/lib/server/merchantReturnInbox';
import { demoProductMeta } from '@/lib/server/returnDemoSeed';
import {
  getRefundById,
  getRefundByReturnId,
  getReturnById,
  listRefundsForBuyer,
  listReturnsForBuyer,
  listReturnsForMerchant,
  listReturnsForOrder,
  saveRefundRecord,
  saveReturnRequest,
  updateRefundRecord,
  updateReturnRequest,
} from '@/lib/server/returnStore';

export function orderEligibleForReturn(order: OrderDetail): boolean {
  if (order.order_type === 'food') return false;
  if (String(order.merchant_id || '').startsWith('food-')) return false;
  const paid =
    order.payment_status === 'paid' ||
    order.status === 'paid' ||
    order.status === 'completed' ||
    order.status === 'confirmed' ||
    order.status === 'shipped';
  return paid;
}

function orderItems(order: OrderDetail): RefundOrderItem[] {
  const demo = order.order_id?.includes('demo-rr') ? demoProductMeta(order.order_id) : null;
  return (order.items || []).map((it) => ({
    product_id: it.product_id,
    title: it.title || it.product_id || 'สินค้า',
    qty: it.qty || 1,
    unit_price_micro: it.unit_price_micro || 0,
    variation: demo?.variation,
    image_url: marketplaceItemImageUrl(it.product_id, it.title, order.order_id, demo?.image_url),
  }));
}

function destinationMask(destination: 'wallet' | 'bank'): string {
  return destination === 'wallet' ? 'AQOND Wallet' : 'กรุงไทย (KTB) [**4819]';
}

async function enrichRefund(
  refund: NonNullable<Awaited<ReturnType<typeof getRefundById>>>,
  ret: Awaited<ReturnType<typeof getReturnById>>,
): Promise<RefundDetailView> {
  const order = await fetchOrderDetail(refund.order_id, refund.buyer_id);
  const items = order ? orderItems(order) : undefined;
  return composeRefundDetailView({
    refund,
    return_state: ret?.state || 'requested',
    reason_code: ret?.reason_code,
    merchant_id: ret?.merchant_id || order?.merchant_id,
    merchant_name: order?.merchant_name || ret?.merchant_id,
    purchase_amount_micro: order?.amount_micro,
    destination_mask: destinationMask(refund.destination),
    items,
  });
}

async function applyEscrowHold(
  orderId: string,
  amountMicro: number,
  refundId: string,
  returnId: string,
) {
  const adapter = await getReturnEscrowAdapter();
  const hold = await adapter.hold({
    order_id: orderId,
    amount_micro: amountMicro,
    reason: 'return_refund_or002',
  });
  await updateRefundRecord(refundId, {
    state: 'escrow_held',
    escrow_reference: hold.hold_id,
  });
  await updateReturnRequest(returnId, { escrow_hold_id: hold.hold_id });
  return hold.hold_id;
}

export async function submitReturnRequest(draft: ReturnRequestDraft) {
  const order = await fetchOrderDetail(draft.order_id, draft.buyer_id);
  if (!order) throw new Error('order_not_found');
  if (!orderEligibleForReturn(order)) throw new Error('order_not_eligible');
  if (draft.buyer_id && order.buyer_id && draft.buyer_id !== order.buyer_id) {
    throw new Error('buyer_mismatch');
  }
  const merchantId = draft.merchant_id || order.merchant_id;
  if (!merchantId) throw new Error('merchant_id_required');

  const loaded = loadServerReturnConfig();
  const returnId = buildReturnId(draft.order_id);
  const record = createReturnRequest({
    draft: { ...draft, merchant_id: merchantId, buyer_id: draft.buyer_id || order.buyer_id || '' },
    config: loaded.config,
    return_id: returnId,
  });

  const saved = await saveReturnRequest(record);
  let refundId: string | undefined;

  await upsertMerchantReturnNotice({
    return_id: saved.return_id,
    order_id: saved.order_id,
    merchant_id: merchantId,
    buyer_id: saved.buyer_id,
    reason_code: saved.reason_code,
    return_method: saved.return_method,
    detail: saved.detail,
    state: saved.state,
    inbox_status: 'unread',
  });

  if (loaded.config.capabilities.refund_request?.enabled) {
    refundId = buildRefundId(saved.return_id);
    const refund = createRefundDetail(
      { return_record: saved, order_amount_micro: order.amount_micro || 0, refund_id: refundId },
      loaded.config,
    );
    await saveRefundRecord(refund);
    await updateReturnRequest(saved.return_id, { refund_id: refundId });

    if (loaded.config.capabilities.escrow_refund?.enabled) {
      await applyEscrowHold(order.order_id, order.amount_micro || 0, refundId, saved.return_id);
    }
  }

  return { ...saved, refund_id: refundId };
}

export async function getRefundDetailById(refundId: string, buyerId?: string) {
  const refund = await getRefundById(refundId);
  if (!refund) return null;
  if (buyerId && refund.buyer_id !== buyerId) throw new Error('forbidden');
  const ret = await getReturnById(refund.return_id);
  return enrichRefund(refund, ret);
}

export async function getRefundDetailForReturn(returnId: string, buyerId?: string) {
  const ret = await getReturnById(returnId);
  if (!ret) return null;
  if (buyerId && ret.buyer_id !== buyerId) throw new Error('forbidden');
  const refund = await getRefundByReturnId(returnId);
  if (!refund) return null;
  return enrichRefund(refund, ret);
}

export async function getRefundDetailForOrder(orderId: string, buyerId?: string) {
  const returns = await listReturnsForOrder(orderId, buyerId);
  const active = returns.find((r) => !['rejected', 'cancelled'].includes(r.state));
  if (!active) return null;
  return getRefundDetailForReturn(active.return_id, buyerId);
}

export type BuyerReturnSummary = {
  return_id: string;
  order_id: string;
  state: string;
  state_label_th: string;
  refund_id?: string;
  refund_state?: string;
  refund_state_label_th?: string;
  amount_thb?: string;
  purchase_amount_thb?: string;
  merchant_name?: string;
  items?: RefundOrderItem[];
  created_at: string;
};

export async function listBuyerReturnSummaries(buyerId: string): Promise<BuyerReturnSummary[]> {
  const returns = await listReturnsForBuyer(buyerId);
  const refunds = await listRefundsForBuyer(buyerId);
  const refundByReturn = new Map(refunds.map((r) => [r.return_id, r]));

  const rows: BuyerReturnSummary[] = [];
  for (const ret of returns.sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    const refund = refundByReturn.get(ret.return_id);
    const order = await fetchOrderDetail(ret.order_id, buyerId);
    const detail = refund
      ? composeRefundDetailView({
          refund,
          return_state: ret.state,
          merchant_name: order?.merchant_name,
          purchase_amount_micro: order?.amount_micro,
          items: order ? orderItems(order) : undefined,
        })
      : null;
    rows.push({
      return_id: ret.return_id,
      order_id: ret.order_id,
      state: ret.state,
      state_label_th: detail?.return_state_label_th || ret.state,
      refund_id: ret.refund_id,
      refund_state: refund?.state,
      refund_state_label_th: detail?.state_label_th,
      amount_thb: detail?.amount_thb,
      purchase_amount_thb: detail?.purchase_amount_thb,
      merchant_name: order?.merchant_name || ret.merchant_id,
      items: order ? orderItems(order) : undefined,
      created_at: ret.created_at,
    });
  }
  return rows;
}

export type MerchantReturnRow = {
  return_id: string;
  order_id: string;
  buyer_id: string;
  state: string;
  state_label_th: string;
  reason_code?: string;
  return_method?: string;
  detail?: string;
  amount_thb?: string;
  merchant_name?: string;
  items?: RefundOrderItem[];
  inbox_status: string;
  merchant_response?: string;
  created_at: string;
};

export async function listMerchantReturnSummaries(merchantId: string): Promise<MerchantReturnRow[]> {
  const [returns, notices] = await Promise.all([
    listReturnsForMerchant(merchantId),
    listMerchantReturnNotices(merchantId),
  ]);
  const noticeByReturn = new Map(notices.map((n) => [n.return_id, n]));
  const rows: MerchantReturnRow[] = [];

  for (const ret of returns.sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    const notice = noticeByReturn.get(ret.return_id);
    if (!notice) {
      await upsertMerchantReturnNotice({
        return_id: ret.return_id,
        order_id: ret.order_id,
        merchant_id: ret.merchant_id,
        buyer_id: ret.buyer_id,
        reason_code: ret.reason_code,
        return_method: ret.return_method,
        detail: ret.detail,
        state: ret.state,
        inbox_status: 'read',
      });
    }
    const order = await fetchOrderDetail(ret.order_id, ret.buyer_id);
    const refund = await getRefundByReturnId(ret.return_id);
    const detail = refund
      ? composeRefundDetailView({
          refund,
          return_state: ret.state,
          merchant_name: order?.merchant_name,
          purchase_amount_micro: order?.amount_micro,
          items: order ? orderItems(order) : undefined,
        })
      : null;
    rows.push({
      return_id: ret.return_id,
      order_id: ret.order_id,
      buyer_id: ret.buyer_id,
      state: ret.state,
      state_label_th: detail?.return_state_label_th || ret.state,
      reason_code: ret.reason_code,
      return_method: ret.return_method,
      detail: ret.detail,
      amount_thb: detail?.amount_thb,
      merchant_name: order?.merchant_name || ret.merchant_id,
      items: order ? orderItems(order) : undefined,
      inbox_status: notice?.inbox_status || 'read',
      merchant_response: notice?.merchant_response,
      created_at: ret.created_at,
    });
  }
  return rows;
}

export async function merchantRespondToReturn(input: {
  return_id: string;
  merchant_id: string;
  action: 'approve' | 'reject';
  note?: string;
}) {
  const ret = await getReturnById(input.return_id);
  if (!ret) throw new Error('return_not_found');
  if (ret.merchant_id !== input.merchant_id) throw new Error('forbidden');

  const nextState = input.action === 'approve' ? 'approved' : 'rejected';
  await updateReturnRequest(input.return_id, { state: nextState });
  await markMerchantReturnResponded(input.return_id, input.action, input.note);
  await upsertMerchantReturnNotice({
    return_id: ret.return_id,
    order_id: ret.order_id,
    merchant_id: ret.merchant_id,
    buyer_id: ret.buyer_id,
    reason_code: ret.reason_code,
    return_method: ret.return_method,
    detail: ret.detail,
    state: nextState,
    inbox_status: 'responded',
  });

  if (ret.refund_id) {
    await updateRefundRecord(ret.refund_id, {
      state: input.action === 'approve' ? 'processing' : 'rejected',
    });
  }

  return { return_id: input.return_id, state: nextState };
}
