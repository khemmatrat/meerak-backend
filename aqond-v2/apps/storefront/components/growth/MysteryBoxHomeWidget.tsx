'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { readStoredAuth } from '@/lib/meerakAuth';
import {
  getGrowthStatus,
  mysteryBoxProgress,
  type GrowthStatus,
} from '@/lib/growth';

export function MysteryBoxHomeWidget() {
  const [status, setStatus] = useState<GrowthStatus | null>(null);

  useEffect(() => {
    const auth = readStoredAuth();
    if (!auth?.userId) return;
    getGrowthStatus(auth.userId)
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  const auth = readStoredAuth();
  if (!auth?.userId) {
    return (
      <Link href="/m/referral/mystery-box" className="tt-mystery-widget locked">
        <span className="tt-mystery-widget-emoji" aria-hidden>
          🎁
        </span>
        <div>
          <strong>Mystery Box</strong>
          <span>ชวนเพื่อน 10 คน เปิด Wallet — รับคูปองสุ่ม</span>
        </div>
        <span className="tt-mystery-widget-go">›</span>
      </Link>
    );
  }

  const p = status ? mysteryBoxProgress(status) : { qualified: 0, target: 10, unlocked: false };
  const claimed = !!status?.entitlements?.mysteryVoucherClaimed;

  return (
    <Link
      href="/m/referral/mystery-box"
      className={`tt-mystery-widget${p.unlocked ? ' unlocked' : ''}`}
    >
      <span className="tt-mystery-widget-emoji" aria-hidden>
        {p.unlocked ? '🎉' : '🎁'}
      </span>
      <div>
        <strong>{claimed ? 'รับโบนัสแล้ว' : p.unlocked ? 'เปิด Mystery Box ได้เลย' : 'Mystery Box'}</strong>
        <span>
          {claimed
            ? 'ดูคูปองใน Wallet'
            : `${p.qualified}/${p.target} เพื่อน — ชวนเพื่อนเปิด Wallet`}
        </span>
      </div>
      <span className="tt-mystery-widget-go">›</span>
    </Link>
  );
}
