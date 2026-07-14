import type { DisputeCategory } from '@/lib/disputePolicy';

export async function submitCustomerDispute(input: {
  order_id: string;
  merchant_id: string;
  customer_id: string;
  order_type: 'food' | 'marketplace';
  category: DisputeCategory;
  title: string;
  description: string;
  order_total_micro: number;
  items: {
    product_id: string;
    title: string;
    qty: number;
    unit_price_micro: number;
    received?: boolean;
  }[];
  evidence_file?: File | null;
}) {
  const form = new FormData();
  form.set('order_id', input.order_id);
  form.set('merchant_id', input.merchant_id);
  form.set('customer_id', input.customer_id);
  form.set('order_type', input.order_type);
  form.set('category', input.category);
  form.set('title', input.title);
  form.set('description', input.description);
  form.set('order_total_micro', String(input.order_total_micro));
  form.set('items', JSON.stringify(input.items));
  if (input.evidence_file) form.set('evidence_file', input.evidence_file);

  const res = await fetch('/api/disputes', { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'แจ้งปัญหาไม่สำเร็จ');
  return data;
}

export async function fetchCustomerDisputes(customerId: string, orderId?: string) {
  const q = new URLSearchParams({ customer_id: customerId });
  if (orderId) q.set('order_id', orderId);
  const res = await fetch(`/api/disputes?${q}`, { cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'โหลดไม่สำเร็จ');
  return data as { cases: unknown[] };
}
