'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMerchant } from '@/components/mobile/MerchantShell';
import { formatCatalogPrice } from '@/lib/format';

export default function MerchantTierPage() {
  const { merchantId, merchantName } = useMerchant();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/merchant/tier?merchant_id=${encodeURIComponent(merchantId)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [merchantId]);

  const current = data?.current;
  const next = data?.next;
  const stats = data?.stats;

  return (
    <div className="tt-merchant-page">
      <h1 className="tt-merchant-page-title">🏅 Seller Tier</h1>
      <p className="tt-merchant-sub">{merchantName}</p>

      {loading && <p className="tt-loading">กำลังโหลด…</p>}

      {current && (
        <div className="tt-wallet-hero">
          <p className="tt-wallet-label">ระดับปัจจุบัน</p>
          <p className="tt-wallet-amount">{current.label || data.tier}</p>
          <p className="tt-hint">ค่าคอมมิชชัน {((current.commission_bps || 0) / 100).toFixed(1)}%</p>
        </div>
      )}

      {stats && (
        <div className="tt-wallet-grid">
          <div className="tt-wallet-card">
            <span>ออเดอร์สำเร็จ</span>
            <strong>{stats.order_count}</strong>
          </div>
          <div className="tt-wallet-card">
            <span>รายได้รวม</span>
            <strong>{formatCatalogPrice(stats.revenue_micro)}</strong>
          </div>
        </div>
      )}

      {Array.isArray(current?.benefits) && (
        <section className="tt-food-checkout-block">
          <h2>สิทธิประโยชน์</h2>
          <ul>
            {current.benefits.map((b: string) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </section>
      )}

      {next && (
        <section className="tt-food-checkout-block">
          <h2>เป้าหมายถัดไป: {next.label}</h2>
          <p className="tt-hint">
            ต้องมียอดขาย {formatCatalogPrice(next.min_revenue_micro)} หรือ {next.min_orders} ออเดอร์
          </p>
        </section>
      )}

      <Link href="/m/merchant/wallet" className="tt-btn-secondary" style={{ display: 'block', textAlign: 'center', marginTop: 16 }}>
        ดูกระเป๋าเงินร้าน
      </Link>
    </div>
  );
}
