/** ข้อความภาษาไทยมาตรฐาน — Advance Job / Job Board (production copy) */

export const ADVANCE_TALENT_LABEL = "ผู้รับจ้าง";
export const ADVANCE_ESCROW_SHORT = "เงินค้ำ";
export const ADVANCE_ESCROW_PHRASE = "เงินค้ำในระบบ";

export function escrowTransferLabel(): string {
  return `โอนเงินเข้า${ADVANCE_ESCROW_PHRASE}`;
}

export function escrowTransferredLabel(): string {
  return `โอนเงินเข้า${ADVANCE_ESCROW_PHRASE}แล้ว`;
}

export function waitingEmployerEscrowLabel(): string {
  return `รอนายจ้างโอน${ADVANCE_ESCROW_SHORT}`;
}

export function goToEscrowLabel(): string {
  return `ไปโอน${ADVANCE_ESCROW_SHORT}`;
}
