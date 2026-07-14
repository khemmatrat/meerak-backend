'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { readStoredAuth } from '@/lib/meerakAuth';
import { activateAqondPass, getAqondPassStatus, type AqondPassStatus } from '@/lib/growth';

export function AqondPassCard({ className = '' }: { className?: string }) {
  const [status, setStatus] = useState<AqondPassStatus | null>(null);

  useEffect(() => {
    const auth = readStoredAuth();
    if (!auth?.userId) return;
    getAqondPassStatus(auth.userId)
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  if (!status?.found) return null;

  if (!status.active) {
    return (
      <Link href="/m/pass" className={`tt-pass-card inactive ${className}`.trim()}>
        <span className="tt-pass-card-icon" aria-hidden>
          🎫
        </span>
        <div>
          <strong>AQOND Pass 6 เดือน</strong>
          <span>สะสมสิทธิ์ทุกครั้งที่ช้อป — เริ่มได้เลย</span>
        </div>
        <span className="tt-pass-card-go">›</span>
      </Link>
    );
  }

  return (
    <Link href="/m/pass" className={`tt-pass-card active ${className}`.trim()}>
      <span className="tt-pass-card-icon" aria-hidden>
        ✨
      </span>
      <div>
        <strong>AQOND Pass · เฟส {status.phase}/6</strong>
        <span>
          {status.phase && status.phase <= 3
            ? status.hermesBrief?.headline_th || 'โบนัสรายเดือนรอคุณอยู่'
            : status.subsidyCard
              ? `ส่วนลด ${status.subsidyCard.labelTh} ${status.subsidyCard.discountPct}%`
              : `เหลือ ${status.daysRemaining} วัน`}
        </span>
      </div>
      <span className="tt-pass-card-go">›</span>
    </Link>
  );
}
