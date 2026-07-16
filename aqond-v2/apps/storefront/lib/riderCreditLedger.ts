import type { RiderCreditEntry } from '@/lib/orders';

const ORDER_SUFFIX = (orderId?: string) =>
  orderId ? ` #${orderId.slice(-8)}` : '';

export const RIDER_CREDIT_EVENT_LABELS: Record<string, string> = {
  credit_line_open: 'เปิดวงเงินเครดิต',
  credit_limit_set: 'ตั้งวงเงินเครดิต',
  credit_consume: 'ใช้เครดิตรับงาน',
  credit_repay: 'หักคืนเครดิตหลังส่ง',
  credit_topup: 'เติมเครดิต',
  job_earning: 'รายได้จากงาน',
  platform_fee: 'ค่าธรรมเนียมแพลตฟอร์ม',
  withdraw_request: 'ขอถอนเงิน',
  withdraw_paid: 'โอนเงินสำเร็จ',
  withdraw_rejected: 'ถอนถูกปฏิเสธ',
  admin_credit: 'แอดมินเติมเครดิต',
  admin_debit: 'แอดมินหักเครดิต',
  bonus: 'โบนัส',
  penalty: 'ค่าปรับ',
  adjustment: 'ปรับยอด',
};

export type LedgerDisplay = {
  title: string;
  subtitle: string;
  tone: 'neutral' | 'earn' | 'spend' | 'topup' | 'withdraw';
};

export function formatRiderLedgerEntry(entry: RiderCreditEntry): LedgerDisplay {
  const custom = entry.reason?.trim();
  const base = RIDER_CREDIT_EVENT_LABELS[entry.event_type] || entry.event_type;
  const orderBit = ORDER_SUFFIX(entry.order_id);
  const jobBit = entry.job_id && !entry.order_id ? ` · ${entry.job_id.slice(-8)}` : '';

  let title = custom || `${base}${orderBit}${jobBit}`;
  if (!custom && entry.event_type === 'credit_consume' && entry.order_id) {
    title = `ใช้เครดิตรับงาน${orderBit}`;
  }
  if (!custom && entry.event_type === 'credit_repay' && entry.order_id) {
    title = `หักคืนเครดิตหลังส่ง${orderBit}`;
  }
  if (!custom && entry.event_type === 'job_earning' && entry.order_id) {
    title = `รายได้จากงาน${orderBit}`;
  }

  const parts: string[] = [];
  if (custom && base !== custom) parts.push(base);
  else if (!custom) parts.push(base);
  if (entry.actor_type === 'admin') parts.push('โดยแอดมิน');
  if (entry.payout_id) parts.push(`ถอน ${entry.payout_id.slice(-8)}`);

  let tone: LedgerDisplay['tone'] = 'neutral';
  if (entry.event_type === 'job_earning' || entry.event_type === 'bonus') tone = 'earn';
  else if (
    entry.event_type === 'credit_consume' ||
    entry.event_type === 'platform_fee' ||
    entry.event_type === 'penalty'
  ) {
    tone = 'spend';
  } else if (entry.event_type === 'credit_topup' || entry.event_type === 'admin_credit') {
    tone = 'topup';
  } else if (
    entry.event_type === 'withdraw_request' ||
    entry.event_type === 'withdraw_paid' ||
    entry.event_type === 'withdraw_rejected'
  ) {
    tone = 'withdraw';
  }

  return {
    title,
    subtitle: parts.filter(Boolean).join(' · ') || base,
    tone,
  };
}

export function formatLedgerWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

/** สัดส่วนเครดิตคงเหลือต่อวงเงิน (0–100) */
export function computeCreditRemainingPct(availableMicro: number, limitMicro: number): number {
  if (!(limitMicro > 0)) return 100;
  return Math.max(0, Math.min(100, Math.round((availableMicro / limitMicro) * 100)));
}

export const CREDIT_LOW_THRESHOLD_PCT = 20;

export function isCreditLow(availableMicro: number, limitMicro: number): boolean {
  return computeCreditRemainingPct(availableMicro, limitMicro) < CREDIT_LOW_THRESHOLD_PCT;
}
