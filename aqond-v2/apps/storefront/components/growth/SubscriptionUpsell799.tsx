'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { readStoredAuth } from '@/lib/meerakAuth';
import {
  checkoutSubscription799,
  getUpsell799Status,
  type Upsell799Status,
} from '@/lib/growth';
import { WalletTrustBadge } from '@/components/growth/WalletTrustBadge';

type Variant = 'talent' | 'merchant' | 'auto';

type Props = {
  variant?: Variant;
  compact?: boolean;
  className?: string;
  onSubscribed?: () => void;
};

export function SubscriptionUpsell799({
  variant = 'auto',
  compact = false,
  className = '',
  onSubscribed,
}: Props) {
  const [userId, setUserId] = useState('');
  const [authChecked, setAuthChecked] = useState(false);
  const [status, setStatus] = useState<Upsell799Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const auth = readStoredAuth();
    setUserId(auth?.userId || '');
    setAuthChecked(true);
  }, []);

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const s = await getUpsell799Status(userId);
      setStatus(s);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!authChecked) return;
    void load();
  }, [authChecked, load]);

  const resolvedVariant: 'talent' | 'merchant' =
    variant === 'auto' ? (status?.variant === 'merchant' ? 'merchant' : 'talent') : variant;

  const plan =
    status?.plans?.find((p) =>
      resolvedVariant === 'merchant'
        ? p.id === 'merchant_marketing_799'
        : p.id === 'talent_pro_799',
    ) || status?.plan;

  const handleCheckout = async () => {
    if (!userId || !plan) return;
    setBusy(true);
    setError(null);
    try {
      const result = await checkoutSubscription799(userId, plan.id);
      if (result.success) {
        await load();
        onSubscribed?.();
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'ชำระไม่สำเร็จ';
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  if (!authChecked) {
    return compact ? null : <p className="tt-loading">กำลังโหลดแพ็ก Pro…</p>;
  }

  if (!userId) {
    return (
      <section className={`tt-pro799 ${compact ? 'compact' : ''} ${className}`.trim()}>
        <p className="tt-hint">
          <Link href="/m/login">เข้าสู่ระบบ</Link> เพื่อดูแพ็ก Pro 799 บาท
        </p>
      </section>
    );
  }

  if (loading) {
    return <p className="tt-loading">กำลังโหลดแพ็ก Pro…</p>;
  }

  if (status?.hasActive799) {
    return (
      <section className={`tt-pro799 active ${compact ? 'compact' : ''} ${className}`.trim()}>
        <div className="tt-pro799-badge">✓ Pro 799 เปิดใช้งานแล้ว</div>
        <p className="tt-pro799-exposure">{status.exposure?.message}</p>
        {resolvedVariant === 'talent' ? (
          <Link href="/m/home" className="tt-pro799-cta secondary">
            กลับหน้าหลัก
          </Link>
        ) : (
          <Link href="/m/sell" className="tt-pro799-cta secondary">
            จัดการร้าน
          </Link>
        )}
      </section>
    );
  }

  return (
    <section className={`tt-pro799 ${compact ? 'compact' : ''} ${className}`.trim()}>
      <div className="tt-pro799-hero">
        <p className="tt-pro799-kicker">
          {resolvedVariant === 'merchant' ? 'Merchant Growth' : 'Talent Growth'}
        </p>
        <h3>{plan?.nameTh || 'AQOND Pro 799'}</h3>
        <p className="tt-pro799-price">
          ฿799<span>/เดือน</span>
        </p>
      </div>

      {!compact ? <WalletTrustBadge variant="compact" className="tt-pro799-trust" /> : null}

      {status?.exposure ? (
        <div className="tt-pro799-analytics">
          <strong>📈 {status.exposure.label}</strong>
          <p>{status.exposure.message}</p>
          <div className="tt-pro799-metrics">
            <div>
              <span>Exposure/เดือน</span>
              <strong>{status.exposure.monthlyImpressions.toLocaleString('th-TH')}</strong>
            </div>
            <div>
              <span>มูลค่าโดยประมาณ</span>
              <strong>฿{status.exposure.revenuePotentialThb.toLocaleString('th-TH')}</strong>
            </div>
          </div>
        </div>
      ) : null}

      <ul className="tt-pro799-features">
        {(plan?.features || []).map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>

      <p className="tt-pro799-wallet">
        กระเป๋า: ฿{(status?.walletBalance ?? 0).toLocaleString('th-TH')}
        {!status?.canPayWithWallet ? ' — เติมเงินก่อนสมัคร' : ''}
      </p>

      <button
        type="button"
        className="tt-pro799-cta"
        disabled={busy || !status?.canPayWithWallet}
        onClick={() => void handleCheckout()}
      >
        {busy ? 'กำลังเปิดแพ็ก…' : 'สมัคร Pro 799 — หักจาก Wallet'}
      </button>

      {!status?.canPayWithWallet ? (
        <Link href="/m/wallet" className="tt-pro799-link">
          เติมเงินกระเป๋า
        </Link>
      ) : null}

      {error ? <p className="tt-pro799-error">{error}</p> : null}
    </section>
  );
}
