/**
 * Mock GigaStore Digital Goods API — returns synthetic activation payload (QR data URL).
 * Production: set GIGASTORE_USE_LIVE=1 and use ../gigastoreFulfillment.js (see .env.golive.example).
 */
import crypto from 'crypto';

const SKU_PREFIX = 'GS-TH-EMRG';

/** Mock catalog aligned with product codes pattern */
export const GIGASTORE_MOCK_CATALOG = [
  {
    sku: `${SKU_PREFIX}-1D-1GB`,
    name: 'Rescue Net TH — 1 วัน / 1GB',
    basePrice: 79,
    validityDays: 1,
    dataGb: 1,
    region: 'TH',
    notes: 'เหมาะเป็นทางเลือกฉุกเฉินเมื่อเน็ตหลักมีปัญหา — ตรวจสอบความพร้อม eSIM ของเครื่องก่อนซื้อ',
  },
  {
    sku: `${SKU_PREFIX}-3D-3GB`,
    name: 'Rescue Net TH — 3 วัน / 3GB',
    basePrice: 199,
    validityDays: 3,
    dataGb: 3,
    region: 'TH',
    notes: 'ใช้งานสั้น ๆ สำหรับทริปหรือสำรองข้อมูล — การเชื่อมต่อขึ้นกับพื้นที่และเครือข่าย',
  },
  {
    sku: `${SKU_PREFIX}-7D-10GB`,
    name: 'Rescue Net TH — 7 วัน / 10GB',
    basePrice: 449,
    validityDays: 7,
    dataGb: 10,
    region: 'TH',
    notes: 'แพ็กเกจยาวขึ้นสำหรับใช้งานต่อเนื่อง — อ่านนโยบายคืนเงินและข้อจำกัดบริการในแอป',
  },
];

export function findMockSku(sku) {
  return GIGASTORE_MOCK_CATALOG.find((p) => p.sku === sku) || null;
}

/**
 * Simulates POST to GigaStore — returns order ref + activation QR (data URL).
 */
export async function gigastoreFulfillOrder({ sku, userId, purchaseId }) {
  const product = findMockSku(sku);
  if (!product) {
    const err = new Error('UNKNOWN_SKU');
    err.code = 'UNKNOWN_SKU';
    throw err;
  }
  const orderRef = `GS-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
  const token = Buffer.from(
    JSON.stringify({
      v: 1,
      sku,
      orderRef,
      userId: String(userId),
      purchaseId,
      ts: Date.now(),
    }),
    'utf8'
  ).toString('base64');
  const qrPayload = `AQOND-ESIM-ACTIVATE:${token}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect fill="#0f0f0f" width="200" height="200"/><text x="100" y="95" text-anchor="middle" fill="#f97316" font-size="11" font-family="monospace">GigaStore</text><text x="100" y="118" text-anchor="middle" fill="#fafafa" font-size="9" font-family="monospace">${orderRef.slice(0, 12)}</text></svg>`;
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  return {
    orderRef,
    activationQrDataUrl: dataUrl,
    activationPayload: qrPayload,
    raw: { provider: 'gigastore-mock', product },
  };
}
