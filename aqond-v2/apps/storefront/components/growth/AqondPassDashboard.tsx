'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { readStoredAuth } from '@/lib/meerakAuth';
import {
  activateAqondPass,
  getAqondPassStatus,
  type AqondPassStatus,
} from '@/lib/growth';
import { WalletTrustBadge } from '@/components/growth/WalletTrustBadge';
import { SubscriptionUpsell799 } from '@/components/growth/SubscriptionUpsell799';

export function AqondPassDashboard() {
  const [userId, setUserId] = useState('');
  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [status, setStatus] = useState<AqondPassStatus | null>(null);
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
      const s = await getAqondPassStatus(userId);
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

  const handleActivate = async () => {
    if (!userId) return;
    setActivating(true);
    setError(null);
    try {
      const s = await activateAqondPass(userId);
      setStatus(s);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'เปิด Pass ไม่สำเร็จ');
    } finally {
      setActivating(false);
    }
  };

  if (!authChecked) {
    return (
      <div className="tt-pass-page">
        <header className="tt-mp-orders-header">
          <Link href="/m/home" className="tt-mp-orders-back" aria-label="กลับ">
            ‹
          </Link>
          <h1>AQOND Pass</h1>
        </header>
        <p className="tt-loading">กำลังโหลด…</p>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="tt-pass-page">
        <header className="tt-mp-orders-header">
          <Link href="/m/home" className="tt-mp-orders-back" aria-label="กลับ">
            ‹
          </Link>
          <h1>AQOND Pass</h1>
        </header>
        <p className="tt-hint" style={{ padding: 24, textAlign: 'center' }}>
          <Link href="/m/login">เข้าสู่ระบบ</Link> เพื่อดู AQOND Pass
        </p>
      </div>
    );
  }

  return (
    <div className="tt-pass-page">
      <header className="tt-mp-orders-header">
        <Link href="/m/home" className="tt-mp-orders-back" aria-label="กลับ">
          ‹
        </Link>
        <h1>AQOND Pass</h1>
      </header>

      <div className="tt-pass-hero">
        <p className="tt-pass-kicker">6 เดือน · 6 เฟส</p>
        <h2>สะสมความภักดี ปลดล็อกส่วนลด</h2>
        <p>เดือน 1–3 รับไอเดียช้อปจาก Hermes · เดือน 4–6 ล็อกส่วนลดหมวดโปรด</p>
      </div>

      <WalletTrustBadge variant="full" className="tt-pass-trust" />

      {loading ? (
        <p className="tt-loading">กำลังโหลด…</p>
      ) : !status?.active ? (
        <div className="tt-pass-inactive">
          <p>ยังไม่ได้เริ่ม AQOND Pass</p>
          {status?.canActivate ? (
            <button
              type="button"
              className="tt-pass-activate"
              disabled={activating}
              onClick={() => void handleActivate()}
            >
              {activating ? 'กำลังเปิด…' : 'เริ่ม AQOND Pass ฟรี'}
            </button>
          ) : (
            <p className="tt-hint">เปิด Wallet ก่อน แล้วกลับมาเริ่ม Pass</p>
          )}
          {error ? <p className="tt-pass-error">{error}</p> : null}
        </div>
      ) : (
        <>
          <div className="tt-pass-phase-badge">
            <span>เฟส {status.phase}/6</span>
            <span>{status.daysRemaining} วันคงเหลือ</span>
          </div>

          <div className="tt-pass-timeline">
            {status.timeline?.map((t) => (
              <div key={t.month} className={`tt-pass-timeline-item ${t.status}`}>
                <div className="tt-pass-timeline-dot" />
                <div>
                  <strong>{t.label}</strong>
                  <span>
                    {t.status === 'done'
                      ? 'เสร็จแล้ว'
                      : t.status === 'current'
                        ? 'กำลังอยู่'
                        : 'รอปลดล็อก'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {status.phase && status.phase <= 3 && status.hermesBrief ? (
            <section className="tt-pass-hermes">
              <h3>โปรโมชันเดือนนี้ (Hermes)</h3>
              <p className="tt-pass-hermes-title">{status.hermesBrief.headline_th}</p>
              <p className="tt-pass-hermes-hook">{status.hermesBrief.hook_th}</p>
              <Link href={status.hermesBrief.cta_href || '/m/home'} className="tt-pass-hermes-cta">
                ช้อปต่อเลย
              </Link>
            </section>
          ) : null}

          {status.phase && status.phase >= 4 && status.subsidyCard ? (
            <section className="tt-pass-subsidy">
              <h3>🎴 Loyalty Pass Card</h3>
              <div className="tt-pass-subsidy-card">
                <p className="tt-pass-subsidy-pct">{status.subsidyCard.discountPct}% OFF</p>
                <p className="tt-pass-subsidy-cat">{status.subsidyCard.labelTh}</p>
                <p className="tt-pass-subsidy-lock">ล็อกหมวดโปรดจนครบ 6 เดือน</p>
                <Link href={status.subsidyCard.href}>ใช้สิทธิ์ช้อป</Link>
              </div>
            </section>
          ) : null}

          {status.phase && status.phase >= 6 ? (
            <SubscriptionUpsell799 variant="auto" compact />
          ) : null}
        </>
      )}
    </div>
  );
}
