'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@aqond/ui';
import { formatCatalogPrice } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { fetchRiderDashboard } from '@/lib/rider';
import {
  fetchRiderCredits,
  requestRiderWithdraw,
  topupRiderCreditsFromWallet,
  createRiderCreditPromptPayCharge,
  pollRiderCreditTopupStatus,
  newRiderIdempotencyKey,
  type RiderCreditsPayload,
} from '@/lib/orders';
import {
  computeCreditRemainingPct,
  formatLedgerWhen,
  formatRiderLedgerEntry,
} from '@/lib/riderCreditLedger';
import { fireRiderConfetti } from '@/lib/riderConfetti';
import { RiderCreditLowBanner } from '@/components/mobile/RiderCreditLowBanner';
import { riderOsPath } from '@/lib/riderOsPaths';
import { useRider } from '@/components/mobile/RiderShell';

type TopupMethod = 'wallet' | 'promptpay';

export default function RiderWalletPage() {
  const { auth } = useAuth();
  const { riderId, canOperate, profile, profileLoading } = useRider();
  const [dash, setDash] = useState<Awaited<ReturnType<typeof fetchRiderDashboard>>>(null);
  const [credits, setCredits] = useState<RiderCreditsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [topupThb, setTopupThb] = useState('');
  const [topupMethod, setTopupMethod] = useState<TopupMethod>('wallet');
  const [topupBusy, setTopupBusy] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [pendingChargeId, setPendingChargeId] = useState<string | null>(null);
  const [pollHint, setPollHint] = useState('');
  const [ppPaidSuccess, setPpPaidSuccess] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const reload = useCallback(async () => {
    if (!riderId) {
      setCredits(null);
      setDash(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [c, d] = await Promise.all([
        fetchRiderCredits(riderId, auth?.userId, 40, auth).catch(() => null),
        fetchRiderDashboard(riderId).catch(() => null),
      ]);
      setCredits(c);
      setDash(d);
    } finally {
      setLoading(false);
    }
  }, [riderId, auth?.userId]);

  useEffect(() => {
    void reload();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [reload]);

  const s = credits?.summary;
  const creditLimit = s?.credit_limit_micro ?? 0;
  const creditUsed = s?.credit_used_micro ?? 0;
  const availableCredit = s?.available_credit_micro ?? Math.max(0, creditLimit - creditUsed);
  const withdrawable = s?.withdrawable_micro ?? 0;
  const pendingWithdraw = s?.pending_withdraw_micro ?? 0;
  const earned = s?.earned_micro ?? 0;
  const completedJobs = s?.completed_jobs ?? 0;
  const creditPct = computeCreditRemainingPct(availableCredit, creditLimit);

  const celebrateTopup = () => {
    fireRiderConfetti();
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = (chargeId: string) => {
    stopPolling();
    setPendingChargeId(chargeId);
    setPollHint('รอชำระ PromptPay… ระบบจะอัปเดตอัตโนมัติเมื่อโอนสำเร็จ');
    setPpPaidSuccess(false);
    pollRef.current = setInterval(() => {
      void pollRiderCreditTopupStatus(chargeId, auth)
        .then(async (st) => {
          if (st.paid || st.status === 'success') {
            stopPolling();
            setQrUrl(null);
            setPendingChargeId(null);
            setPollHint('');
            setPpPaidSuccess(true);
            setMsg('ชำระเงินเรียบร้อยแล้ว — เครดิตอัปเดตแล้ว');
            celebrateTopup();
            await reload();
          }
        })
        .catch(() => {});
    }, 4000);
  };

  const topup = async () => {
    if (!riderId) return;
    const thb = parseFloat(topupThb);
    if (!Number.isFinite(thb) || thb < 1) {
      setErr('กรุณาระบุจำนวนอย่างน้อย 1 บาท');
      return;
    }
    setErr('');
    setMsg('');
    setPpPaidSuccess(false);
    setTopupBusy(true);
    const amountMicro = Math.round(thb * 100);
    const idemKey = newRiderIdempotencyKey(`topup-wallet-${riderId}`);

    try {
      if (topupMethod === 'wallet') {
        await topupRiderCreditsFromWallet(riderId, amountMicro, auth?.userId, auth, idemKey);
        setMsg(`เติมเครดิต ${formatCatalogPrice(amountMicro)} จากวอลเล็ตหลักสำเร็จ`);
        setTopupThb('');
        celebrateTopup();
        await reload();
      } else {
        const charge = await createRiderCreditPromptPayCharge(thb, riderId, auth);
        if (charge.qr_code_url) {
          setQrUrl(charge.qr_code_url);
          startPolling(charge.charge_id);
          setMsg(`สแกน QR PromptPay ฿${thb.toFixed(2)} เพื่อเติมเครดิต`);
        } else {
          setErr('ไม่ได้รับ QR จากระบบชำระเงิน — ตรวจ PAYSO config');
        }
      }
    } catch (e: unknown) {
      const ex = e as Error & { status?: number; balance?: number; required?: number };
      if (ex.status === 402 || ex.message?.includes('insufficient')) {
        setErr(
          `วอลเล็ตหลักไม่พอ (มี ฿${(ex.balance ?? 0).toFixed(2)} ต้องการ ฿${(ex.required ?? thb).toFixed(2)}) — ลอง PromptPay`,
        );
      } else {
        setErr(ex.message || 'เติมเครดิตไม่สำเร็จ');
      }
    } finally {
      setTopupBusy(false);
    }
  };

  const withdraw = async () => {
    if (!riderId || !withdrawable) return;
    setErr('');
    setMsg('');
    try {
      const idemKey = newRiderIdempotencyKey(`withdraw-${riderId}`);
      const r = await requestRiderWithdraw(riderId, withdrawable, auth, idemKey);
      setMsg(`ขอถอน ${formatCatalogPrice(withdrawable)} — รอแอดมินอนุมัติ`);
      if (r.payout_id) setMsg((m) => `${m} (${r.payout_id})`);
      await reload();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'ถอนไม่สำเร็จ');
    }
  };

  if (!profileLoading && !riderId) {
    return (
      <div className="tt-rider-wallet-page">
        <section className="tt-rider-wallet-empty">
          <p className="tt-rider-wallet-empty-title">เครดิต Rider OS</p>
          <p className="tt-hint">
            สมัคร Rider OS แล้วจะได้<strong>วงเงินเครดิตให้ยืม</strong> — เติมเครดิตเพิ่มได้จากวอลเล็ตหลักหรือ PromptPay
          </p>
          <Link href={riderOsPath('/signup')} className="tt-rider-home-onboard-cta">
            เริ่มสมัคร Rider OS →
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="tt-rider-wallet-page">
      {loading && <p className="tt-hint">กำลังโหลดเครดิต…</p>}

      {!loading && creditLimit > 0 && (
        <RiderCreditLowBanner availableMicro={availableCredit} limitMicro={creditLimit} />
      )}

      <p style={{ marginBottom: 12 }}>
        <Link href={riderOsPath('/cod')} className="tt-link-accent">
          💰 เปิด COD Dashboard (เงินสดปลายทาง) →
        </Link>
      </p>

      <section className="tt-rider-credit-cards">
        <div className="tt-rider-credit-card tt-rider-credit-card--primary">
          <span>เครดิตคงเหลือ</span>
          <strong>{formatCatalogPrice(availableCredit)}</strong>
          {creditLimit > 0 && (
            <div className="tt-rider-credit-meter" aria-label={`เครดิตคงเหลือ ${creditPct}%`}>
              <div className="tt-rider-credit-meter-bar">
                <div
                  className={`tt-rider-credit-meter-fill${creditPct < 20 ? ' low' : ''}`}
                  style={{ width: `${creditPct}%` }}
                />
              </div>
              <span className="tt-rider-credit-meter-label">{creditPct}% ของวงเงิน</span>
            </div>
          )}
          <p>ให้ยืมก่อนรับงาน</p>
        </div>
        <div className="tt-rider-credit-card">
          <span>ยอดค้าง</span>
          <strong>{formatCatalogPrice(creditUsed)}</strong>
          <p>หักคืนเมื่อส่งสำเร็จ</p>
        </div>
        <div className="tt-rider-credit-card tt-rider-credit-card--cash">
          <span>ถอนได้</span>
          <strong>{formatCatalogPrice(withdrawable)}</strong>
          <p>เงินสดหลังหักคืน</p>
        </div>
      </section>
      {creditLimit > 0 && (
        <p className="tt-rider-credit-limit-meta">
          วงเงินให้ยืม {formatCatalogPrice(creditLimit)} — แยกจากวอลเล็ตหลัก AQOND
        </p>
      )}

      <section className="tt-rider-credit-flow" aria-label="ขั้นตอนเครดิต">
        <h3>เครดิตทำงานอย่างไร</h3>
        <ol className="tt-rider-credit-flow-steps">
          <li>
            <span className="tt-rider-flow-num">1</span>
            <div>
              <strong>วงเงินให้ยืม</strong>
              <p>เปิดวงเงินเมื่อสมัคร — ใช้รับงานก่อน</p>
            </div>
          </li>
          <li className="tt-rider-flow-arrow" aria-hidden>→</li>
          <li>
            <span className="tt-rider-flow-num">2</span>
            <div>
              <strong>รับงาน</strong>
              <p>ระบบหักเครดิตชั่วคราว (~8% งาน)</p>
            </div>
          </li>
          <li className="tt-rider-flow-arrow" aria-hidden>→</li>
          <li>
            <span className="tt-rider-flow-num">3</span>
            <div>
              <strong>ส่งสำเร็จ</strong>
              <p>หักคืนเครดิตอัตโนมัติ</p>
            </div>
          </li>
          <li className="tt-rider-flow-arrow" aria-hidden>→</li>
          <li>
            <span className="tt-rider-flow-num">4</span>
            <div>
              <strong>ถอนได้</strong>
              <p>ส่วนเกินหลังหักคืน = เงินสด</p>
            </div>
          </li>
        </ol>
      </section>

      <div className="tt-rider-stat-grid tt-rider-wallet-stats">
        <div className="tt-rider-stat-card">
          <span>ถอนได้ (เงินสด)</span>
          <strong>{formatCatalogPrice(withdrawable)}</strong>
          {pendingWithdraw > 0 && (
            <p className="tt-rider-stat-sub">รอถอน {formatCatalogPrice(pendingWithdraw)}</p>
          )}
        </div>
        <div className="tt-rider-stat-card">
          <span>รายได้สะสม</span>
          <strong>{formatCatalogPrice(earned)}</strong>
          <p className="tt-rider-stat-sub">{completedJobs} เที่ยว</p>
        </div>
        <div className="tt-rider-stat-card">
          <span>รายได้วันนี้</span>
          <strong>{formatCatalogPrice(dash?.today.earnings_micro || 0)}</strong>
        </div>
        <div className="tt-rider-stat-card">
          <span>อัตรารับงาน</span>
          <strong>{dash?.today.acceptance_rate ?? 0}%</strong>
        </div>
      </div>

      <section className="tt-rider-wallet-topup">
        <h3>เติมเครดิต</h3>
        <p className="tt-hint">ชำระจริง — คืนยอดค้างก่อน แล้วขยายวงเงินให้ยืม</p>

        <div className="tt-rider-topup-methods">
          <button
            type="button"
            className={topupMethod === 'wallet' ? 'active' : ''}
            onClick={() => setTopupMethod('wallet')}
          >
            วอลเล็ตหลัก
          </button>
          <button
            type="button"
            className={topupMethod === 'promptpay' ? 'active' : ''}
            onClick={() => setTopupMethod('promptpay')}
          >
            PromptPay
          </button>
        </div>

        <div className="tt-rider-wallet-topup-row">
          <input
            className="tt-input"
            type="number"
            min={1}
            step={1}
            placeholder="จำนวน (บาท)"
            value={topupThb}
            onChange={(e) => setTopupThb(e.target.value)}
            disabled={topupBusy || !!pendingChargeId}
          />
          <Button
            type="button"
            variant="primary"
            disabled={!canOperate || loading || topupBusy || !!pendingChargeId}
            onClick={() => void topup()}
          >
            {topupBusy ? 'กำลังดำเนินการ…' : topupMethod === 'wallet' ? 'ชำระจากวอลเล็ต' : 'สร้าง QR'}
          </Button>
        </div>

        {ppPaidSuccess && (
          <div className="tt-rider-pp-success tt-rider-pp-success--celebrate">
            <p className="tt-rider-pp-success-title">ชำระเงินเรียบร้อยแล้ว</p>
            <p className="tt-hint">เครดิตอัปเดตแล้ว — สามารถรับงานต่อได้</p>
          </div>
        )}

        {qrUrl && !ppPaidSuccess && (
          <div className="tt-rider-pp-qr">
            <p className="tt-hint">สแกน PromptPay เพื่อเติมเครดิต</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrUrl} alt="PromptPay QR" />
            {pendingChargeId && (
              <button
                type="button"
                className="tt-rider-pp-cancel"
                onClick={() => {
                  stopPolling();
                  setQrUrl(null);
                  setPendingChargeId(null);
                  setPollHint('');
                }}
              >
                ยกเลิก
              </button>
            )}
          </div>
        )}
        {pollHint && !ppPaidSuccess && <p className="tt-hint tt-rider-pp-poll">{pollHint}</p>}

        <Button
          type="button"
          variant="primary"
          className="tt-rider-accept-btn"
          style={{ marginTop: 10 }}
          disabled={!withdrawable || profile?.kyc_status === 'pending' || !canOperate || loading}
          onClick={() => void withdraw()}
        >
          ขอถอนเงินสด {withdrawable > 0 ? formatCatalogPrice(withdrawable) : ''}
        </Button>
        {riderId && <p className="tt-rider-wallet-rider-id">Rider ID: {riderId}</p>}
      </section>

      <section className="tt-rider-wallet-ledger">
        <div className="tt-rider-wallet-ledger-head">
          <h3>ประวัติเครดิต</h3>
          {(credits?.total ?? 0) > 0 && <span>{credits!.total} รายการ</span>}
        </div>
        {!loading && (!credits?.entries || credits.entries.length === 0) && (
          <p className="tt-hint tt-rider-wallet-ledger-empty">
            ยังไม่มีรายการ — หลังรับงาน/เติมเครดิตจะแสดงที่นี่
          </p>
        )}
        {credits?.entries && credits.entries.length > 0 && (
          <ul className="tt-rider-wallet-ledger-list">
            {credits.entries.map((e) => {
              const display = formatRiderLedgerEntry(e);
              return (
                <li
                  key={e.id}
                  className={`tt-rider-wallet-ledger-item tt-rider-wallet-ledger-item--${display.tone}`}
                >
                  <div className="tt-rider-wallet-ledger-main">
                    <p className="tt-rider-wallet-ledger-reason">{display.title}</p>
                    <p className="tt-rider-wallet-ledger-meta">
                      {display.subtitle}
                      {' · '}
                      {formatLedgerWhen(e.created_at)}
                    </p>
                  </div>
                  <span
                    className={`tt-rider-wallet-ledger-amt ${
                      e.direction === 'credit' ? 'credit' : 'debit'
                    }`}
                  >
                    {e.direction === 'credit' ? '+' : '−'}
                    {formatCatalogPrice(e.amount_micro)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {profile?.kyc_status !== 'approved' && (
        <p className="tt-hint">
          ยืนยันตัวตนก่อนถอนเงินสด — <Link href={riderOsPath('/kyc')}>ไปยืนยัน</Link>
        </p>
      )}

      {msg && <p className="tt-merchant-ok">{msg}</p>}
      {err && <p className="tt-error-inline">{err}</p>}
    </div>
  );
}
