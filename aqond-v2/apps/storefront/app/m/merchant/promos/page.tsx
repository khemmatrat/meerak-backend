'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { fetchMerchantPromotions, saveMerchantPromotion } from '@/lib/merchantPromos';
import { useMerchant } from '@/components/mobile/MerchantShell';

export default function MerchantPromosPage() {
  const { auth } = useAuth();
  const { merchantId, merchantName, permissions } = useMerchant();
  const actor = auth?.userId || 'merchant';
  const [promos, setPromos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const reload = useCallback(() => {
    setLoading(true);
    fetchMerchantPromotions(merchantId)
      .then((d) => setPromos(d.promotions || []))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [merchantId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const create = async (kind: 'menu_discount' | 'free_delivery' | 'temp_min_order') => {
    if (!permissions?.can_edit_menu) {
      setErr('ไม่มีสิทธิ์จัดการโปรโมชัน');
      return;
    }
    setErr('');
    setMsg('');
    try {
      if (kind === 'menu_discount') {
        await saveMerchantPromotion({
          merchant_id: merchantId,
          actor,
          kind,
          label: 'ลด 10% ทุกเมนู',
          discount_percent: 10,
        });
      } else if (kind === 'free_delivery') {
        await saveMerchantPromotion({
          merchant_id: merchantId,
          actor,
          kind,
          label: 'ส่งฟรี 11:00–14:00',
          window_start: '11:00',
          window_end: '14:00',
        });
      } else {
        await saveMerchantPromotion({
          merchant_id: merchantId,
          actor,
          kind,
          label: 'ขั้นต่ำ ฿99 ชั่วคราว',
          min_order_micro: 9900,
          ends_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        });
      }
      setMsg('สร้างโปรโมชันแล้ว — ลูกค้าเห็นทันที');
      reload();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  return (
    <div className="tt-merchant-promos-page">
      <h1 className="tt-merchant-page-title">🏷️ โปรโมชันร้าน</h1>
      <p className="tt-merchant-sub">{merchantName}</p>

      {loading && <p className="tt-loading">กำลังโหลด…</p>}
      {msg && <p className="tt-merchant-ok">{msg}</p>}
      {err && <p className="tt-error-inline">{err}</p>}

      {permissions?.can_edit_menu && (
        <section className="tt-merchant-status-card">
          <h2>➕ สร้างโปรเร็ว</h2>
          <div className="tt-promo-quick-row">
            <button type="button" className="tt-btn-ghost" onClick={() => void create('menu_discount')}>
              ลดราคาเมนู 10%
            </button>
            <button type="button" className="tt-btn-ghost" onClick={() => void create('free_delivery')}>
              ส่งฟรี 11–14 น.
            </button>
            <button type="button" className="tt-btn-primary" onClick={() => void create('temp_min_order')}>
              ขั้นต่ำ ฿99 (7 วัน)
            </button>
          </div>
        </section>
      )}

      <section className="tt-merchant-status-card">
        <h2>โปรที่ใช้อยู่ ({promos.length})</h2>
        {promos.length === 0 && <p className="tt-hint">ยังไม่มีโปร — สร้างด้านบน</p>}
        <ul className="tt-merchant-shop-list">
          {promos.map((p) => (
            <li key={p.id} className="tt-merchant-shop-row">
              <div>
                <strong>{p.label}</strong>
                <span className="tt-hint"> · {p.kind} {p.active ? '✅' : '⏸️'}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
