'use client';

import { useCallback, useEffect, useState } from 'react';
import { EmptyState, StatusChip } from '@aqond/ui';
import { formatCatalogPrice, formatDate } from '@/lib/format';
import { fetchSalesAnalytics, fetchTodaySales } from '@/lib/merchant';
import { useMerchant } from '@/components/mobile/MerchantShell';
import { AxsMerchantSalesLoading } from '@/components/axs/merchant/AxsMerchantLoading';

function pctLabel(n: number | null) {
  if (n == null) return '—';
  return `${n >= 0 ? '+' : ''}${n}%`;
}

export default function MerchantSalesPage() {
  const { merchantId, merchantName } = useMerchant();
  const [data, setData] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [dash, setDash] = useState<any>(null);

  const reload = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetchTodaySales(merchantId),
      fetchSalesAnalytics(merchantId),
      fetch(`/api/merchant/dashboard?merchant_id=${encodeURIComponent(merchantId)}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ])
      .then(([today, a, d]) => {
        setData(today);
        setAnalytics(a);
        setDash(d);
      })
      .catch(() => {
        setData(null);
        setAnalytics(null);
      })
      .finally(() => setLoading(false));
  }, [merchantId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const orders = data?.orders || [];
  const cmp = analytics?.compare;

  return (
    <>
      <div className="tt-merchant-page-head">
        <h1 className="tt-merchant-page-title">📊 ยอดขาย & วิเคราะห์</h1>
        <button type="button" className="tt-merchant-refresh" onClick={reload}>รีเฟรช</button>
      </div>

      <p className="tt-hint tt-merchant-sub">{merchantName} · {data?.date || 'วันนี้'}</p>

      {dash && (
        <div className="tt-sales-card" style={{ marginBottom: 12 }}>
          <p>คิวงานค้าง · SLA เกิน</p>
          <strong>
            รอรับ {dash.pending_orders ?? 0} · เตรียม {dash.preparing_orders ?? 0} · พร้อมส่ง {dash.ready_orders ?? 0}
          </strong>
          {(dash.sla_breaches ?? 0) > 0 && (
            <span className="tt-analytics-pct down">🚨 SLA เกิน {dash.sla_breaches} ออเดอร์</span>
          )}
        </div>
      )}

      {loading && <AxsMerchantSalesLoading />}

      {!loading && analytics && (
        <section className="tt-analytics-compare">
          <div className="tt-sales-card">
            <p>วันนี้ vs เมื่อวาน</p>
            <strong>{formatCatalogPrice(cmp?.today_micro || 0)}</strong>
            <span className={`tt-analytics-pct${(cmp?.today_vs_yesterday_pct ?? 0) >= 0 ? ' up' : ' down'}`}>
              {pctLabel(cmp?.today_vs_yesterday_pct ?? null)}
            </span>
          </div>
          <div className="tt-sales-card">
            <p>สัปดาห์นี้ vs ที่แล้ว</p>
            <strong>{formatCatalogPrice(cmp?.this_week_micro || 0)}</strong>
            <span className={`tt-analytics-pct${(cmp?.week_vs_week_pct ?? 0) >= 0 ? ' up' : ' down'}`}>
              {pctLabel(cmp?.week_vs_week_pct ?? null)}
            </span>
          </div>
        </section>
      )}

      {!loading && analytics?.best_sellers?.length > 0 && (
        <section className="tt-analytics-section">
          <h2>🍽️ เมนูขายดี</h2>
          <ul className="tt-analytics-list">
            {analytics.best_sellers.map((it: any, i: number) => (
              <li key={it.title}>
                <span>{i + 1}. {it.title}</span>
                <strong>{it.qty} จาน · {formatCatalogPrice(it.revenue_micro)}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!loading && analytics?.peak_hours?.length > 0 && (
        <section className="tt-analytics-section">
          <h2>⏰ ช่วง Peak</h2>
          {analytics.peak_hours.map((h: any) => (
            <div key={h.hour} className="tt-peak-row">
              <span>{h.label}</span>
              <div className="tt-peak-bar-wrap">
                <div className="tt-peak-bar" style={{ width: `${h.pct}%` }} />
              </div>
              <strong>{formatCatalogPrice(h.revenue_micro)}</strong>
            </div>
          ))}
        </section>
      )}

      {!loading && data && (
        <>
          <div className="tt-sales-summary">
            <div className="tt-sales-card">
              <p>รายได้วันนี้</p>
              <strong>{formatCatalogPrice(data.revenue_micro || 0)}</strong>
            </div>
            <div className="tt-sales-card">
              <p>หักค่าธรรมเนียม</p>
              <strong className="tt-fee-neg">{formatCatalogPrice(data.fee_micro || 0)}</strong>
            </div>
            <div className="tt-sales-card">
              <p>สุทธิวันนี้</p>
              <strong>{formatCatalogPrice(data.net_micro ?? data.revenue_micro ?? 0)}</strong>
            </div>
          </div>

          {(data.fee_lines?.length > 0 || data.fee_micro > 0) && (
            <section className="tt-fee-today-box">
              <h2>📋 รายการหักวันนี้</h2>
              <ul className="tt-fee-ledger-lines">
                {(data.fee_lines || []).map((ln: any, i: number) => (
                  <li key={i}>{ln.label} · −{formatCatalogPrice(ln.amount_micro)}</li>
                ))}
              </ul>
            </section>
          )}

          {orders.length === 0 ? (
            <EmptyState
              icon="📊"
              title="ยังไม่มีออเดอร์ส่งสำเร็จวันนี้"
              description="ยอดขายจะแสดงเมื่อมีออเดอร์ส่งสำเร็จ"
            />
          ) : (
            <div className="tt-merchant-queue">
              {orders.map((o: any) => (
                <div key={o.order_id} className="tt-merchant-order-card compact">
                  <div className="tt-order-head">
                    <strong>#{String(o.order_id).slice(-8)}</strong>
                    <StatusChip tone="completed">ส่งสำเร็จ</StatusChip>
                  </div>
                  <p className="tt-order-meta">
                    {formatCatalogPrice(o.amount_micro)}
                    {o.created_at && ` · ${formatDate(o.created_at)}`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
