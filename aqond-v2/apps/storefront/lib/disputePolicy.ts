export type DisputeOrderType = 'food' | 'marketplace';

export type MarketplaceDisputeCategory =
  | 'not_as_described'
  | 'shipping_damage'
  | 'doa';

export type FoodDisputeCategory =
  | 'cancel_order'
  | 'missing_items'
  | 'wrong_order'
  | 'wrong_menu'
  | 'damaged_food'
  | 'foreign_object'
  | 'wrong_rider_pickup'
  | 'wrong_order_consumed';

export type DisputeCategory = MarketplaceDisputeCategory | FoodDisputeCategory;

export type DisputeStatus =
  | 'open'
  | 'under_review'
  | 'awaiting_merchant'
  | 'awaiting_customer'
  | 'resolved_refund'
  | 'resolved_charge'
  | 'resolved_mutual'
  | 'closed';

export const MARKETPLACE_DISPUTE_TYPES: {
  id: MarketplaceDisputeCategory;
  label: string;
  desc: string;
}[] = [
  {
    id: 'not_as_described',
    label: 'ไม่ตรงปก / รายละเอียด',
    desc: 'สินค้าไม่ตรงตามที่โฆษณา ขอคืนสินค้า',
  },
  {
    id: 'shipping_damage',
    label: 'เสียหายระหว่างขนส่ง',
    desc: 'กล่อง/สินค้าเสียหายขณะขนส่ง',
  },
  {
    id: 'doa',
    label: 'เปิดกล่องใช้ไม่ได้ทันที',
    desc: 'Dead on Arrival — เปิดแล้วใช้งานไม่ได้ในเวลานั้น',
  },
];

export const FOOD_DISPUTE_TYPES: {
  id: FoodDisputeCategory;
  label: string;
  desc: string;
}[] = [
  {
    id: 'cancel_order',
    label: 'ยกเลิกออเดอร์',
    desc: 'ขอยกเลิกก่อน/หลังร้านรับออเดอร์',
  },
  {
    id: 'missing_items',
    label: 'ได้ไม่ครบ (Case 1)',
    desc: 'ขอตรวจจากคลิปวิดีโอ — คืนเงินเฉพาะรายการที่ไม่ได้รับ',
  },
  {
    id: 'wrong_menu',
    label: 'เมนูผิด (Case 2)',
    desc: 'ได้อาหารไม่ตรงเมนูที่สั่ง',
  },
  {
    id: 'wrong_order',
    label: 'ได้ออเดอร์ผิด',
    desc: 'ได้อาหารไม่ตรงที่สั่ง (ยังไม่บริโภค)',
  },
  {
    id: 'damaged_food',
    label: 'อาหารเสียหาย (Case 3)',
    desc: 'อาหารหก/เละ/เย็นเกินไป — แนบรูปหลักฐาน',
  },
  {
    id: 'foreign_object',
    label: 'สิ่งแปลกปลอม (Case 4)',
    desc: 'พบวัตถุแปลกปลอมในอาหาร — แนบรูปหลักฐาน',
  },
  {
    id: 'wrong_rider_pickup',
    label: 'ไรเดอร์รับผิด (Case 5)',
    desc: 'ไรเดอร์รับออเดอร์ผิดจากร้าน / QR ไม่ตรง',
  },
  {
    id: 'wrong_order_consumed',
    label: 'ออเดอร์ผิดแต่บริโภคแล้ว',
    desc: 'เกณฑ์มาตรฐาน: เรียกเก็บตามยอดนั้น เว้นแต่ทั้งสองฝ่ายยอมความ',
  },
];

export const DISPUTE_STATUS_LABELS: Record<DisputeStatus, string> = {
  open: 'เปิดคดี',
  under_review: 'ทีมตรวจสอบ',
  awaiting_merchant: 'รอร้านตอบ',
  awaiting_customer: 'รอลูกค้า',
  resolved_refund: 'คืนเงินแล้ว',
  resolved_charge: 'เรียกเก็บแล้ว',
  resolved_mutual: 'ยอมความแล้ว',
  closed: 'ปิดคดี',
};

export const ESCROW_POLICY =
  'เงินทั้งหมดของออเดอร์ที่มีข้อพิพาทจะถูกพักไว้กับแพลตฟอร์ม Aqond จนกว่าจะตัดสินหรือทั้งสองฝ่ายยอมความ';

export const WRONG_ORDER_CONSUMED_POLICY =
  'หากลูกค้ารับออเดอร์ผิดแต่บริโภคแล้ว ระบบจะเรียกเก็บตามยอดออเดอร์นั้นเป็นค่าเริ่มต้น เว้นแต่ร้านและลูกค้าตกลงยอมความร่วมกัน';

export const CLAIM_CASE_MAP: Record<string, FoodDisputeCategory> = {
  case_1: 'missing_items',
  case_2: 'wrong_menu',
  case_3: 'damaged_food',
  case_4: 'foreign_object',
  case_5: 'wrong_rider_pickup',
};

export const MISSING_ITEMS_POLICY =
  'คืนเงินเฉพาะรายการที่ไม่ได้รับเท่านั้น — ทีมตรวจสอบจากคลิปวิดีโอ/หลักฐานที่แนบ';

export const PHOTO_REQUIRED_CLAIMS = new Set<FoodDisputeCategory>([
  'damaged_food',
  'foreign_object',
  'wrong_rider_pickup',
]);
