'use client';

import { useState } from 'react';
import { collectCoupon } from '@/lib/kong';
import { useAuth } from '@/lib/auth';

type Promo = {
  id?: string;
  slug?: string;
  title?: string;
  kind?: string;
  value_bps?: number;
};

function promoCode(p: Promo): string {
  if (p.slug?.toUpperCase().includes('WELCOME')) return 'WELCOME10';
  if (p.slug) return p.slug.toUpperCase().replace(/-/g, '');
  return 'WELCOME10';
}

export function TtPromoBar({ promo }: { promo: Promo }) {
  const { auth } = useAuth();
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'err'>('idle');
  const [msg, setMsg] = useState('');

  const onCollect = async () => {
    const userId = auth?.userId || `guest-${typeof window !== 'undefined' ? localStorage.getItem('tt-guest-id') || Date.now() : Date.now()}`;
    if (!auth && typeof window !== 'undefined') {
      localStorage.setItem('tt-guest-id', userId.replace('guest-', ''));
    }
    setStatus('loading');
    setMsg('');
    try {
      await collectCoupon(userId, promoCode(promo));
      setStatus('done');
      setMsg('เก็บแล้ว ✓');
    } catch (e: any) {
      setStatus('err');
      const t = String(e.message || e);
      setMsg(t.includes('already') || t.includes('duplicate') ? 'เก็บแล้ว' : 'เก็บไม่สำเร็จ');
    }
  };

  return (
    <div className="tt-promo">
      <span>🎁 {promo.title || 'ดีลพิเศษ'} — ส่วนลดสำหรับลูกค้าใหม่</span>
      <button
        type="button"
        className="tt-promo-btn"
        onClick={onCollect}
        disabled={status === 'loading' || status === 'done'}
      >
        {status === 'loading' ? '...' : status === 'done' ? '✓' : msg && status === 'err' ? msg : 'เก็บ'}
      </button>
    </div>
  );
}
