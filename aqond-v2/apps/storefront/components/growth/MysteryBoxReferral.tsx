'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { readStoredAuth } from '@/lib/meerakAuth';
import {
  GROWTH_CAMPAIGNS,
  buildReferralShareUrl,
  claimMysteryBoxVoucher,
  getGrowthStatus,
  syncReferralMilestones,
  type GrowthStatus,
} from '@/lib/growth';
import { ReferralMilestoneTracker } from '@/components/growth/ReferralMilestoneTracker';
import { WalletTrustBadge } from '@/components/growth/WalletTrustBadge';

export function MysteryBoxReferral() {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [status, setStatus] = useState<GrowthStatus | null>(null);
  const [copied, setCopied] = useState(false);
  const [burst, setBurst] = useState(false);
  const [voucherLabel, setVoucherLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const auth = readStoredAuth();
  const userId = auth?.userId || '';

  const load = useCallback(async () => {
    if (!userId) {
      setStatus(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const s = await getGrowthStatus(userId);
      setStatus(s);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const milestone = status?.milestones?.[GROWTH_CAMPAIGNS.MYSTERY_BOX];
  const qualified = milestone?.qualified ?? 0;
  const unlocked = !!milestone?.unlocked;
  const claimed = !!status?.entitlements?.mysteryVoucherClaimed;
  const shareUrl = status?.referralCode
    ? buildReferralShareUrl(status.referralCode)
    : '';

  const handleSync = async () => {
    if (!userId) return;
    setSyncing(true);
    setError(null);
    try {
      const s = await syncReferralMilestones(userId);
      setStatus(s);
    } catch {
      setError('อัปเดตความคืบหน้าไม่สำเร็จ');
    } finally {
      setSyncing(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('คัดลอกไม่สำเร็จ');
    }
  };

  const handleClaim = async () => {
    if (!userId || !unlocked || claimed) return;
    setClaiming(true);
    setError(null);
    try {
      const r = await claimMysteryBoxVoucher(userId);
      if (r.voucher?.label) setVoucherLabel(r.voucher.label);
      setBurst(true);
      setTimeout(() => setBurst(false), 2400);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'รับโบนัสไม่สำเร็จ');
    } finally {
      setClaiming(false);
    }
  };

  if (!userId) {
    return (
      <div className="tt-mystery-page">
        <header className="tt-mp-orders-header">
          <Link href="/m/home" className="tt-mp-orders-back" aria-label="กลับ">
            ‹
          </Link>
          <h1>Mystery Box</h1>
        </header>
        <p className="tt-hint" style={{ padding: 24, textAlign: 'center' }}>
          <Link href="/m/login">เข้าสู่ระบบ</Link> เพื่อชวนเพื่อนและเปิดกล่องสุ่ม
        </p>
        <WalletTrustBadge variant="full" className="tt-mystery-trust" />
      </div>
    );
  }

  return (
    <div className="tt-mystery-page">
      {burst ? <div className="tt-mystery-burst" aria-hidden /> : null}

      <header className="tt-mp-orders-header">
        <Link href="/m/home" className="tt-mp-orders-back" aria-label="กลับ">
          ‹
        </Link>
        <h1>Mystery Box 🎁</h1>
      </header>

      <div className="tt-mystery-hero">
        <p className="tt-mystery-kicker">Consumer Viral</p>
        <h2>ชวนเพื่อน 10 คน เปิด Wallet</h2>
        <p>ปลดล็อกกล่องสุ่ม — รับคูปองส่วนลดใน Wallet ทันที</p>
      </div>

      <WalletTrustBadge className="tt-mystery-trust" />

      {loading ? (
        <p className="tt-loading">กำลังโหลด…</p>
      ) : (
        <>
          <ReferralMilestoneTracker
            qualified={qualified}
            unlocked={unlocked}
            title="ปลด Mystery Box (10/10)"
            subtitle="เพื่อนต้องสมัครและเปิด Wallet ใน AQOND"
            socialProof="ร้านค้าและผู้ซื้อ 5,000+ ร่วมแคมเปญนี้"
            unlockedMessage="ปลดล็อกแล้ว — กดรับคูปองด้านล่าง"
          />

          {shareUrl ? (
            <div className="tt-mystery-share">
              <input readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
              <button type="button" onClick={() => void handleCopy()}>
                {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
              </button>
            </div>
          ) : null}

          <button
            type="button"
            className="tt-btn-secondary tt-mystery-sync"
            disabled={syncing}
            onClick={() => void handleSync()}
          >
            {syncing ? 'กำลังอัปเดต…' : 'รีเฟรชความคืบหน้า'}
          </button>

          {unlocked && !claimed ? (
            <button
              type="button"
              className="tt-mystery-claim"
              disabled={claiming}
              onClick={() => void handleClaim()}
            >
              {claiming ? 'กำลังเปิดกล่อง…' : '🎁 เปิด Mystery Box'}
            </button>
          ) : null}

          {claimed ? (
            <div className="tt-mystery-done">
              <p>✓ รับโบนัสแล้ว</p>
              {voucherLabel ? <p>{voucherLabel}</p> : <p>คูปองอยู่ใน Wallet ของคุณ</p>}
              <Link href="/m/account/wallet">ไปที่ Wallet</Link>
            </div>
          ) : null}

          {error ? <p className="tt-mystery-error">{error}</p> : null}
        </>
      )}
    </div>
  );
}
