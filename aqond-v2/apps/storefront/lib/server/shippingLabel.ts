import { kongBase } from '@/lib/server-env';

export type ShippingLabelResult = {
  shipment_id?: string;
  tracking_no?: string;
  carrier_id?: string;
  label_html_path?: string;
};

export async function createShippingLabelForOrder(input: {
  order_id: string;
  merchant_id: string;
  carrier_id?: string;
  item_micro?: number;
  product_id?: string;
  weight_grams?: number;
}): Promise<ShippingLabelResult | null> {
  try {
    const res = await fetch(`${kongBase()}/api/v1/shipping/v1/shipping/label`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Aqond-Region': 'TH' },
      body: JSON.stringify({
        order_id: input.order_id,
        merchant_id: input.merchant_id,
        carrier_id: input.carrier_id || 'flash-th',
        from_region: 'TH',
        to_region: 'TH',
        weight_grams: input.weight_grams || 500,
        item_micro: input.item_micro || 0,
        product_id: input.product_id,
        currency: 'THB',
      }),
      cache: 'no-store',
    });
    const label = await res.json().catch(() => ({}));
    if (res.ok && label.tracking_no) return label as ShippingLabelResult;
  } catch {
    /* optional */
  }
  return null;
}
