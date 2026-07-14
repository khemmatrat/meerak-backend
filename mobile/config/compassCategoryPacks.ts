/**
 * Compass category packs — config-driven profession documents (Phase 2 + 6).
 */

export type CategoryPackKey =
  | "delivery"
  | "cleaning"
  | "technical"
  | "driving"
  | "messenger"
  | "public_transport"
  | "marine";

export type PackFieldType = "photo" | "file" | "text" | "select" | "confirm";

export interface PackField {
  id: string;
  label: string;
  hint?: string;
  type: PackFieldType;
  required: boolean;
  options?: { value: string; label: string }[];
}

export interface CategoryPack {
  key: CategoryPackKey;
  title: string;
  subtitle: string;
  m2Category: string;
  socialProof: string;
  estimatedMinutes: number;
  fields: PackField[];
}

export const COMPASS_CATEGORY_PACKS: Record<CategoryPackKey, CategoryPack> = {
  delivery: {
    key: "delivery",
    title: "เอกสารไรเดอร์ / ส่งของ",
    subtitle: "รถ ใบขับขี่ และบัญชีรับเงิน",
    m2Category: "Delivery",
    socialProof: "ไรเดอร์ 12,000+ ผ่านขั้นนี้แล้ว",
    estimatedMinutes: 6,
    fields: [
      {
        id: "vehicle_photo",
        label: "รูปรถ (อย่างน้อย 1 มุมชัด)",
        type: "photo",
        required: true,
      },
      {
        id: "vehicle_registration",
        label: "สำเนาเล่มทะเบียนรถ",
        type: "photo",
        required: true,
      },
      {
        id: "driver_license_front",
        label: "ใบขับขี่ — ด้านหน้า",
        type: "photo",
        required: true,
      },
      {
        id: "driver_license_back",
        label: "ใบขับขี่ — ด้านหลัง",
        type: "photo",
        required: true,
      },
      {
        id: "bank_book",
        label: "สำเนาสมุดบัญชีธนาคาร",
        type: "photo",
        required: true,
      },
      {
        id: "bank_account",
        label: "เลขบัญชี (ตรงชื่อ KYC)",
        type: "text",
        required: true,
      },
      {
        id: "plate",
        label: "ทะเบียนรถ",
        type: "text",
        required: true,
      },
      {
        id: "vehicle_type",
        label: "ประเภทรถ",
        type: "select",
        required: true,
        options: [
          { value: "motorcycle", label: "มอเตอร์ไซค์" },
          { value: "car", label: "รถยนต์" },
          { value: "van", label: "รถตู้ / กระบะ" },
        ],
      },
    ],
  },
  cleaning: {
    key: "cleaning",
    title: "เอกสารแม่บ้าน / ทำความสะอาด",
    subtitle: "บัตรและบัญชีรับเงิน",
    m2Category: "Cleaning",
    socialProof: "ผู้ให้บริการทำความสะอาด 8,500+ ผ่านขั้นนี้แล้ว",
    estimatedMinutes: 4,
    fields: [
      {
        id: "bank_book",
        label: "สำเนาสมุดบัญชีธนาคาร",
        type: "photo",
        required: true,
      },
      {
        id: "bank_account",
        label: "เลขบัญชี (ตรงชื่อ KYC)",
        type: "text",
        required: true,
      },
      {
        id: "id_verified",
        label: "ยืนยันว่าข้อมูลตรงกับบัตรประชาชนใน KYC",
        type: "confirm",
        required: true,
      },
    ],
  },
  technical: {
    key: "technical",
    title: "เอกสารช่างเทคนิค",
    subtitle: "ใบ certificate และบัญชีรับเงิน",
    m2Category: "Repair",
    socialProof: "ช่างมืออาชีพ 3,200+ ผ่านขั้นนี้แล้ว",
    estimatedMinutes: 5,
    fields: [
      {
        id: "certificate",
        label: "ใบ certificate / ใบอนุญาต (ถ้ามี)",
        type: "photo",
        required: false,
      },
      {
        id: "bank_book",
        label: "สำเนาสมุดบัญชีธนาคาร",
        type: "photo",
        required: true,
      },
      {
        id: "bank_account",
        label: "เลขบัญชี",
        type: "text",
        required: true,
      },
    ],
  },
  driving: {
    key: "driving",
    title: "เอกสารคนขับ (ผู้โดยสาร)",
    subtitle: "ใบขับขี่ รถ และบัญชี",
    m2Category: "Driving",
    socialProof: "คนขับมืออาชีพ 5,100+ ผ่านขั้นนี้แล้ว",
    estimatedMinutes: 6,
    fields: [
      {
        id: "driver_license_front",
        label: "ใบขับขี่ — ด้านหน้า",
        type: "photo",
        required: true,
      },
      {
        id: "driver_license_back",
        label: "ใบขับขี่ — ด้านหลัง",
        type: "photo",
        required: true,
      },
      {
        id: "vehicle_photo",
        label: "รูปรถ",
        type: "photo",
        required: true,
      },
      {
        id: "vehicle_registration",
        label: "สำเนาเล่มทะเบียนรถ",
        type: "photo",
        required: true,
      },
      {
        id: "bank_book",
        label: "สำเนาสมุดบัญชี",
        type: "photo",
        required: true,
      },
      {
        id: "bank_account",
        label: "เลขบัญชี",
        type: "text",
        required: true,
      },
    ],
  },
  messenger: {
    key: "messenger",
    title: "เอกสาร Messenger",
    subtitle: "รถ ใบขับขี่ และบัญชี",
    m2Category: "Messenger",
    socialProof: "Messenger 4,800+ ผ่านขั้นนี้แล้ว",
    estimatedMinutes: 5,
    fields: [
      {
        id: "vehicle_photo",
        label: "รูปรถ / มอเตอร์ไซค์",
        type: "photo",
        required: true,
      },
      {
        id: "driver_license_front",
        label: "ใบขับขี่ — ด้านหน้า",
        type: "photo",
        required: true,
      },
      {
        id: "bank_book",
        label: "สำเนาสมุดบัญชี",
        type: "photo",
        required: true,
      },
      {
        id: "bank_account",
        label: "เลขบัญชี",
        type: "text",
        required: true,
      },
    ],
  },
  public_transport: {
    key: "public_transport",
    title: "เอกสารรถสาธารณะ",
    subtitle: "ป้ายเหลือง ใบขับขี่สาธารณะ และบัญชี",
    m2Category: "Public Transport",
    socialProof: "ผู้ให้บริการรถสาธารณะ 1,900+ ผ่านขั้นนี้แล้ว",
    estimatedMinutes: 7,
    fields: [
      {
        id: "yellow_plate",
        label: "รูปป้ายเหลือง",
        type: "photo",
        required: true,
      },
      {
        id: "public_transport_license",
        label: "ใบขับขี่รถสาธารณะ",
        type: "photo",
        required: true,
      },
      {
        id: "vehicle_registration",
        label: "สำเนาเล่มทะเบียนรถ",
        type: "photo",
        required: true,
      },
      {
        id: "bank_book",
        label: "สำเนาสมุดบัญชี",
        type: "photo",
        required: true,
      },
      {
        id: "bank_account",
        label: "เลขบัญชี",
        type: "text",
        required: true,
      },
    ],
  },
  marine: {
    key: "marine",
    title: "เอกสาร Marine / ขนย้าย",
    subtitle: "เรือหรือยานพาหนะทางน้ำ",
    m2Category: "Moving",
    socialProof: "ทีม Marine 900+ ผ่านขั้นนี้แล้ว",
    estimatedMinutes: 6,
    fields: [
      {
        id: "vehicle_photo",
        label: "รูปเรือ / ยานพาหนะ",
        type: "photo",
        required: true,
      },
      {
        id: "license_doc",
        label: "ใบอนุญาต / ใบขับขี่เรือ",
        type: "photo",
        required: true,
      },
      {
        id: "bank_book",
        label: "สำเนาสมุดบัญชี",
        type: "photo",
        required: true,
      },
      {
        id: "bank_account",
        label: "เลขบัญชี",
        type: "text",
        required: true,
      },
    ],
  },
};

export function intentToPackKey(intent?: string | null): CategoryPackKey {
  switch (intent) {
    case "rider_delivery":
    case "delivery":
      return "delivery";
    case "provider_service":
    case "cleaning":
      return "cleaning";
    case "technical":
      return "technical";
    case "driving":
      return "driving";
    case "messenger":
      return "messenger";
    case "public_transport":
      return "public_transport";
    case "marine":
      return "marine";
    default:
      return "delivery";
  }
}

export function getPackForIntent(intent?: string | null): CategoryPack {
  return COMPASS_CATEGORY_PACKS[intentToPackKey(intent)];
}
