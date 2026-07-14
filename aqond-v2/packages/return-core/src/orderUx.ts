import type { OrderResolutionTab } from './types';

/** Order list tabs — UX design (Phase 0). */
export const ORDER_RESOLUTION_TABS: { id: OrderResolutionTab; label_th: string }[] = [
  { id: 'all', label_th: 'ทั้งหมด' },
  { id: 'awaiting_payment', label_th: 'รอชำระเงิน' },
  { id: 'preparing', label_th: 'กำลังเตรียมสินค้า' },
  { id: 'shipping', label_th: 'กำลังจัดส่ง' },
  { id: 'received', label_th: 'ได้รับสินค้า' },
  { id: 'completed', label_th: 'สำเร็จ' },
  { id: 'return', label_th: 'คืนสินค้า' },
  { id: 'refund', label_th: 'คืนเงิน' },
  { id: 'cancelled', label_th: 'ยกเลิก' },
  { id: 'dispute', label_th: 'ข้อพิพาท' },
  { id: 'must_receive', label_th: 'ต้องได้รับ' },
  { id: 'must_review', label_th: 'ต้องรีวิว' },
];

/** Actions on completed / active orders — UX design (Phase 0). */
export const ORDER_COMPLETION_ACTIONS = [
  { id: 'track', label_th: 'ติดตามคำสั่งซื้อ', requires: 'tracking_available' },
  { id: 'receipt', label_th: 'ดูใบเสร็จ', requires: 'receipt_core' },
  { id: 'tax_invoice', label_th: 'ขอใบกำกับภาษี', requires: 'tax_invoice_r007' },
  { id: 'reorder', label_th: 'ซื้ออีกครั้ง', requires: 'catalog' },
  { id: 'contact_merchant', label_th: 'ติดต่อร้านค้า', requires: 'shop_chat' },
  { id: 'jarvis', label_th: 'Chat Jarvis', requires: 'jarvis' },
  { id: 'return', label_th: 'คืนสินค้า', requires: 'return_core' },
  { id: 'refund', label_th: 'ขอคืนเงิน', requires: 'return_core' },
  { id: 'report_problem', label_th: 'แจ้งปัญหา', requires: 'dispute_center' },
  { id: 'review', label_th: 'รีวิวสินค้า', requires: 'reviews' },
] as const;

export const RETURN_REASON_OPTIONS = [
  { code: 'damaged', label_th: 'สินค้าเสีย' },
  { code: 'wrong_item', label_th: 'ได้รับผิด' },
  { code: 'not_as_described', label_th: 'สินค้าไม่ตรง' },
  { code: 'changed_mind', label_th: 'เปลี่ยนใจ' },
  { code: 'other', label_th: 'อื่นๆ' },
] as const;

/** Future carriers — register in config only; no code fork */
export const FUTURE_CARRIER_PROVIDERS = [
  'ninja_van',
  'scg',
  'best_express',
  'lalamove',
  'dhl',
  'ems',
] as const;
