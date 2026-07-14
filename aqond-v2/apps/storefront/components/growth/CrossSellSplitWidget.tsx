'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { readStoredAuth } from '@/lib/meerakAuth';
import { activateAqondPass, getAqondPassStatus, type AqondPassStatus } from '@/lib/growth';

type Props = {
  amountPaid?: string;
  onActivated?: () => void;
};

export function CrossSellSplitWidget({ amountPaid, onActivated }: Props) {
  const [status, setStatus] = useState<AqondPassStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const auth = readStoredAuth();
    if (!auth?.userId) return;
    getAqondPassStatus(auth.userId)
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  const auth = readStoredAuth();
  const userId = auth?.userId;

  const handleStart = async () => {
    if (!userId) return;
    setBusy(true);
    try {
      const s = await activateAqondPass(userId);
      setStatus(s);
      onActivated?.();
    } finally {
      setBusy(false);
    }
  };

  const primaryPct = status?.crossSell?.primaryPct ?? 70;
  const bonusPct = status?.crossSell?.bonusPct ?? 30;

  return (
    <section className="tt-cross-sell">
      <h3 className="tt-cross-sell-title">แบ่งยอดชำระของคุณ</h3>
      <div className="tt-cross-sell-split">
        <div className="tt-cross-sell-primary" style={{ flex: primaryPct }}>
          <span>ชำระแล้ว</span>
          <strong>{amountPaid || '✓'}</strong>
        </div>
        <div className="tt-cross-sell-bonus" style={{ flex: bonusPct }}>
          <span>สะสม Pass</span>
          <strong>+{bonusPct}%</strong>
        </div>
      </div>
      <p className="tt-cross-sell-msg">
        {status?.active
          ? `AQOND Pass เฟส ${status.phase}/6 — ${status.crossSell?.message || 'ช้อปต่อเพื่อปลดเฟสถัดไป'}`
          : 'เริ่ม AQOND Pass 6 เดือน — รับส่วนลดล็อกหมวดโปรดเดือนที่ 4'}
      </p>
      {status?.active ? (
        <Link href="/m/pass" className="tt-cross-sell-cta">
          ดู AQOND Pass
        </Link>
      ) : userId ? (
        <button type="button" className="tt-cross-sell-cta" disabled={busy} onClick={() => void handleStart()}>
          {busy ? 'กำลังเปิด…' : 'เริ่ม AQOND Pass ฟรี'}
        </button>
      ) : (
        <Link href="/m/login" className="tt-cross-sell-cta">
          เข้าสู่ระบบเพื่อเริ่ม Pass
        </Link>
      )}
    </section>
  );
}
