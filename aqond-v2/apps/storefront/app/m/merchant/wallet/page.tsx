'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatCatalogPrice } from '@/lib/format';
import { fetchMerchantWallet } from '@/lib/merchant';
import { useMerchant } from '@/components/mobile/MerchantShell';
import { AxsMerchantWalletLoading } from '@/components/axs/merchant/AxsMerchantLoading';

export default function MerchantWalletPage() {
  const { merchantId, merchantName, permissions } = useMerchant();
  const [wallet, setWallet] = useState<any>(null);
  const [fees, setFees] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    fetchMerchantWallet(merchantId)
      .then((d) => {
        setWallet(d.wallet);
        setFees(d.fees);
      })
      .finally(() => setLoading(false));
  }, [merchantId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const ledger = fees?.ledger || [];

  return (
    <div className="tt-merchant-wallet-page">
      <h1 className="tt-merchant-page-title">💰 กระเป๋าเงินร้าน</h1>
      <p className="tt-merchant-sub">{merchantName}</p>

      {loading && <AxsMerchantWalletLoading />}

      {!loading && wallet && (
        <>
          <div className="tt-wallet-hero">
            <p className="tt-wallet-label">รายได้สุทธิ (หลังหักค่าธรรมเนียม)</p>
            <p className="tt-wallet-amount">{formatCatalogPrice(wallet.net_earned_micro ?? wallet.total_earned_micro)}</p>
            {(wallet.total_fees_micro ?? 0) > 0 && (
              <p className="tt-hint">หักไปแล้ว {formatCatalogPrice(wallet.total_fees_micro)}</p>
            )}
          </div>
          <div className="tt-wallet-grid">
            <div className="tt-wallet-card">
              <span>✅ พร้อมถอน</span>
              <strong>{formatCatalogPrice(wallet.available_micro ?? 0)}</strong>
            </div>
            <div className="tt-wallet-card">
              <span>⏳ รอ settle</span>
              <strong>{formatCatalogPrice(wallet.pending_settlement_micro)}</strong>
              <p className="tt-hint">ยอดที่โอนเข้าร้าน (หลังหักค่าธรรมเนียมแพลตฟอร์ม)</p>
            </div>
            <div className="tt-wallet-card warn">
              <span>🔒 พักข้อพิพาท</span>
              <strong>{formatCatalogPrice(wallet.held_dispute_micro)}</strong>
            </div>
            <div className="tt-wallet-card">
              <span>📈 รายได้สะสม</span>
              <strong>{formatCatalogPrice(wallet.total_earned_micro)}</strong>
              <p className="tt-hint">ยอดสุทธิที่ร้านได้รับจากออเดอร์</p>
            </div>
            <div className="tt-wallet-card">
              <span>📉 ค่าเช่า/บริการรวม</span>
              <strong>{formatCatalogPrice(wallet.total_fees_micro || 0)}</strong>
            </div>
          </div>

          {fees && (
            <section className="tt-fee-policy-card">
              <h2>📋 อัตราค่าเช่า & ค่าบริการ</h2>
              <p className="tt-hint">
                เดือนที่ {fees.month_index}
                {fees.is_first_year ? ' · ปีแรก (ค่าเช่าฟรีจนกว่ายอดสะสม ฿10,000)' : ''}
              </p>
              <ul className="tt-fee-policy-list">
                {(fees.policy_lines || []).map((line: string) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {fees.month && (
                <p className="tt-merchant-ok">
                  เดือนนี้: รายได้ {formatCatalogPrice(fees.month.gross_micro)} · หัก {formatCatalogPrice(fees.month.fees_micro)} · สุทธิ {formatCatalogPrice(fees.month.net_micro)}
                </p>
              )}
            </section>
          )}

          {ledger.length > 0 && (
            <section className="tt-fee-ledger-section">
              <h2>📅 รายการหักรายวัน</h2>
              {ledger.slice(0, 14).map((day: any) => (
                <article key={day.date} className="tt-fee-ledger-day">
                  <div className="tt-fee-ledger-head">
                    <strong>{day.date}</strong>
                    <span>
                      {day.gross_revenue_micro > 0 && (
                        <>+{formatCatalogPrice(day.gross_revenue_micro)} </>
                      )}
                      {day.total_fee_micro > 0 && (
                        <span className="tt-fee-neg">−{formatCatalogPrice(day.total_fee_micro)}</span>
                      )}
                    </span>
                  </div>
                  {day.first_month_free && (
                    <p className="tt-hint">🎁 เดือนแรก — ไม่หักค่าบริการ</p>
                  )}
                  {day.lines?.length > 0 ? (
                    <ul className="tt-fee-ledger-lines">
                      {day.lines.map((ln: any, i: number) => (
                        <li key={`${day.date}-${i}`}>
                          {ln.label} · −{formatCatalogPrice(ln.amount_micro)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="tt-hint">ไม่มีรายการหัก</p>
                  )}
                </article>
              ))}
            </section>
          )}

          {permissions?.can_withdraw_wallet ? (
            <button type="button" className="tt-btn-primary" disabled>
              ถอนเงิน (เร็วๆ นี้)
            </button>
          ) : (
            <p className="tt-hint">บัญชีพนักงาน — ไม่มีสิทธิ์ถอนเงิน</p>
          )}
        </>
      )}
    </div>
  );
}
