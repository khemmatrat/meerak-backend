'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatCatalogPrice } from '@/lib/format';
import { DISPUTE_STATUS_LABELS } from '@/lib/disputePolicy';
import { fetchMerchantDisputes, respondToDispute } from '@/lib/merchant';
import { TtDisputeTimeline } from '@/components/mobile/TtDisputeTimeline';
import { useMerchant } from '@/components/mobile/MerchantShell';

export default function MerchantHelpPage() {
  const { merchantId, merchantName, isFoodMerchant } = useMerchant();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  const [response, setResponse] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const reload = useCallback(() => {
    setLoading(true);
    fetchMerchantDisputes(merchantId)
      .then(setData)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [merchantId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const submitResponse = async (opts: {
    accept_platform?: boolean;
    propose_mutual?: boolean;
  }) => {
    if (!selected || !response.trim()) {
      setErr('กรุณาเขียนคำชี้แจง');
      return;
    }
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      await respondToDispute(selected.id, {
        response,
        ...opts,
        mutual_refund_micro: selected.refund_amount_micro,
      });
      setMsg('บันทึกคำตอบแล้ว');
      setSelected(null);
      setResponse('');
      reload();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const policies = data?.policies;
  const cases = data?.cases || [];
  const summary = data?.summary;

  return (
    <div className="tt-merchant-help-page">
      <h1 className="tt-merchant-page-title">🛡️ ศูนย์ความช่วยเหลือ</h1>
      <p className="tt-merchant-sub">{merchantName} · {isFoodMerchant ? 'ร้านอาหาร' : 'Marketplace'}</p>

      {loading && <p className="tt-loading">กำลังโหลด…</p>}
      {err && <p className="tt-error-inline">{err}</p>}
      {msg && <p className="tt-merchant-ok">{msg}</p>}

      {!loading && policies && (
        <>
          <div className="tt-help-escrow-banner">
            <strong>💰 เงินพักกับแพลตฟอร์ม</strong>
            <p>{policies.escrow}</p>
            {summary?.open_count > 0 && (
              <p className="tt-help-held">
                คดีเปิดอยู่ {summary.open_count} รายการ · พักเงินรวม {formatCatalogPrice(summary.held_total_micro)}
              </p>
            )}
          </div>

          <section className="tt-help-policy-section">
            <h2>{isFoodMerchant ? '🍱 นโยบายร้านอาหาร' : '🛍️ นโยบาย Marketplace'}</h2>
            <ul className="tt-help-policy-list">
              {policies.categories.map((c: any) => (
                <li key={c.id}>
                  <strong>{c.label}</strong>
                  <span>{c.desc}</span>
                </li>
              ))}
            </ul>
            {isFoodMerchant && (
              <div className="tt-help-policy-notes">
                <p>📹 {policies.missing_items}</p>
                <p>⚖️ {policies.wrong_order_consumed}</p>
              </div>
            )}
          </section>

          <section className="tt-help-cases-section">
            <h2>📋 คดีข้อพิพาท ({cases.length})</h2>
            {cases.length === 0 && (
              <p className="tt-hint">ไม่มีคดี — ลูกค้าแจ้งผ่านออเดอร์จะแสดงที่นี่</p>
            )}
            <ul className="tt-help-case-list">
              {cases.map((c: any) => (
                <li key={c.id}>
                  <button type="button" className="tt-help-case-row" onClick={() => setSelected(c)}>
                    <div>
                      <strong>{c.title}</strong>
                      <span className="tt-hint">#{String(c.order_id).slice(-8)} · {DISPUTE_STATUS_LABELS[c.status as keyof typeof DISPUTE_STATUS_LABELS] || c.status}</span>
                    </div>
                    <span className="tt-help-case-held">พัก {formatCatalogPrice(c.held_amount_micro)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {selected && (
        <div className="tt-sheet-backdrop" role="presentation" onClick={() => setSelected(null)}>
          <div className="tt-help-case-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="tt-merchant-order-sheet-head">
              <h2>{selected.title}</h2>
              <button type="button" className="tt-merchant-picker-close" onClick={() => setSelected(null)}>✕</button>
            </div>
            <p className="tt-hint">ออเดอร์ #{String(selected.order_id).slice(-8)} · {DISPUTE_STATUS_LABELS[selected.status]}</p>
            <p>{selected.description}</p>
            {selected.evidence_note && <p className="tt-hint">📎 {selected.evidence_note}</p>}

            <div className="tt-merchant-order-block">
              <h3>📜 Timeline ข้อพิพาท</h3>
              <TtDisputeTimeline events={selected.timeline || []} />
            </div>

            <div className="tt-merchant-order-block">
              <h3>รายการที่เกี่ยวข้อง</h3>
              <ul className="tt-merchant-order-items">
                {selected.items.map((it: any) => (
                  <li key={it.product_id} className="tt-merchant-order-line">
                    <span>
                      {it.title} x{it.qty}
                      {it.received === false && ' · ไม่ได้รับ'}
                    </span>
                    <strong>{formatCatalogPrice(it.unit_price_micro * it.qty)}</strong>
                  </li>
                ))}
              </ul>
            </div>

            <div className="tt-help-resolution-box">
              <p><strong>เงินพัก:</strong> {formatCatalogPrice(selected.held_amount_micro)}</p>
              <p><strong>คืน (เสนอ):</strong> {formatCatalogPrice(selected.refund_amount_micro)}</p>
              <p><strong>เรียกเก็บ:</strong> {formatCatalogPrice(selected.charge_amount_micro)}</p>
              {selected.resolution_note && <p className="tt-hint">{selected.resolution_note}</p>}
            </div>

            {!['resolved_refund', 'resolved_charge', 'resolved_mutual', 'closed'].includes(selected.status) && (
              <>
                <label className="tt-menu-field">
                  <span>คำชี้แจงจากร้าน</span>
                  <textarea
                    className="tt-review-input"
                    rows={3}
                    value={response}
                    onChange={(e) => setResponse(e.target.value)}
                    placeholder="อธิบายข้อเท็จจริง / ข้อเสนอ"
                  />
                </label>
                <div className="tt-help-actions">
                  <button type="button" className="tt-btn-primary" disabled={busy} onClick={() => void submitResponse({ accept_platform: true })}>
                    ยอมตามเกณฑ์ระบบ
                  </button>
                  <button type="button" className="tt-btn-ghost" disabled={busy} onClick={() => void submitResponse({ propose_mutual: true })}>
                    เสนอยอมความ
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
