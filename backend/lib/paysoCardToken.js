/**
 * PaySo card token — บันทึกบัตรใน Settings ยังไม่รองรับ (PaySo ใช้ hosted redirect)
 * เติมเงินด้วยบัตรใช้ createPaysoCardWalletDepositCharge ใน paysoService.js
 */
import {
  getPaysoCardSecretKey,
  isPaysoCardGatewayConfigured,
} from './paysoCardGateway.js';

export async function createPaysoCardToken() {
  const err = new Error(
    'PaySo ไม่รองรับบันทึกบัตรแบบ token ในแอป — ใช้เติมเงิน → Credit/Debit Card (เปิดหน้า Pay Solutions)',
  );
  err.statusCode = 501;
  throw err;
}

export function assertPaysoCardChargeReady() {
  const secretKey = getPaysoCardSecretKey();
  if (!secretKey || secretKey.includes('xxxxx') || !isPaysoCardGatewayConfigured()) {
    const err = new Error(
      'PaySo card gateway ยังไม่ได้ตั้งค่า — ตรวจ PAYSO_SECRET_KEY (Secret Key) ใน .env',
    );
    err.statusCode = 503;
    throw err;
  }
  return secretKey;
}
