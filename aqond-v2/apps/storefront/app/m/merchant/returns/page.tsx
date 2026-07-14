'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatCatalogPrice, formatDate } from '@/lib/format';
import { RETURN_REASON_OPTIONS } from '@aqond/return-core';
import { useMerchant } from '@/components/mobile/MerchantShell';
import { AxsMerchantLoading } from '@/components/axs/merchant/AxsMerchantLoading';

const REASON_LABEL: Record<string, string> = Object.fromEntries(
  RETURN_REASON_OPTIONS.map((r) => [r.code, r.label_th]),
);

export default function MerchantReturnsPage() {
  const { merchantId } = useMerchant();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const reload = useCallback(() => {
    setLoading(true);
    fetch(`/api/return/v1/merchant/returns?merchant_id=${encodeURIComponent(merchantId)}`, {
      cache: 'no-store',
    })
      .then((r) => r.json())
      .then((body) => setRows(body.returns || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [merchantId]);

  useEffect(() => {
    reload();
    const t = setInterval(reload, 20000);
    return () => clearInterval(t);
  }, [reload]);

  const respond = async (returnId: string, action: 'approve' | 'reject') => {
    setBusy(returnId);
    setMsg('');
    try {
      const res = await fetch(`/api/return/v1/merchant/returns/${encodeURIComponent(returnId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchant_id: merchantId, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'failed');
      setMsg(action === 'approve' ? 'อนุมัติคำขอคืนแล้ว' : 'ปฏิเสธคำขอคืนแล้ว');
      reload();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'ดำเนินการไม่สำเร็จ');
    } finally {
      setBusy(null);
    }
  };

  const pending = rows.filter((r) => r.state === 'requested');

  return (
    <>
      <div className="tt-merchant-page-head">
        <h1 className="tt-merchant-page-title">↩️ คืนสินค้า/คืนเงิน</h1>
        <button type="button" className="tt-merchant-refresh" onClick={reload}>
          รีเฟรช
        </button>
      </div>
      <p className="tt-merchant-sla-hint">
        คำขอจากลูกค้าจะส่งมาที่นี่ทันที — อนุมัติหรือปฏิเสธเพื่อดำเนินการต่อ
      </p>

      {msg && <p className="tt-hint tt-order-action-msg">{msg}</p>}
      {loading && <AxsMerchantLoading label="กำลังโหลดคำขอคืน…" />}

      {!loading && rows.length === 0 && (
        <div className="tt-rating-empty">
          <div className="tt-rating-empty-icon">✓</div>
          <h2>ไม่มีคำขอคืนสินค้า</h2>
          <p>เมื่อลูกค้าขอคืน รายการจะแสดงที่นี่</p>
        </div>
      )}

      <div className="tt-merchant-return-list">
        {rows.map((row) => {
          const first = row.items?.[0];
          const isNew = row.inbox_status === 'unread' && row.state === 'requested';
          return (
            <article key={row.return_id} className={`tt-merchant-return-card${isNew ? ' is-new' : ''}`}>
              {isNew && <span className="tt-merchant-return-new">ใหม่</span>}
              <div className="tt-merchant-return-head">
                <strong>#{String(row.order_id).slice(-8)}</strong>
                <span className="tt-merchant-return-status">{row.state_label_th}</span>
              </div>
              {first && (
                <div className="tt-merchant-return-product">
                  {first.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={first.image_url} alt="" />
                  )}
                  <div>
                    <p>{first.title}</p>
                    <span>x{first.qty}</span>
                  </div>
                </div>
              )}
              <p className="tt-hint">
                เหตุผล: {REASON_LABEL[row.reason_code] || row.reason_code || '—'}
                {row.amount_thb ? ` · ยอดคืน ฿${row.amount_thb}` : ''}
              </p>
              <p className="tt-order-meta">{row.created_at && formatDate(row.created_at)}</p>
              {row.state === 'requested' && (
                <div className="tt-merchant-actions">
                  <button
                    type="button"
                    className="tt-btn-primary tt-merchant-btn"
                    disabled={busy === row.return_id}
                    onClick={() => void respond(row.return_id, 'approve')}
                  >
                    อนุมัติคืน
                  </button>
                  <button
                    type="button"
                    className="tt-btn-ghost tt-merchant-btn"
                    disabled={busy === row.return_id}
                    onClick={() => void respond(row.return_id, 'reject')}
                  >
                    ปฏิเสธ
                  </button>
                </div>
              )}
              {row.merchant_response && (
                <p className="tt-hint">
                  ตอบแล้ว: {row.merchant_response === 'approved' ? 'อนุมัติ' : 'ปฏิเสธ'}
                </p>
              )}
            </article>
          );
        })}
      </div>

      {!loading && pending.length > 0 && (
        <p className="tt-hint" style={{ padding: '0 12px' }}>
          รอดำเนินการ {pending.length} รายการ
        </p>
      )}
    </>
  );
}
