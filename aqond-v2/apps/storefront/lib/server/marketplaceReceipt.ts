import type { ReceiptRenderData } from '@aqond/receipt-core';
import { buildJarvisAuditEnvelope, jarvisAuditToRenderData } from '@aqond/receipt-core';
import type { OrderDetail } from '@/lib/server/orderDetail';

export function thbFromMicro(micro: number): string {
  return (micro / 100).toFixed(2);
}

/** @deprecated use buildSignedReceiptVerifyUrl from receiptVerify.ts */
export function buildReceiptVerifyUrl(orderId: string, baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, '');
  return `${base}/m/receipt/verify?order_id=${encodeURIComponent(orderId)}`;
}

function bangkokDate(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
}

/** Map marketplace order → Receipt Core R001 render data. */
export function buildMarketplaceReceiptData(
  order: OrderDetail,
  verifyUrl: string,
): ReceiptRenderData {
  const lineItems = order.items || [];
  const items = lineItems.map((it) => ({
    title: it.title || it.product_id || 'Item',
    qty: it.qty || 1,
    amount: thbFromMicro((it.unit_price_micro || 0) * (it.qty || 1)),
  }));

  const subtotalMicro = lineItems.reduce(
    (sum, it) => sum + (it.unit_price_micro || 0) * (it.qty || 1),
    0,
  );
  const discountMicro = order.discount_micro || 0;
  const totalMicro = order.amount_micro ?? Math.max(0, subtotalMicro - discountMicro);
  const meta = order as Record<string, unknown>;
  const recipient = meta.recipient as string | undefined;
  const carrierId = meta.carrier_id as string | undefined;
  const shippingAddress = meta.shipping_address as string | undefined;

  return {
    header: {
      title: 'ใบเสร็จ / RECEIPT',
      receipt_number: `AQ-RCP-${order.order_id.slice(-12).toUpperCase()}`,
      order_number: `#${order.order_id.slice(-8)}`,
      issue_date: bangkokDate(order.created_at),
      status: String(order.payment_status || order.status || 'paid'),
    },
    brand: { subtitle: 'AQOND Marketplace' },
    merchant: {
      name: order.merchant_name || order.merchant_id || 'Merchant',
      merchant_id: order.merchant_id,
    },
    customer: {
      name: recipient || (order.buyer_id ? `Buyer ${order.buyer_id.slice(-6)}` : 'Customer'),
    },
    items,
    totals: {
      subtotal: thbFromMicro(subtotalMicro),
      delivery: '0.00',
      discount: discountMicro > 0 ? `-${thbFromMicro(discountMicro)}` : '0.00',
      vat: '0.00',
      total: thbFromMicro(totalMicro),
    },
    payment: {
      method: order.method || '-',
      status: String(order.payment_status || order.status || '-'),
      reference: order.payso_reference_id,
      paid_at: bangkokDate(order.created_at),
    },
    delivery: {
      method: carrierId || shippingAddress || 'Marketplace Delivery',
      fee: '0.00',
    },
    verify: { url: verifyUrl },
    jarvis_audit: jarvisAuditToRenderData(
      buildJarvisAuditEnvelope({
        order_id: order.order_id,
        amount_micro: totalMicro,
        item_count: lineItems.length,
        payment_method: order.method,
      }),
    ),
  };
}
