'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@aqond/ui';
import { formatCatalogPrice } from '@/lib/format';
import { fetchRiderDashboard } from '@/lib/rider';
import { fetchRiderEarnings, requestRiderWithdraw } from '@/lib/orders';
import { useRider } from '@/components/mobile/RiderShell';

export default function RiderWalletPage() {
  const { riderId, canOperate, profile } = useRider();
  const [dash, setDash] = useState<Awaited<ReturnType<typeof fetchRiderDashboard>>>(null);
  const [earnings, setEarnings] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const reload = useCallback(() => {
    if (!riderId) return;
    void fetchRiderDashboard(riderId).then(setDash);
    void fetchRiderEarnings(riderId).then(setEarnings).catch(() => setEarnings(null));
  }, [riderId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const withdraw = async () => {
    setErr('');
    setMsg('');
    try {
      const r = await requestRiderWithdraw(riderId);
      setMsg(`ขอถอน ${formatCatalogPrice(r.amount_micro || 0)} — รอแอดมินอนุมัติ`);
      reload();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'ถอนไม่สำเร็จ');
    }
  };

  const total = earnings?.earnings_micro ?? dash?.wallet.earnings_micro ?? 0;
  const withdrawable = earnings?.withdrawable_micro ?? dash?.wallet.withdrawable_micro ?? 0;
  const bonus = dash?.wallet.bonus_micro ?? 0;

  return (
    <div className="tt-rider-wallet-page">
      <section className="tt-rider-earnings-card">
        <p className="tt-rider-earnings-label">ยอดสะสมทั้งหมด</p>
        <p className="tt-rider-earnings-amount">{formatCatalogPrice(total)}</p>
        <p className="tt-hint">ถอนได้ {formatCatalogPrice(withdrawable)}</p>
        <Button
          type="button"
          variant="primary"
          className="tt-rider-accept-btn"
          disabled={!withdrawable || earnings?.kyc_status === 'pending' || !canOperate}
          onClick={() => void withdraw()}
        >
          ขอถอนเงิน
        </Button>
      </section>

      <div className="tt-rider-stat-grid">
        <div className="tt-rider-stat-card">
          <span>รายได้วันนี้</span>
          <strong>{formatCatalogPrice(dash?.today.earnings_micro || 0)}</strong>
        </div>
        <div className="tt-rider-stat-card">
          <span>โบนัส</span>
          <strong>{formatCatalogPrice(bonus)}</strong>
        </div>
        <div className="tt-rider-stat-card">
          <span>เที่ยววันนี้</span>
          <strong>{dash?.today.trips ?? 0}</strong>
        </div>
        <div className="tt-rider-stat-card">
          <span>อัตรารับงาน</span>
          <strong>{dash?.today.acceptance_rate ?? 0}%</strong>
        </div>
      </div>

      <section className="tt-rider-wallet-note">
        <h3>AQOND Pay — Rider Wallet</h3>
        <p className="tt-hint">
          รายได้จากการส่งจะเข้ากระเป๋าไรเดอร์ หักค่าธรรมเนียมตามนโยบาย platform
          Settlement และ Escrow เชื่อมผ่าน wallet-svc / dispatch-svc
        </p>
        {profile?.kyc_status !== 'approved' && (
          <p className="tt-hint">ยืนยันตัวตนก่อนถอนเงิน — <Link href="/m/rider/signup">ไปยืนยัน</Link></p>
        )}
      </section>

      {msg && <p className="tt-merchant-ok">{msg}</p>}
      {err && <p className="tt-error-inline">{err}</p>}
    </div>
  );
}
