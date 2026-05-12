/** ข้อมูลผู้ให้บริการแพลตฟอร์ม — หน้า Terms / Privacy / Footer (ตั้งค่าใน .env VITE_*) */

export type LegalEntityType = "individual" | "company";

function env(key: string, fallback: string): string {
  const v = (import.meta as unknown as { env?: Record<string, string> }).env?.[key];
  return (v && String(v).trim()) || fallback;
}

const entityTypeRaw = env("VITE_LEGAL_ENTITY_TYPE", "individual").toLowerCase();
export const entityType: LegalEntityType =
  entityTypeRaw === "company" ? "company" : "individual";

/**
 * อีเมลติดต่อสาธารณะ — ต้องรับข้อความได้จริง (รวมโฟลเดอร์สแปม)
 * ผู้ให้บริการชำระเงิน (เช่น Stripe) อาจส่งอีเมลยืนยันหรือแจ้งเตือนมาที่ช่องนี้
 * โค้ดไม่สามารถตรวจสอบว่า inbox ใช้งานได้หรือไม่ — ต้องตั้งค่า DNS/MX และทดสอบรับเมลด้วยตนเอง
 */
export const companyLegal = {
  entityType,
  /**
   * ชื่อผู้ให้บริการแพลตฟอร์ม — บุคคลธรรมดา: ชื่อ-นามสกุลจริง
   * นิติบุคคล: ชื่อตามทะเบียน (ไม่ใส่คำว่า บริษัท จำกัด ใน env ถ้าไม่ต้องการให้แสดงคำนั้นในทุกบริบท)
   */
  name: env("VITE_COMPANY_LEGAL_NAME", "เขมฑัต ไชยปัญหา"),
  address: env(
    "VITE_COMPANY_ADDRESS_TH",
    "539 ร้านตัดผมแหม่มจรัญฯ95/1 แขวงบางอ้อ เขตบางพลัด กรุงเทพมหานคร 10700"
  ),
  /**
   * ทะเบียนพาณิชย์อิเล็กทรอนิกส์ (DBD e-Registration) — บนหน้าเว็บสาธารณะ
   * ถ้ายังไม่ได้จด / อยู่ระหว่างยื่น: ใช้ข้อความเช่น "อยู่ระหว่างดำเนินการ"
   * ไม่แสดงเลขบัตรประชาชนเต็มบนหน้าเว็บ — ใช้เฉพาะช่องทางยืนยันตัวตนกับ Stripe ตามที่ระบบขอ
   */
  dbdEcommerceStatus: env("VITE_ECOMMERCE_REGISTRATION_STATUS", "อยู่ระหว่างดำเนินการ"),
  /**
   * คำอธิบายสถานะผู้ประกอบการ (บุคคลธรรมดา) — ไม่ใช้คำว่า "บริษัท จำกัด"
   */
  registrationNote: env(
    "VITE_LEGAL_REGISTRATION_NOTE",
    "ดำเนินการในฐานะบุคคลธรรมดา — ยังไม่ได้จดทะเบียนเป็นนิติบุคคล มีแผนจดทะเบียนเป็นนิติบุคคลเมื่อรายได้ถึงเกณฑ์ตามกฎหมาย (เช่น 5 ล้านบาทต่อปี)"
  ),
  /** นิติบุคคล: เลขทะเบียนพาณิชย์ (เมื่อ entityType=company) */
  companyRegistrationNo: env("VITE_COMPANY_REGISTRATION_NO", ""),
  contactEmail: env("VITE_COMPANY_LEGAL_EMAIL", "support@aqond.com"),
  /**
   * ข้อความใต้หัวข้อ “ติดต่อเราผ่าน LINE” — ใช้ @handle (ไม่ใส่เบอร์โทร เพื่อกันการโทรกวน)
   */
  lineDisplayHandle: env("VITE_COMPANY_LINE_HANDLE", "@717qqpte"),
  /** ใช้สร้าง deeplink ถ้าไม่มี VITE_COMPANY_LINE_URL — แนะนำเป็น @handle */
  lineId: env("VITE_COMPANY_LINE_ID", "@717qqpte"),
  /**
   * ลิงก์เพิ่มเพื่อน OA (เช่น https://lin.ee/xxxx)
   * ถ้าว่างและ lineId เป็นเบอร์โทร ระบบจะไม่สร้างลิงก์อัตโนมัติ — บังคับใส่ URL เพื่อความปลอดภัย
   */
  lineOfficialUrl: env("VITE_COMPANY_LINE_URL", "https://lin.ee/Y1RPFyV"),
  /** QR “เพิ่มเพื่อน” จาก LINE Official Account */
  lineQrImageUrl: env(
    "VITE_COMPANY_LINE_QR_URL",
    "https://qr-official.line.me/gs/M_717qqpte_GW.png?oat_content=qr",
  ),
  /** ต้องตรงกับ INTERCITY_CANCEL_GRACE_MINUTES ใน backend/.env (ฝั่งคำนวณเงินจริง) — ดูค่าจาก API GET /api/payments/fee-config.intercityCancelGraceMinutes */
  intercityCancelGraceMinutes:
    Number(env("VITE_INTERCITY_CANCEL_GRACE_MINUTES", "15")) || 15,
  /**
   * ชื่อที่แสดงบนสรุปรายการบัตร (Stripe statement descriptor) — ต้องตรงกับ STRIPE_STATEMENT_DESCRIPTOR ฝั่ง backend
   * สูงสุด 22 ตัวอักษรตามข้อกำหนด Stripe
   */
  statementDescriptor: (() => {
    const raw = env("VITE_STRIPE_STATEMENT_DESCRIPTOR", "AQOND PLATFORM").trim() || "AQOND PLATFORM";
    return raw.slice(0, 22);
  })(),
};

/**
 * คำเรียกฝ่ายคู่สัญญาใน Terms — ไม่ใช้คำว่า "บริษัท จำกัด"
 */
export function legalPartyLabel(): string {
  return entityType === "individual" ? "ผู้ดำเนินการ" : "นิติบุคคล";
}

function isLikelyPhoneDigits(s: string): boolean {
  const compact = s.replace(/[\s-]/g, "");
  return /^\+?\d{9,15}$/.test(compact);
}

/** URL เปิด LINE (เบราว์เซอร์หรือแอป LINE) — ว่างเมื่อไม่มีช่องทางที่ปลอดภัย */
export function getCompanyLineOpenUrl(): string {
  const direct = companyLegal.lineOfficialUrl.trim();
  if (direct) return direct;
  const idRaw = companyLegal.lineId.trim();
  if (!idRaw) return "";
  /* ไม่สร้างลิงก์จากเบอร์โทร — กันเปิดเผยเบอร์ใน URL / คนโทรกวน */
  if (isLikelyPhoneDigits(idRaw)) return "";
  if (/^https?:\/\//i.test(idRaw)) return idRaw;
  const id = idRaw.replace(/^@/, "");
  /* ~ = ค้นหา LINE ID • @ = OA handle ใน path R/ti/p */
  if (idRaw.startsWith("@")) {
    return `https://line.me/R/ti/p/${idRaw}`;
  }
  return `https://line.me/ti/p/~${encodeURIComponent(id)}`;
}

/** ข้อความรองในรายการตั้งค่า — ไม่แสดงเบอร์โทร */
export function getLineContactListSubtitle(): string {
  const handle = companyLegal.lineDisplayHandle.trim();
  if (handle) return handle;
  const id = companyLegal.lineId.trim();
  if (!id || isLikelyPhoneDigits(id)) {
    return companyLegal.lineOfficialUrl.trim() ? "LINE Official" : "";
  }
  return id.startsWith("@") ? id : `@${id.replace(/^@/, "")}`;
}

/** มีช่องทาง LINE ให้ผู้ใช้ (ลิงก์และ/หรือ QR) */
export function hasLineContactInApp(): boolean {
  return Boolean(getCompanyLineOpenUrl() || companyLegal.lineQrImageUrl.trim());
}

/** แยกที่อยู่หลายบรรทัดสำหรับแสดงใน Footer / Legal */
export function formatAddressMultiline(address: string): string[] {
  return address
    .split(/\n|\\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}
