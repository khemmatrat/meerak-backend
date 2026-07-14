'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { bffGet } from '@/lib/bff';
import { useAuth } from '@/lib/auth';
import { formatMicro } from '@/lib/format';
import { WalletTrustBadge } from '@/components/growth/WalletTrustBadge';

export default function AccountWalletPage() {
  const { auth } = useAuth();
  const owner = auth?.userId || '';
  const [wallet, setWallet] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      setWallet(null);
      setLoading(false);
      return;
    }
    bffGet<any>(`/v1/wallet?user_id=${owner}`, auth)
      .then(setWallet)
      .catch(() => setWallet(null))
      .finally(() => setLoading(false));
  }, [auth, owner]);

  if (!auth) {
    return (
      <div className="tt-mp-wallet-page">
        <header className="tt-mp-orders-header">
          <Link href="/m/account" className="tt-mp-orders-back" aria-label="กลับ">
            ‹
          </Link>
          <h1>กระเป๋าของฉัน</h1>
        </header>
        <p className="tt-hint" style={{ padding: 24, textAlign: 'center' }}>
          <Link href="/m/login">เข้าสู่ระบบ</Link> เพื่อดูกระเป๋า
        </p>
      </div>
    );
  }

  const coins = wallet?.coins ?? 0;
  const coupons = Array.isArray(wallet?.coupons) ? wallet.coupons : [];
  const balance = wallet?.balance_micro ?? 0;

  return (
    <div className="tt-mp-wallet-page">
      <header className="tt-mp-orders-header">
        <Link href="/m/account" className="tt-mp-orders-back" aria-label="กลับ">
          ‹
        </Link>
        <h1>กระเป๋าของฉัน</h1>
      </header>

      {loading && <p className="tt-loading">กำลังโหลด…</p>}

      {!loading && (
        <>
          <WalletTrustBadge variant="full" className="tt-mp-wallet-trust" />
          <section className="tt-mp-wallet-detail" id="pay">
            <h2>AqondPay</h2>
            <p className="tt-mp-wallet-balance">{formatMicro(balance)}</p>
            <p className="tt-hint">ใช้ชำระคำสั่งซื้อและรับเงินคืน</p>
          </section>

          <section className="tt-mp-wallet-detail" id="coins">
            <h2>เหรียญ</h2>
            <p className="tt-mp-wallet-balance">{coins}</p>
            <p className="tt-hint">เช็คอินทุกวันเพื่อสะสมเหรียญแลกส่วนลด</p>
            <button type="button" className="tt-btn-secondary" style={{ marginTop: 12 }}>
              เช็คอินวันนี้
            </button>
          </section>

          <section className="tt-mp-wallet-detail" id="paylater">
            <h2>PayLater</h2>
            <p className="tt-hint">ผ่อนชำระภายหลัง — เปิดใช้งานเร็วๆ นี้</p>
          </section>

          <section className="tt-mp-wallet-detail" id="coupons">
            <h2>โค้ดส่วนลด</h2>
            {coupons.length === 0 ? (
              <p className="tt-hint">ยังไม่มีโค้ด — ช้อปโปรโมชันเพื่อรับส่วนลด</p>
            ) : (
              <ul className="tt-mp-coupon-list">
                {coupons.map((c: any, i: number) => (
                  <li key={c.code || i}>
                    <strong>{c.code || `COUPON-${i + 1}`}</strong>
                    {c.label && <span>{c.label}</span>}
                  </li>
                ))}
              </ul>
            )}
            <Link href="/m/home" className="tt-btn-primary" style={{ display: 'block', marginTop: 12, textAlign: 'center' }}>
              ไปช้อปโปรโมชัน
            </Link>
          </section>
        </>
      )}
    </div>
  );
}
