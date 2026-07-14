'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useCartOwner } from '@/lib/cartOwner';
import { IconLuxShield } from '@/components/mobile/TtLuxuryIcons';

type ReasonOption = { code: string; label_th: string };

export default function ReturnRequestPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const orderId = String(params.id || '');
  const { ownerId } = useCartOwner();
  const buyerId = searchParams.get('buyer_id') || ownerId || 'guest';

  const [reasonOptions, setReasonOptions] = useState<ReasonOption[]>([]);
  const [returnMethods, setReturnMethods] = useState<string[]>([]);
  const [reason, setReason] = useState('damaged');
  const [returnMethod, setReturnMethod] = useState('home_pickup');
  const [detail, setDetail] = useState('');
  const [merchantId, setMerchantId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [returnId, setReturnId] = useState('');

  useEffect(() => {
    fetch('/api/return/v1/config')
      .then((r) => r.json())
      .then((cfg) => {
        setReasonOptions(cfg.reason_options || []);
        setReturnMethods(cfg.enabled_return_methods || []);
        if (cfg.enabled_return_methods?.[0]) setReturnMethod(cfg.enabled_return_methods[0]);
      })
      .catch(() => setErr('โหลดการตั้งค่าไม่สำเร็จ'));

    fetch(`/api/orders?buyer_id=${encodeURIComponent(buyerId)}`)
      .then((r) => r.json())
      .then((data) => {
        const order = (data.orders || []).find(
          (o: { order_id?: string; id?: string }) => String(o.order_id || o.id) === orderId,
        );
        if (order?.merchant_id) setMerchantId(String(order.merchant_id));
      })
      .catch(() => undefined);
  }, [buyerId, orderId]);

  const submit = async () => {
    setBusy(true);
    setErr('');
    setOk('');
    try {
      const res = await fetch('/api/return/v1/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          buyer_id: buyerId,
          merchant_id: merchantId || 'aqm-demo',
          reason_code: reason,
          return_method: returnMethod,
          detail: detail.trim() || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'submit_failed');
      setReturnId(body.return?.return_id || '');
      setOk('ส่งคำขอคืนสินค้าแล้ว');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'submit_failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tt-rr-page">
      <header className="tt-rr-header">
        <Link href={`/m/orders/${orderId}?buyer_id=${encodeURIComponent(buyerId)}`} className="tt-rr-back">‹</Link>
        <h1>ขอคืนเงิน / คืนสินค้า</h1>
      </header>

      <div className="tt-od-policy-banner" style={{ margin: '12px 16px' }}>
        <span className="tt-od-policy-icon" aria-hidden>
          <IconLuxShield size={20} />
        </span>
        <div>
          <strong>เช็กก่อนจ่าย คืนได้ทันที</strong>
          <p className="tt-hint">เลือกเหตุผลและวิธีส่งคืนสินค้า</p>
        </div>
      </div>

      {ok ? (
        <div className="tt-rr-panel tt-rr-success">
          <h2>✓ {ok}</h2>
          {returnId && <p>Return ID: {returnId}</p>}
          <div className="tt-od-footer">
            <Link href={`/m/orders/${orderId}/refund?buyer_id=${encodeURIComponent(buyerId)}`} className="tt-od-btn primary">
              ดูการคืนเงิน
            </Link>
            <Link href="/m/orders?tab=returnrefund" className="tt-od-btn ghost">รายการคืนเงิน</Link>
          </div>
        </div>
      ) : (
        <form className="tt-rr-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <label>
            <span>เหตุผล</span>
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              {(reasonOptions.length ? reasonOptions : [{ code: 'damaged', label_th: 'สินค้าเสีย' }]).map((opt) => (
                <option key={opt.code} value={opt.code}>{opt.label_th}</option>
              ))}
            </select>
          </label>
          <label>
            <span>วิธีส่งคืน</span>
            <select value={returnMethod} onChange={(e) => setReturnMethod(e.target.value)}>
              {(returnMethods.length ? returnMethods : ['home_pickup']).map((id) => (
                <option key={id} value={id}>{id.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </label>
          <label>
            <span>รายละเอียดเพิ่มเติม</span>
            <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={4} placeholder="อธิบายปัญหา (ถ้ามี)" />
          </label>
          {err && <p className="tt-error-inline">{err}</p>}
          <button type="submit" className="tt-btn-primary" disabled={busy}>
            {busy ? 'กำลังส่ง…' : 'ส่งคำขอคืนสินค้า'}
          </button>
        </form>
      )}
    </div>
  );
}
