/**
 * Expert categories that use the service Merchant Hub (menu, shop, transport, payment).
 * Same booking engine as beauty (`booking_type = 'beauty'` on backend).
 */

export const SERVICE_MERCHANT_CATEGORIES = [
  "barber",
  "wellness",
  "beauty",
  "chef",
  "tailor",
  "artist",
] as const;

export type ServiceMerchantCategory =
  (typeof SERVICE_MERCHANT_CATEGORIES)[number];

export interface ServiceMerchantMeta {
  label: string;
  hubSubtitle: string;
  menuPlaceholder: string;
  shopNameLabel: string;
  bookingTitle: string;
  bookingDescription: string;
}

const DEFAULT_META: ServiceMerchantMeta = {
  label: "บริการ",
  hubSubtitle: "ตั้งร้าน เมนู ราคา ค่าเดินทาง และวิธีรับชำระ",
  menuPlaceholder: "ชื่อบริการ",
  shopNameLabel: "ชื่อร้าน",
  bookingTitle: "จองบริการ",
  bookingDescription:
    "เลือกบริการ จองที่ร้านหรือนอกสถานที่ พร้อมคำนวณค่าเดินทาง",
};

export const SERVICE_MERCHANT_META: Record<string, ServiceMerchantMeta> = {
  barber: {
    label: "Barber",
    hubSubtitle: "ตั้งร้าน เมนูตัดผม ค่าเดินทาง และการชำระเงิน",
    menuPlaceholder: "เช่น ตัดผมชาย, โกนหนวด, สระ-ไดร์",
    shopNameLabel: "ชื่อร้าน",
    bookingTitle: "จองบริการตัดผม",
    bookingDescription:
      "เลือกทรงผม/บริการ จองที่ร้านหรือนอกสถานที่ พร้อมคำนวณค่าเดินทางอัตโนมัติ",
  },
  wellness: {
    label: "Wellness & Spa",
    hubSubtitle: "ตั้งสถานที่ เมนูสปา/นวด ค่าเดินทาง และการชำระเงิน",
    menuPlaceholder: "เช่น นวดไทย 60 น., อโรมาเธรพี",
    shopNameLabel: "ชื่อสถานที่",
    bookingTitle: "จองบริการ Wellness",
    bookingDescription:
      "เลือกทรีทเมนต์ จองที่สปาหรือนอกสถานที่ พร้อมคำนวณค่าเดินทาง",
  },
  beauty: {
    label: "Beauty & Salon",
    hubSubtitle: "ตั้งร้าน เมนูความงาม ค่าเดินทาง และการชำระเงิน",
    menuPlaceholder: "เช่น ทำเล็บเจล, แต่งหน้า, สระ-ไดร์",
    shopNameLabel: "ชื่อร้าน",
    bookingTitle: "จองบริการความงาม",
    bookingDescription:
      "เลือกบริการ จองที่ร้านหรือนอกสถานที่ พร้อมคำนวณค่าเดินทาง",
  },
  chef: {
    label: "Gourmet & Chef",
    hubSubtitle: "ตั้งเมนูอาหาร สถานที่ให้บริการ ค่าเดินทาง และการชำระเงิน",
    menuPlaceholder: "เช่น Private Chef 5 เมนู, อาหารไทยรวม, บุฟเฟ่ต์",
    shopNameLabel: "ชื่อครัว / บริการ",
    bookingTitle: "จองบริการเชฟ",
    bookingDescription:
      "เลือกเมนู จองที่ครัวหรือนอกสถานที่ (On-site) พร้อมคำนวณค่าเดินทาง",
  },
  tailor: {
    label: "Style Masters",
    hubSubtitle: "ตั้งสตูดิโอ เมนูตัด/แก้ชุด ค่าเดินทาง และการชำระเงิน",
    menuPlaceholder: "เช่น ตัดสูท, แก้ไขกางเกง, ออกแบบชุด",
    shopNameLabel: "ชื่อสตูดิโอ / ร้าน",
    bookingTitle: "จองบริการ Style Master",
    bookingDescription:
      "เลือกบริการตัด/แก้ชุด จองที่ร้านหรือนอกสถานที่ พร้อมคำนวณค่าเดินทาง",
  },
  artist: {
    label: "Entertainment",
    hubSubtitle: "ตั้งแพ็กเกจโชว์ เมนูบริการ ค่าเดินทาง และการชำระเงิน",
    menuPlaceholder: "เช่น DJ 2 ชม., วาดการ์ตูน, โชว์ดนตรี",
    shopNameLabel: "ชื่อทีม / การแสดง",
    bookingTitle: "จองบริการ Entertainment",
    bookingDescription:
      "เลือกแพ็กเกจ จองที่สถานที่หรือนอกสถานที่ พร้อมคำนวณค่าเดินทาง",
  },
};

export function isServiceMerchantCategory(
  cat: string | null | undefined,
): boolean {
  if (!cat) return false;
  return (SERVICE_MERCHANT_CATEGORIES as readonly string[]).includes(
    cat.trim().toLowerCase(),
  );
}

export function getServiceMerchantMeta(
  cat: string | null | undefined,
): ServiceMerchantMeta {
  const key = (cat || "").trim().toLowerCase();
  return SERVICE_MERCHANT_META[key] ?? DEFAULT_META;
}

/** @deprecated use SERVICE_MERCHANT_CATEGORIES */
export const BEAUTY_MERCHANT_CATEGORIES = SERVICE_MERCHANT_CATEGORIES;
