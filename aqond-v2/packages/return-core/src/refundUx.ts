import type { RefundState, RefundOrderItem } from './types';

export type RefundTimelineStep = {
  id: string;
  label_th: string;
  date?: string;
  done: boolean;
  active: boolean;
  badge?: string;
};

export const REFUND_STATE_LABELS_TH: Record<RefundState, string> = {
  pending: 'รอดำเนินการ',
  escrow_held: 'เงินถูกพักไว้ใน Escrow',
  approved: 'คำขอคืนเงินอนุมัติ',
  processing: 'อยู่ระหว่างการคืนเงิน',
  completed: 'คืนเงินแล้ว',
  failed: 'คืนเงินไม่สำเร็จ',
  rejected: 'ปฏิเสธการคืนเงิน',
};

export const RETURN_STATE_LABELS_TH: Record<string, string> = {
  requested: 'รอตรวจสอบ',
  approved: 'อนุมัติแล้ว',
  pickup_scheduled: 'นัดรับคืนแล้ว',
  picked_up: 'รับคืนแล้ว',
  in_transit: 'กำลังส่งคืน',
  delivered_merchant: 'ถึงร้านแล้ว',
  inspection: 'ตรวจสอบสินค้า',
  refund_pending: 'รอคืนเงิน',
  refund_completed: 'คืนเงินสำเร็จ',
  rejected: 'ปฏิเสธ',
  cancelled: 'ยกเลิก',
};

export const REFUND_DESTINATION_LABELS_TH: Record<'wallet' | 'bank', string> = {
  wallet: 'กระเป๋า AQOND Wallet',
  bank: 'บัญชีธนาคาร',
};

export type RefundDetailView = {
  refund_id: string;
  return_id: string;
  order_id: string;
  buyer_id: string;
  state: RefundState;
  state_label_th: string;
  banner_title_th: string;
  banner_desc_th: string;
  amount_micro: number;
  amount_thb: string;
  purchase_amount_thb?: string;
  currency: string;
  destination: 'wallet' | 'bank';
  destination_label_th: string;
  destination_mask?: string;
  escrow_reference?: string;
  escrow_status: 'not_connected' | 'pending_hold' | 'held' | 'released' | 'refunded';
  return_state: string;
  return_state_label_th: string;
  reason_code?: string;
  merchant_id?: string;
  merchant_name?: string;
  items?: RefundOrderItem[];
  timeline: RefundTimelineStep[];
  created_at: string;
  completed_at?: string;
  expected_by?: string;
};

export function thbFromMicro(micro: number): string {
  return (micro / 100).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function buildRefundTimeline(refundState: string, createdAt: string): RefundTimelineStep[] {
  const created = new Date(createdAt);
  const fmt = (d: Date) =>
    d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  const expected = new Date(created);
  expected.setDate(expected.getDate() + 7);

  const states = ['pending', 'escrow_held', 'approved', 'processing', 'completed'];
  const idx = states.indexOf(refundState);
  const approved = idx >= 2 || refundState === 'escrow_held';
  const processing = idx >= 3 || refundState === 'escrow_held' || refundState === 'processing';
  const done = refundState === 'completed';

  return [
    {
      id: 'approved',
      label_th: 'คำขอคืนเงินอนุมัติ',
      date: fmt(created),
      done: approved || processing || done,
      active: refundState === 'pending' || refundState === 'approved',
    },
    {
      id: 'processing',
      label_th: 'อยู่ระหว่างการคืนเงิน',
      date: approved || processing ? fmt(created) : undefined,
      done: processing || done,
      active: refundState === 'escrow_held' || refundState === 'processing',
    },
    {
      id: 'received',
      label_th: 'ได้รับเงินคืนภายใน',
      date: done ? fmt(new Date()) : undefined,
      done,
      active: !done && (processing || refundState === 'escrow_held'),
      badge: done ? undefined : `ภายใน ${fmt(expected)}`,
    },
  ];
}

export function composeRefundBanner(state: RefundState): { title: string; desc: string } {
  switch (state) {
    case 'completed':
      return {
        title: 'คืนเงินสำเร็จ',
        desc: 'คำขอคืนเงินได้รับการอนุมัติแล้ว เราจะทำการคืนเงินให้คุณ ขอบคุณสำหรับความร่วมมือ',
      };
    case 'processing':
    case 'escrow_held':
    case 'approved':
      return {
        title: 'อยู่ระหว่างการคืนเงิน',
        desc: 'AQOND ดำเนินการคืนเงินแล้ว คุณควรได้รับเงินภายใน 7 วันทำการ',
      };
    case 'rejected':
      return { title: 'คำขอถูกปฏิเสธ', desc: 'กรุณาติดต่อ Customer Service หากต้องการอุทธรณ์' };
    default:
      return {
        title: 'รอดำเนินการคืนเงิน',
        desc: 'เราได้รับคำขอคืนเงิน/คืนสินค้าแล้ว กำลังตรวจสอบ',
      };
  }
}

export function composeRefundDetailView(input: {
  refund: {
    refund_id: string;
    return_id: string;
    order_id: string;
    buyer_id: string;
    amount_micro: number;
    currency: string;
    state: string;
    destination: 'wallet' | 'bank';
    escrow_reference?: string;
    completed_at?: string;
    created_at: string;
  };
  return_state: string;
  reason_code?: string;
  merchant_id?: string;
  merchant_name?: string;
  purchase_amount_micro?: number;
  destination_mask?: string;
  items?: RefundOrderItem[];
}): RefundDetailView {
  const state = input.refund.state as RefundState;
  let escrow_status: RefundDetailView['escrow_status'] = 'not_connected';
  if (input.refund.escrow_reference) {
    if (state === 'completed' && input.refund.escrow_reference) escrow_status = 'refunded';
    else if (state === 'escrow_held') escrow_status = 'held';
    else escrow_status = 'pending_hold';
  }

  const banner = composeRefundBanner(state);
  const created = new Date(input.refund.created_at);
  const expected = new Date(created);
  expected.setDate(expected.getDate() + 7);

  return {
    refund_id: input.refund.refund_id,
    return_id: input.refund.return_id,
    order_id: input.refund.order_id,
    buyer_id: input.refund.buyer_id,
    state,
    state_label_th: REFUND_STATE_LABELS_TH[state] || input.refund.state,
    banner_title_th: banner.title,
    banner_desc_th: banner.desc,
    amount_micro: input.refund.amount_micro,
    amount_thb: thbFromMicro(input.refund.amount_micro),
    purchase_amount_thb: input.purchase_amount_micro
      ? thbFromMicro(input.purchase_amount_micro)
      : undefined,
    currency: input.refund.currency,
    destination: input.refund.destination,
    destination_label_th: REFUND_DESTINATION_LABELS_TH[input.refund.destination],
    destination_mask: input.destination_mask,
    escrow_reference: input.refund.escrow_reference,
    escrow_status,
    return_state: input.return_state,
    return_state_label_th: RETURN_STATE_LABELS_TH[input.return_state] || input.return_state,
    reason_code: input.reason_code,
    merchant_id: input.merchant_id,
    merchant_name: input.merchant_name,
    items: input.items,
    timeline: buildRefundTimeline(state, input.refund.created_at),
    created_at: input.refund.created_at,
    completed_at: input.refund.completed_at,
    expected_by: state !== 'completed' ? expected.toISOString() : undefined,
  };
}
