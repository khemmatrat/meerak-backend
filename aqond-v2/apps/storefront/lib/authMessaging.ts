/**
 * Unified AQOND identity copy — keep in sync with mobile/context/LanguageContext.tsx (auth.*)
 *
 * IMPLEMENTATION CHECKLIST (partner identity):
 * [x] Phase 1 — shared login/register copy (v2 + mobile)
 * [x] Phase 2 — /m/account partner hub + capability status
 * [x] Phase 3 — rename signup → เปิดใช้งาน
 * [x] Phase 4 — register without USER/PROVIDER gate + /m/onboarding/intent
 * [x] Phase 5 — mobile → v2 handoff (marketplaceHandoff.ts + Profile links)
 * [x] Phase 6 — mobile embed WebView /storefront + v2 Kong API client + BFF v2 alias
 */

export const AUTH_BRAND = {
  name: 'AQOND',
  tagline: 'ช้อป · สั่งอาหาร · ส่งด่วน ครบในที่เดียว',
  identityLine: 'บัญชีเดียว — ใช้เบอร์และรหัสผ่านเดิมได้ทุกบทบาท',
  identityDetail: '(ซื้อของ · ขายของ · ส่งของ · เปิดร้าน)',
} as const;

export const AUTH_LOGIN = {
  title: 'เข้าสู่ระบบ',
  welcome: 'ยินดีต้อนรับกลับ AQOND',
  subtitle: 'กรุณาเข้าสู่ระบบบัญชี AQOND ของคุณ',
  hintPassword: 'ใช้บัญชี AQOND — เบอร์โทรและรหัสผ่านชุดเดียวกับแอปมือถือ',
  hintOtp: 'รับรหัส OTP ทาง SMS',
  hintMobileApp: 'สมัครในแอป AQOND แล้ว? ใช้เบอร์เดิมเข้าสู่ระบบได้เลย — ไม่ต้องสมัครใหม่',
  noAccount: 'ยังไม่มีบัญชี?',
  register: 'สร้างบัญชี',
  hasAccount: 'มีบัญชีจากแอป AQOND แล้ว?',
  loginLink: 'เข้าสู่ระบบ',
} as const;

export const AUTH_REGISTER = {
  title: 'สร้างบัญชี AQOND',
  oneAccount: 'บัญชีเดียวใช้ได้ทั้งแอปมือถือและ Marketplace',
  hasAccount: 'มีบัญชีแล้ว? กดเข้าสู่ระบบ — ไม่ต้องสมัครซ้ำ',
  success: 'สร้างบัญชีสำเร็จ — เลือกสิ่งที่อยากทำต่อได้เลย',
} as const;

export const PARTNER_ACTIVATE = {
  delivery: 'เปิดใช้งานส่งของ',
  deliveryDesc: 'รับงานอาหารและพัสดุระยะใกล้',
  merchant: 'เปิดร้านบน AQOND',
  merchantDesc: 'ร้านอาหาร · Marketplace',
  sell: 'ลงขายสินค้า',
  sellDesc: 'ถ่ายรูป · Hermes AI ช่วยลง',
  messenger: 'Messenger / คนขับ',
  messengerDesc: 'ใช้ในแอป AQOND (มือถือ)',
} as const;

export const HUB = {
  greeting: 'บัญชี AQOND',
  loggedIn: 'เข้าสู่ระบบแล้ว',
  sectionTitle: 'คุณอยากทำอะไร?',
  statusActive: 'เปิดใช้งานแล้ว',
  statusPending: 'รออนุมัติ',
  statusSetup: 'เปิดใช้งาน',
  statusLocked: 'เข้าสู่ระบบก่อน',
} as const;
