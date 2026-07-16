'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useRider } from '@/components/mobile/RiderShell';
import { fetchRiderCredits } from '@/lib/orders';
import { riderOsPath } from '@/lib/riderOsPaths';
import {
  emptyRiderCodSummary,
  fetchRiderCodSummary,
  formatCodThb,
  submitRiderCodDeposit,
  type RiderCodHold,
  type RiderCodSummary,
} from '@/lib/riderCod';
import { getDevPreviewCodSummary } from '@/lib/riderDevPreview';
import { CodDashboardSkeleton } from '@/components/mobile/cod/CodDashboardSkeleton';
import { CodDepositModal, type CodDepositMethod } from '@/components/mobile/cod/CodDepositModal';
import { CodTransactionList } from '@/components/mobile/cod/CodTransactionList';

export function CodDashboardClient() {
  const { auth } = useAuth();
  const { riderId, canOperate, devPreview } = useRider();
  const [summary, setSummary] = useState<RiderCodSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [walletMicro, setWalletMicro] = useState<number | null>(null);

  const reload = useCallback(async () => {
    if (!riderId) {
      setSummary(null);
      setLoading(false);
      return;
    }
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
      const credits = await fetchRiderCredits(riderId, auth.userId, 5, auth).catch(() => null);
      const bal = credits?.summary?.withdrawable_micro ?? credits?.summary?.balance_micro;
      setWalletMicro(typeof bal === 'number' ? bal : null);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'โหลด COD ไม่สำเร็จ';
      if (message.includes('rider_not_registered') || message.includes('404')) {
        setSummary(emptyRiderCodSummary(riderId));
      } else {
        setErr(message);
        setSummary(emptyRiderCodSummary(riderId));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [riderId, auth, devPreview]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const pendingHolds = useMemo(
    () => summary?.open_holds?.filter((h) => h.status === 'held' || h.status === 'collected') || [],
    [summary],
  );
  const toDeposit = useMemo(
    () => pendingHolds.filter((h) => h.status === 'collected'),
    [pendingHolds],
  );
  const allHolds = summary?.open_holds || [];

  const outstanding = summary?.outstanding_micro ?? 0;
  const limit = summary?.limit_micro ?? 0;
  const available = summary?.available_cod_limit_micro ?? Math.max(0, limit - outstanding);
  const pendingDepositMicro =
    summary?.pending_deposit_micro ??
    toDeposit.reduce((s, h) => s + h.amount_micro, 0);
  const utilizationPct = limit > 0 ? Math.min(100, (outstanding / limit) * 100) : 0;
  const heldCount = pendingHolds.filter((h) => h.status === 'held').length;

  const handleRefresh = () => {
    setRefreshing(true);
    setLoading(true);
    void reload();
  };

  const depositJobs = async (method: CodDepositMethod, jobIds: string[]) => {
    setBusy(true);
    setErr('');
    setMsg('');
    const apiMethod =
      method === 'wallet' ? 'wallet' : method === 'counter' ? 'counter' : 'bank_transfer';
    try {
      for (const jobId of jobIds) {
        await submitRiderCodDeposit(
          {
            job_id: jobId,
            method: apiMethod,
            reference: `rider-${riderId}-${method}-${Date.now()}`,
          },
          auth,
        );
      }
      setMsg('บันทึกการฝากเงินแล้ว — รอระบบกระทบยอด');
      await reload();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'ฝากเงินไม่สำเร็จ');
      throw e;
    } finally {
      setBusy(false);
    }
  };

  if (loading && !summary) {
    return <CodDashboardSkeleton />;
  }

  if (!auth?.userId && !devPreview) {
    return (
      <div className="tt-rider-cod-empty">
        <span className="tt-rider-cod-empty-icon" aria-hidden>
          🔐
        </span>
        <p>เข้าสู่ระบบเพื่อดูยอด COD และฝากเงิน</p>
        <Link href="/m/login" className="tt-rider-cod-btn-primary tt-rider-cod-btn-primary--inline">
          เข้าสู่ระบบ
        </Link>
      </div>
    );
  }

  if (err && !summary) {
    return (
      <div className="tt-rider-cod-alert tt-rider-cod-alert--err">
        <p>{err}</p>
        <button type="button" className="tt-rider-cod-btn-secondary" onClick={handleRefresh}>
          ลองใหม่
        </button>
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="tt-rider-cod-dashboard">
      <header className="tt-rider-cod-top">
        <div>
          <h1>COD Dashboard</h1>
          <p className="tt-rider-cod-subtitle">จัดการเงินสดและวงเงิน COD</p>
        </div>
        <button
          type="button"
          className={`tt-rider-cod-refresh${refreshing ? ' spinning' : ''}`}
          aria-label="รีเฟรช"
          disabled={refreshing}
          onClick={handleRefresh}
        >
          ↻
        </button>
      </header>

      {!canOperate && (
        <p className="tt-rider-cod-alert tt-rider-cod-alert--warn">
          เปิดใช้งาน Rider OS และผ่าน KYC ก่อนจัดการ COD
        </p>
      )}

      {utilizationPct > 80 && (
        <p className="tt-rider-cod-alert tt-rider-cod-alert--warn">
          วงเงิน COD ใกล้เต็ม — กรุณาฝากเงินเพื่อเพิ่มวงเงินคงเหลือ
        </p>
      )}

      <section className="tt-rider-cod-hero tt-rider-cod-hero--v2" aria-label="ยอด COD ที่ถืออยู่">
        <div className="tt-rider-cod-hero-glow" aria-hidden />
        <p className="tt-rider-cod-kicker">💰 เงิน COD ที่ถืออยู่</p>
        <p className="tt-rider-cod-amount">฿ {formatCodThb(outstanding)}</p>
        <p className="tt-rider-cod-meta">จากวงเงิน ฿ {formatCodThb(limit)}</p>

        <div className="tt-rider-cod-util">
          <div className="tt-rider-cod-util-row">
            <span>วงเงินที่ใช้</span>
            <strong>{utilizationPct.toFixed(1)}%</strong>
          </div>
          <div className="tt-rider-cod-util-track">
            <div
              className={`tt-rider-cod-util-fill${utilizationPct > 80 ? ' tt-rider-cod-util-fill--warn' : ''}`}
              style={{ width: `${utilizationPct}%` }}
            />
          </div>
        </div>

        <div className="tt-rider-cod-hero-stats">
          <div>
            <span>วงเงินคงเหลือ</span>
            <strong>฿ {formatCodThb(available)}</strong>
          </div>
          <div>
            <span>รอฝากเงิน</span>
            <strong>฿ {formatCodThb(pendingDepositMicro)}</strong>
          </div>
        </div>

        {summary.provisional && (
          <p className="tt-rider-cod-provisional">เพดาน provisional — รอ business sign-off</p>
        )}
      </section>

      <div className="tt-rider-cod-actions tt-rider-cod-actions--v2">
        <Link href={riderOsPath('/jobs')} className="tt-rider-cod-action-card tt-rider-cod-action-card--tap">
          <span className="tt-rider-cod-action-icon">📦</span>
          <strong>เก็บเงิน</strong>
          <span className="tt-rider-cod-action-meta">
            {heldCount > 0 ? `${heldCount} รอเก็บ` : 'ไม่มีงานรอ'}
          </span>
        </Link>

        <button
          type="button"
          className="tt-rider-cod-action-card tt-rider-cod-action-card--tap tt-rider-cod-action-card--deposit"
          disabled={toDeposit.length === 0}
          onClick={() => setDepositOpen(true)}
        >
          <span className="tt-rider-cod-action-icon">💸</span>
          <strong>ฝากเงิน</strong>
          <span className="tt-rider-cod-action-meta">
            {toDeposit.length > 0 ? `฿ ${formatCodThb(pendingDepositMicro)}` : 'ไม่มีเงินรอฝาก'}
          </span>
        </button>
      </div>

      {toDeposit.length > 0 && (
        <p className="tt-rider-cod-deadline">
          ⚠️ ฝากเงินภายใน 24 ชม. หลังเก็บเงิน — ช้าเกินอาจถูก flag ใน reconciliation
        </p>
      )}

      <section className="tt-rider-cod-quick">
        <h2>เมนูลัด</h2>
        <nav className="tt-rider-cod-quick-nav">
          <Link href={riderOsPath('/wallet')}>
            <span>💳 กระเป๋าเครดิต</span>
            <span aria-hidden>→</span>
          </Link>
          <Link href={riderOsPath('/cod/history')}>
            <span>🕐 ประวัติ COD</span>
            <span aria-hidden>→</span>
          </Link>
          <Link href={riderOsPath('/jobs')}>
            <span>📋 งานที่รับ</span>
            <span aria-hidden>→</span>
          </Link>
          <Link href={riderOsPath('/settings')}>
            <span>⚙️ ตั้งค่า Rider</span>
            <span aria-hidden>→</span>
          </Link>
        </nav>
      </section>

      <section className="tt-rider-cod-section">
        <div className="tt-rider-cod-section-head">
          <h2>รายการ COD เปิดอยู่</h2>
          <Link href={riderOsPath('/cod/history')} className="tt-rider-cod-link">
            ดูทั้งหมด
          </Link>
        </div>
        <CodTransactionList holds={pendingHolds} emptyLabel="ไม่มี COD ค้าง — พร้อมรับงานปลายทาง" />
      </section>

      <section className="tt-rider-cod-section">
        <h2>รายการล่าสุด</h2>
        <CodTransactionList
          holds={allHolds as RiderCodHold[]}
          limit={5}
          emptyLabel="ยังไม่มีประวัติ COD"
        />
      </section>

      {err && <p className="tt-rider-err">{err}</p>}
      {msg && <p className="tt-rider-ok">{msg}</p>}

      <CodDepositModal
        open={depositOpen}
        pendingMicro={pendingDepositMicro}
        jobIds={toDeposit.map((h) => h.job_id)}
        busy={busy}
        walletBalanceMicro={walletMicro}
        onClose={() => setDepositOpen(false)}
        onConfirm={depositJobs}
      />
    </div>
  );
}
