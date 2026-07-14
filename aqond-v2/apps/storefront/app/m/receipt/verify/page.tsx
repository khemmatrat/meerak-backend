'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

type VerifyPayload = {
  ok?: boolean;
  verified?: boolean;
  token_valid?: boolean;
  error?: string;
  receipt_number?: string;
  order_number?: string;
  merchant_name?: string;
  amount_thb?: string;
  payment_method?: string;
  verify_url?: string;
  note?: string;
  scenario?: string;
};

function VerifyBody() {
  const params = useSearchParams();
  const orderId = params.get('order_id') || '';
  const buyerId = params.get('buyer_id') || '';
  const token = params.get('v') || '';
  const [data, setData] = useState<VerifyPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) {
      setData({ ok: false, error: 'order_id_required' });
      setLoading(false);
      return;
    }
    if (!token) {
      setData({ ok: false, error: 'missing_verify_token', verified: false });
      setLoading(false);
      return;
    }
    const qs = new URLSearchParams({ order_id: orderId, v: token });
    if (buyerId) qs.set('buyer_id', buyerId);
    fetch(`/api/receipt/v1/verify?${qs}`)
      .then((r) => r.json())
      .then((body) => setData(body))
      .catch(() => setData({ ok: false, error: 'verify_failed' }))
      .finally(() => setLoading(false));
  }, [orderId, buyerId, token]);

  if (loading) {
    return <p style={{ padding: 24 }}>กำลังตรวจสอบใบเสร็จ…</p>;
  }

  if (!data?.verified) {
    return (
      <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <h1>ตรวจสอบใบเสร็จ</h1>
        <p style={{ color: '#b91c1c' }}>
          {data?.error === 'invalid_verify_token' || data?.error === 'missing_verify_token'
            ? 'QR ไม่ถูกต้องหรือถูกแก้ไข'
            : 'ไม่พบใบเสร็จหรือไม่สามารถยืนยันได้'}
        </p>
        <p style={{ fontSize: 13, color: '#6b7280' }}>{data?.error || 'unknown'}</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 480, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div
        style={{
          display: 'inline-block',
          padding: '4px 10px',
          borderRadius: 999,
          background: '#ecfdf5',
          color: '#166534',
          fontSize: 12,
          fontWeight: 600,
          marginBottom: 12,
        }}
      >
        ✓ Verified · {data.scenario || 'B2.6-S003'}
      </div>
      <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>ใบเสร็จถูกต้อง</h1>
      <p style={{ color: '#166534', fontWeight: 600 }}>AQOND Marketplace — Receipt Verify</p>
      <dl style={{ lineHeight: 1.8 }}>
        <dt>Receipt Number</dt>
        <dd>{data.receipt_number}</dd>
        <dt>Order</dt>
        <dd>{data.order_number}</dd>
        <dt>ร้านค้า</dt>
        <dd>{data.merchant_name}</dd>
        <dt>ยอดชำระ</dt>
        <dd>฿{data.amount_thb}</dd>
        <dt>ช่องทางชำระ</dt>
        <dd>{data.payment_method}</dd>
      </dl>
      <p style={{ fontSize: 12, color: '#6b7280' }}>{data.note}</p>
    </main>
  );
}

export default function ReceiptVerifyPage() {
  return (
    <Suspense fallback={<p style={{ padding: 24 }}>กำลังโหลด…</p>}>
      <VerifyBody />
    </Suspense>
  );
}
