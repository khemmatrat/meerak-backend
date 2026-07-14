'use client';

import { useCallback, useEffect, useState } from 'react';
import { useMerchant } from '@/components/mobile/MerchantShell';
import { formatCatalogPrice } from '@/lib/format';

export default function MerchantAdsPage() {
  const { merchantId, merchantName } = useMerchant();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [productId, setProductId] = useState('');
  const [budgetBaht, setBudgetBaht] = useState('100');
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const reload = useCallback(() => {
    setLoading(true);
    fetch(`/api/merchant/ads?merchant_id=${encodeURIComponent(merchantId)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setCampaigns(d.campaigns || []))
      .finally(() => setLoading(false));
  }, [merchantId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const create = async () => {
    setMsg('');
    const res = await fetch('/api/merchant/ads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchant_id: merchantId,
        name: name.trim() || 'แคมเปญใหม่',
        product_id: productId.trim() || undefined,
        daily_budget_micro: Math.round(Number(budgetBaht) * 100) || 10000,
        bid_micro: 500000,
        headline: merchantName,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(data.error || 'สร้างแคมเปญไม่สำเร็จ');
      return;
    }
    setName('');
    setMsg('สร้างแคมเปญแล้ว');
    reload();
  };

  return (
    <div className="tt-merchant-page">
      <h1 className="tt-merchant-page-title">📣 โฆษณา in-app</h1>
      <p className="tt-merchant-sub">{merchantName}</p>

      <section className="tt-food-checkout-block">
        <h2>สร้างแคมเปญ</h2>
        <input className="tt-input" placeholder="ชื่อแคมเปญ" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="tt-input" placeholder="Product ID (ถ้ามี)" value={productId} onChange={(e) => setProductId(e.target.value)} />
        <input className="tt-input" placeholder="งบรายวัน (บาท)" inputMode="numeric" value={budgetBaht} onChange={(e) => setBudgetBaht(e.target.value)} />
        <button type="button" className="tt-btn-primary" onClick={() => void create()}>สร้างแคมเปญ</button>
        {msg && <p className="tt-hint">{msg}</p>}
      </section>

      <h2 className="tt-checkout-h">แคมเปญที่รันอยู่</h2>
      {loading && <p className="tt-loading">กำลังโหลด…</p>}
      {campaigns.map((c) => (
        <div key={c.id} className="tt-wallet-card" style={{ marginBottom: 8 }}>
          <strong>{c.name}</strong>
          <p className="tt-hint">สถานะ {c.status} · ใช้ไป {formatCatalogPrice(c.spent_micro || 0)} / {formatCatalogPrice(c.daily_budget_micro || 0)}</p>
          {c.headline && <p>{c.headline}</p>}
        </div>
      ))}
    </div>
  );
}
