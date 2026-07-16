'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useRider } from '@/components/mobile/RiderShell';
import { riderOsPath } from '@/lib/riderOsPaths';
import {
  emptyRiderCodSummary,
  fetchRiderCodSummary,
  formatCodThb,
  submitRiderCodDeposit,
  type RiderCodSummary,
} from '@/lib/riderCod';
import { getDevPreviewCodSummary } from '@/lib/riderDevPreview';

export default function RiderCodPage() {
  const { auth } = useAuth();
  const { riderId, canOperate, devPreview } = useRider();
  const [summary, setSummary] = useState<RiderCodSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [depositMethod, setDepositMethod] = useState<'bank_transfer' | 'counter' | 'wallet'>('bank_transfer');

  const reload = useCallback(async () => {
    if (!riderId) {
      setSummary(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr('');
    try {
      if (devPreview) {
        setSummary(getDevPreviewCodSummary());
        return;
      }
      if (!auth?.userId) {
        setSummary(null);
        return;
      }
      const s = await fetchRiderCodSummary(auth);
      setSummary(s);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'โหลด COD ไม่สำเร็จ';
      if (msg.includes('rider_not_registered') || msg.includes('404')) {
        setSummary(emptyRiderCodSummary(riderId));
        setErr('');
      } else {
        setErr(msg);
        setSummary(emptyRiderCodSummary(riderId));
      }
    } finally {
      setLoading(false);
    }
  }, [riderId, auth, devPreview]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const pendingHolds =
    summary?.open_holds?.filter((h) => h.status === 'held' || h.status === 'collected') || [];
  const toDeposit = pendingHolds.filter((h) => h.status === 'collected');
  const outstanding = summary?.outstanding_micro ?? 0;
  const limit = summary?.limit_micro ?? 0;
  const available = summary?.available_cod_limit_micro ?? Math.max(0, limit - outstanding);
  const utilizationPct = limit > 0 ? Math.min(100, (outstanding / limit) * 100) : 0;

  const depositOne = async (jobId: string) => {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      await submitRiderCodDeposit(
        { job_id: jobId, method: depositMethod, reference: `rider-${riderId}-${Date.now()}` },
        auth,
      );
      setMsg('บันทึกการฝากเงินแล้ว — รอระบบกระทบยอด');
      await reload();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'ฝากเงินไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const depositAll = async () => {
    if (!toDeposit.length) return;
    setBusy(true);
    setErr('');
    for (const h of toDeposit) {
      try {
        await submitRiderCodDeposit(
          { job_id: h.job_id, method: depositMethod },
          auth,
        );
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : 'ฝากเงินไม่สำเร็จ');
        break;
      }
    }
    setMsg('อัปเดตสถานะฝากเงินแล้ว');
    await reload();
    setBusy(false);
  };

  return (
    <div className="tt-rider-cod-page">
      <header className="tt-rider-cod-header">
        <h1>COD Dashboard</h1>
        <Link href={riderOsPath('/wallet')} className="tt-rider-cod-link">
          กระเป๋าเครดิต →
        </Link>
      </header>

      {!canOperate && (
        <p className="tt-hint">เปิดใช้งาน Rider OS และผ่าน KYC ก่อนจัดการ COD</p>
      )}

      {loading && <p className="tt-hint">กำลังโหลด…</p>}

      {!auth?.userId && !devPreview && (
        <p className="tt-hint">เข้าสู่ระบบเพื่อดูยอด COD และฝากเงิน</p>
      )}

      {!loading && summary && (
        <>
          <section className="tt-rider-cod-hero" aria-label="ยอด COD ที่ถืออยู่">
            <p className="tt-rider-cod-kicker">💰 เงิน COD ที่ถืออยู่</p>
            <p className="tt-rider-cod-amount">฿ {formatCodThb(outstanding)}</p>
            <p className="tt-rider-cod-meta">
              จาก {pendingHolds.length} ออเดอร์ · วงเงินคงเหลือ ฿ {formatCodThb(available)}
            </p>
            <div className="tt-rider-cod-util" aria-hidden>
              <div className="tt-rider-cod-util-track">
                <div
                  className={`tt-rider-cod-util-fill${utilizationPct > 80 ? ' tt-rider-cod-util-fill--warn' : ''}`}
                  style={{ width: `${utilizationPct}%` }}
                />
              </div>
              <p className="tt-rider-cod-util-label">
                ใช้ไป {utilizationPct.toFixed(1)}% จาก ฿ {formatCodThb(limit)}
              </p>
            </div>
            {summary.provisional && (
              <p className="tt-rider-cod-provisional">เพดาน provisional — รอ business sign-off</p>
            )}
          </section>

          <div className="tt-rider-cod-actions">
            <div className="tt-rider-cod-action-card">
              <strong>เก็บเงิน</strong>
              <span>{pendingHolds.filter((h) => h.status === 'held').length} รอเก็บ</span>
            </div>
            <div className="tt-rider-cod-action-card tt-rider-cod-action-card--warn">
              <strong>ฝากเงิน</strong>
              <span>฿ {formatCodThb(toDeposit.reduce((s, h) => s + h.amount_micro, 0))} ต้องฝาก</span>
            </div>
          </div>

          {toDeposit.length > 0 && (
            <div className="tt-rider-cod-deadline">
              ⚠️ ฝากเงินภายใน 24 ชม. หลังเก็บเงิน — ช้าเกินอาจถูก flag ใน reconciliation
            </div>
          )}

          <section className="tt-rider-cod-section">
            <h2>รายการ COD เปิดอยู่</h2>
            {pendingHolds.length === 0 && (
              <p className="tt-hint">ไม่มี COD ค้าง — พร้อมรับงานปลายทาง</p>
            )}
            {pendingHolds.map((h) => (
              <article key={h.id || h.job_id} className="tt-rider-cod-row">
                <div>
                  <strong>{h.status === 'collected' ? '🟢' : '🟡'} #{h.job_id.slice(-8)}</strong>
                  <p>฿ {formatCodThb(h.amount_micro)} · {h.status === 'collected' ? 'รอฝาก' : 'รอเก็บเงิน'}</p>
                </div>
                {h.status === 'collected' && (
                  <button
                    type="button"
                    className="tt-rider-cod-btn"
                    disabled={busy}
                    onClick={() => void depositOne(h.job_id)}
                  >
                    ฝาก
                  </button>
                )}
                {h.status === 'held' && (
                  <Link href={riderOsPath(`/active/${h.job_id}`)} className="tt-rider-cod-btn tt-rider-cod-btn--link">
                    ไปงาน
                  </Link>
                )}
              </article>
            ))}
          </section>

          <section className="tt-rider-cod-section">
            <h2>วิธีฝากเงิน</h2>
            <div className="tt-rider-cod-methods">
              {(['bank_transfer', 'counter', 'wallet'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`tt-rider-cod-method${depositMethod === m ? ' active' : ''}`}
                  onClick={() => setDepositMethod(m)}
                >
                  {m === 'bank_transfer' && '🏦 โอนธนาคาร'}
                  {m === 'counter' && '🏪 Counter Service'}
                  {m === 'wallet' && '💳 หัก Wallet'}
                </button>
              ))}
            </div>
            {toDeposit.length > 0 && (
              <button
                type="button"
                className="tt-rider-cod-deposit-all"
                disabled={busy}
                onClick={() => void depositAll()}
              >
                ยืนยันฝากเงินที่เก็บแล้วทั้งหมด
              </button>
            )}
          </section>
        </>
      )}

      {err && <p className="tt-rider-err">{err}</p>}
      {msg && <p className="tt-rider-ok">{msg}</p>}
    </div>
  );
}
