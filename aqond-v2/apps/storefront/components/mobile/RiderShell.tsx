'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { StatusChip } from '@aqond/ui';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { listenFcmForeground, syncFcmIfPermitted } from '@/lib/fcmWeb';
import {
  fetchRiderProfile,
  loadRiderId,
  riderKycLabel,
  saveRiderId,
  type RiderProfile,
} from '@/lib/rider';

type RiderCtx = {
  riderId: string;
  riderName: string;
  profile: RiderProfile | null;
  profileLoading: boolean;
  kycLabel: string;
  canOperate: boolean;
  refreshProfile: () => Promise<void>;
};

const RiderContext = createContext<RiderCtx | null>(null);

export function useRider() {
  const ctx = useContext(RiderContext);
  if (!ctx) throw new Error('useRider outside RiderShell');
  return ctx;
}

const RIDER_NAV = [
  { href: '/m/rider/home', label: 'หน้าหลัก', icon: '🏠' },
  { href: '/m/rider/jobs', label: 'รับงาน', icon: '📋' },
  { href: '/m/rider/map', label: 'แผนที่', icon: '🗺️' },
  { href: '/m/rider/wallet', label: 'กระเป๋า', icon: '💰' },
  { href: '/m/rider/profile', label: 'ฉัน', icon: '👤' },
];

export function RiderShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { auth } = useAuth();
  const [profile, setProfile] = useState<RiderProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(!!auth?.userId);
  const [riderId, setRiderId] = useState(loadRiderId);
  const [fcmOk, setFcmOk] = useState(false);

  const refreshProfile = async () => {
    if (!auth?.userId) {
      setProfile(null);
      setRiderId('');
      saveRiderId('');
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    try {
      const hit = await fetchRiderProfile(auth.userId);
      setProfile(hit);
      const id = hit?.rider_id || '';
      setRiderId(id);
      saveRiderId(id);
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    void refreshProfile();
  }, [auth?.userId]);

  useEffect(() => {
    if (!auth?.userId) return;
    void syncFcmIfPermitted(auth).then((tok) => setFcmOk(!!tok));
    let unsub: (() => void) | null | undefined;
    void listenFcmForeground(({ title, body }) => {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(title, { body });
      }
    }).then((fn) => {
      unsub = fn;
    });
    return () => {
      unsub?.();
    };
  }, [auth]);

  const riderName = profile?.display_name || 'ผู้ให้บริการ';
  const kycLabel = riderKycLabel(profile?.kyc_status, profile?.active);
  const canOperate =
    !!profile?.rider_id &&
    profile.active === true &&
    String(profile.kyc_status || '').toLowerCase() === 'approved' &&
    profile.suspended !== true;

  const hideNav =
    pathname.includes('/active/') ||
    pathname.includes('/signup') ||
    pathname.includes('/settings');
  const onSignup = pathname.includes('/signup');
  const isHome = pathname === '/m/rider/home' || pathname === '/m/rider';

  return (
    <RiderContext.Provider
      value={{ riderId, riderName, profile, profileLoading, kycLabel, canOperate, refreshProfile }}
    >
      <div className="tt-rider-premium">
        <header className="tt-rider-premium-header">
          <Link href="/m/account" className="tt-rider-premium-back" aria-label="กลับ">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 19l-7-7 7-7" /></svg>
          </Link>
          <div className="tt-rider-premium-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="tt-rider-premium-icon"><path d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
            <h1>AQOND Rider OS</h1>
          </div>
          <Link href="/m/rider/settings" className="tt-rider-premium-gear" aria-label="ตั้งค่า">⚙️</Link>
        </header>

        <div className="tt-rider-premium-body">
          {!auth?.userId && (
            <Link href="/m/login?next=/m/rider/home" className="tt-rider-fcm-banner">
              <span>🔔</span>
              <div>
                <strong>เข้าสู่ระบบก่อนรับงาน</strong>
                <p>1 บัญชี AQOND = 1 ผู้ให้บริการ</p>
              </div>
            </Link>
          )}
          {auth?.userId && fcmOk && isHome && (
            <StatusChip tone="success" className="tt-rider-fcm-ok-chip">
              Push พร้อมรับงานใหม่
            </StatusChip>
          )}

          {auth?.userId && !profileLoading && !profile && !onSignup && (
            <Link href="/m/rider/signup" className="tt-rider-kyc-btn" style={{ marginBottom: 12 }}>
              เปิดใช้งานผู้ให้บริการ — ยืนยันตัวตน
            </Link>
          )}

          {auth?.userId && profile && !canOperate && !onSignup && !hideNav && (
            <p className="tt-hint" style={{ marginBottom: 12 }}>
              รับงานได้เมื่อแอดมินอนุมัติ KYC แล้ว
            </p>
          )}

          {children}
        </div>

        {!hideNav && (
          <nav className="tt-rider-os-nav" aria-label="เมนู Rider OS">
            {RIDER_NAV.map((t) => {
              const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
              return (
                <Link key={t.href} href={t.href} className={active ? 'active' : ''}>
                  <span className="tt-rider-os-nav-icon">{t.icon}</span>
                  <span>{t.label}</span>
                </Link>
              );
            })}
          </nav>
        )}
      </div>
    </RiderContext.Provider>
  );
}
