'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
import { riderOsPath, riderOsTabActive } from '@/lib/riderOsPaths';
import {
  disableRiderDevPreview,
  enableRiderDevPreview,
  getDevPreviewProfile,
  isRiderDevBuild,
  isRiderDevPreview,
} from '@/lib/riderDevPreview';
import { RIDER_OS_NAV_ITEMS, RiderOsIcon } from '@/components/mobile/RiderOsIcons';

type RiderCtx = {
  riderId: string;
  riderName: string;
  profile: RiderProfile | null;
  profileLoading: boolean;
  kycLabel: string;
  canOperate: boolean;
  devPreview: boolean;
  refreshProfile: () => Promise<void>;
};

const RiderContext = createContext<RiderCtx | null>(null);

export function useRider() {
  const ctx = useContext(RiderContext);
  if (!ctx) throw new Error('useRider outside RiderShell');
  return ctx;
}

export function RiderShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { auth } = useAuth();
  const [profile, setProfile] = useState<RiderProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(!!auth?.userId);
  const [riderId, setRiderId] = useState(loadRiderId);
  const [fcmOk, setFcmOk] = useState(false);
  const [devPreview, setDevPreview] = useState(false);

  useEffect(() => {
    const sync = () => setDevPreview(isRiderDevPreview());
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const forceMock = new URLSearchParams(window.location.search).get('mock') === '1';
    const onLiveTab =
      pathname.includes('/jobs') ||
      pathname.includes('/home') ||
      pathname.includes('/map') ||
      pathname.includes('/mine') ||
      pathname.includes('/wallet') ||
      pathname.includes('/active/');
    if (onLiveTab && !forceMock) {
      disableRiderDevPreview();
      setDevPreview(false);
    }
  }, [pathname]);

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
      const hit = await fetchRiderProfile(auth.userId, auth.token);
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

  const effectiveDevPreview = devPreview && !profile?.rider_id;
  const baseProfile = effectiveDevPreview ? getDevPreviewProfile() : profile;
  const riderName = baseProfile?.display_name || 'ผู้ให้บริการ';
  const kycLabel = effectiveDevPreview
    ? 'Dev Preview — จำลอง'
    : riderKycLabel(profile?.kyc_status, profile?.active);
  const canOperate =
    effectiveDevPreview ||
    (!!profile?.rider_id &&
      profile.active === true &&
      String(profile.kyc_status || '').toLowerCase() === 'approved' &&
      profile.suspended !== true);
  const effectiveRiderId = effectiveDevPreview
    ? getDevPreviewProfile().rider_id
    : riderId;

  const hideNav =
    pathname.includes('/active/') ||
    pathname.includes('/signup') ||
    pathname.includes('/settings');
  const onSignup = pathname.includes('/signup');
  const isHome =
    pathname === riderOsPath('/home') ||
    pathname === riderOsPath() ||
    pathname === '/m/rider/home' ||
    pathname === '/m/rider';

  return (
    <RiderContext.Provider
      value={{
        riderId: effectiveRiderId,
        riderName,
        profile: baseProfile,
        profileLoading,
        kycLabel,
        canOperate,
        devPreview: effectiveDevPreview,
        refreshProfile,
      }}
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
          <Link href={riderOsPath('/settings')} className="tt-rider-premium-gear" aria-label="ตั้งค่า">⚙️</Link>
        </header>

        <div className="tt-rider-premium-body">
          {!auth?.userId && (
            <Link href={`/m/login?next=${encodeURIComponent(riderOsPath('/home'))}`} className="tt-rider-fcm-banner">
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

          {effectiveDevPreview && (
            <div className="tt-rider-dev-banner">
              <span>🔧 Dev Preview — ข้อมูลจำลอง ไม่บันทึก backend</span>
              <button
                type="button"
                className="tt-rider-dev-exit"
                onClick={() => {
                  disableRiderDevPreview();
                  setDevPreview(false);
                  router.push(riderOsPath('/signup'));
                }}
              >
                ออก
              </button>
            </div>
          )}

          {auth?.userId && !profileLoading && !profile && !onSignup && !devPreview && (
            <>
            <Link href={riderOsPath('/signup')} className="tt-rider-kyc-btn" style={{ marginBottom: 12 }}>
              เปิดใช้งานผู้ให้บริการ — ยืนยันตัวตน
            </Link>
            {isRiderDevBuild() && (
              <Link
                href={riderOsPath('/home?devPreview=1')}
                className="tt-rider-kyc-btn"
                style={{ marginBottom: 12, background: '#fffbeb', borderColor: '#fcd34d', color: '#92400e' }}
                onClick={() => enableRiderDevPreview()}
              >
                🔧 Dev: ข้ามสมัคร — เข้า Rider OS (จำลอง)
              </Link>
            )}
            </>
          )}

          {auth?.userId && profile && !canOperate && !onSignup && !hideNav && !devPreview && (
            <p className="tt-hint" style={{ marginBottom: 12 }}>
              รับงานได้เมื่อแอดมินอนุมัติ KYC แล้ว
            </p>
          )}

          {children}
        </div>

        {!hideNav && (
          <nav className="tt-rider-os-nav" aria-label="เมนู Rider OS">
            {RIDER_OS_NAV_ITEMS.map((t) => {
              const href = riderOsPath(t.hrefKey);
              const active = riderOsTabActive(pathname, href);
              return (
                <Link key={href} href={href} className={active ? 'active' : ''}>
                  <span className="tt-rider-os-nav-icon">
                    <RiderOsIcon name={t.icon} size={22} />
                  </span>
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
