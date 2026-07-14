'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { formatCatalogPrice } from '@/lib/format';
import { getCreatorId } from '@/lib/affiliate';

export default function CreatorEarningsPage() {
  const { auth } = useAuth();
  const creatorId = getCreatorId(auth);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/studio/earnings?creator_id=${encodeURIComponent(creatorId)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [creatorId]);

  const revenue = data?.revenue || {};
  const links = data?.affiliate_links || [];
  const localTotals = data?.local_overlay || data?.totals || {};
  const affiliateMicro = revenue.affiliate_micro || 0;
  const payoutMicro = revenue.payout_micro || 0;
  const totalMicro =
    (revenue.live_gifts_micro || 0) +
    affiliateMicro +
    (revenue.ads_micro || 0) +
    (revenue.subscription_micro || 0);

  return (
    <>
      <header className="tt-header">
        <div className="tt-header-row">
          <Link href="/m/account" className="tt-back" aria-label="กลับ">‹</Link>
          <span style={{ flex: 1, fontWeight: 700 }}>รายได้ Creator</span>
        </div>
      </header>

      {loading && <p className="tt-loading">กำลังโหลด...</p>}

      {!loading && (
        <>
          <div className="tt-earnings-hero">
            <p className="tt-hint">งวด {revenue.period || 'เดือนนี้'}</p>
            <p className="tt-earnings-total">{formatCatalogPrice(totalMicro)}</p>
            <p className="tt-pdp-meta">
              Affiliate {formatCatalogPrice(affiliateMicro)} · Payout {formatCatalogPrice(payoutMicro)}
            </p>
            {(localTotals.clicks > 0 || localTotals.conversions > 0) && (
              <p className="tt-hint">
                คลิก {localTotals.clicks || 0} · ขาย {localTotals.conversions || 0}
              </p>
            )}
          </div>

          <div className="tt-menu-list">
            <div className="tt-menu-item">
              <span className="tt-menu-icon">🔗</span>
              <div>
                <strong>ลิงก์ Affiliate</strong>
                <p>{links.length} ลิงก์ที่ปักตะกร้า</p>
              </div>
            </div>
          </div>

          {links.length > 0 && (
            <div className="tt-affiliate-list">
              {links.map((l: any) => (
                <div key={l.id || l.product_id} className="tt-order-card">
                  <strong>{l.title || l.product_id?.slice(-8) || l.short_code}</strong>
                  <p className="tt-order-meta">
                    คลิก {l.clicks || 0} · ขาย {l.conversions || 0}
                    {l.estimated_micro != null && ` · ~${formatCatalogPrice(l.estimated_micro)}`}
                    {l.short_code && ` · code ${l.short_code}`}
                  </p>
                </div>
              ))}
            </div>
          )}

          {data?.source && (
            <p className="tt-hint" style={{ padding: '0 16px' }}>
              ข้อมูลจาก {data.source === 'bff' ? 'studio + local stats' : 'local stats'}
            </p>
          )}

          <Link href="/m/studio" className="tt-btn-primary" style={{ display: 'block', margin: '16px', textAlign: 'center' }}>
            ไป Creator Studio →
          </Link>
        </>
      )}
    </>
  );
}
