import { renderMarketplaceOrderReceipt } from '../apps/storefront/lib/server/receiptEngine';
import type { OrderDetail } from '../apps/storefront/lib/server/orderDetail';

const THAI_ORDER: OrderDetail = {
  order_id: 'ord-pv26s002thai0001',
  buyer_id: 'buyer-pv26',
  merchant_id: 'aqm-demo',
  merchant_name: 'ร้านค้า Aqond Demo สาขากรุงเทพมหานคร',
  status: 'paid',
  payment_status: 'paid',
  amount_micro: 49800,
  discount_micro: 0,
  method: 'promptpay',
  created_at: '2026-07-02T10:20:00.000Z',
  items: [
    { product_id: 'p1', title: 'ชา Matcha ออร์แกนิก', qty: 1, unit_price_micro: 29900 },
    { product_id: 'p2', title: 'เสื้อเชฟ สีขาว อกเว้าลึก (ดำ)', qty: 1, unit_price_micro: 19900 },
  ],
};

const EN_ORDER: OrderDetail = {
  order_id: 'ord-pv26s002en00001',
  buyer_id: 'buyer-pv26',
  merchant_id: 'aqm-en',
  merchant_name: 'AQOND Demo Store International Branch Name That Is Very Long For Layout Testing',
  status: 'paid',
  amount_micro: 150000,
  method: 'card',
  items: Array.from({ length: 25 }, (_, i) => ({
    product_id: `p${i}`,
    title: `Product Line ${i + 1} EN`,
    qty: 1,
    unit_price_micro: 6000,
  })),
};

async function assertOrder(label: string, order: OrderDetail) {
  const r = await renderMarketplaceOrderReceipt(order, {
    baseUrl: 'http://127.0.0.1:3003',
    environment: 'test',
  });
  if (!r.validation.ok) {
    console.error(label, r.validation);
    throw new Error(`${label} validation failed`);
  }
  return {
    label,
    pdf_bytes: r.pdf_byte_length,
    template: r.template_id,
    verify_url: r.verify_url,
    unicode_ok: r.validation.unicode.ok,
  };
}

async function main() {
  const results = await Promise.all([
    assertOrder('thai_mixed', THAI_ORDER),
    assertOrder('english_large', EN_ORDER),
  ]);
  console.log(JSON.stringify({ suite: 'receipt-marketplace-s002', status: 'PASS', results }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
