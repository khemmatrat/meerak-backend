'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { getGuestLanguage, setGuestLanguage } from '@/lib/experience/guestStorage';
import { TtHomeSearchBar } from '@/components/mobile/TtHomeSearchBar';
import { IconLuxBellRed } from '@/components/mobile/TtLuxuryIcons';

type FtxHomeHeaderProps = {
  category?: string;
};

export function FtxHomeHeader({ category }: FtxHomeHeaderProps) {
  const { auth } = useAuth();
  const [lang, setLang] = useState<'th' | 'en'>('th');
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    setLang(getGuestLanguage());
    setAuthReady(true);
  }, []);

  const toggleLang = () => {
    const next = lang === 'th' ? 'en' : 'th';
    setGuestLanguage(next);
    setLang(next);
  };

  const notifHref = auth ? '/m/account/notifications' : '/m/login?next=/m/account/notifications';

  return (
    <header className="ftx-header tt-header">
      <div className="ftx-header-top">
        <Link href="/m/home" className="ftx-logo" aria-label="AQOND Home">
          <Image
            src="/logo.png"
            alt=""
            className="ftx-logo-img"
            width={40}
            height={40}
            priority
            unoptimized
          />
          <span className="ftx-logo-text">AQOND</span>
        </Link>

        <div className="ftx-header-actions">
          <Link href={notifHref} className="ftx-header-icon ftx-header-icon--notif" title="การแจ้งเตือน" aria-label="การแจ้งเตือน">
            <IconLuxBellRed size={22} />
          </Link>
          <button
            type="button"
            className="ftx-header-icon ftx-lang-btn"
            onClick={toggleLang}
            title={lang === 'th' ? 'Switch to English' : 'เปลี่ยนเป็นภาษาไทย'}
            aria-label="เปลี่ยนภาษา"
          >
            {lang === 'th' ? 'TH' : 'EN'}
          </button>
          {authReady && auth ? (
            <Link href="/m/account" className="ftx-header-link ftx-header-link-accent" title="บัญชีของฉัน">
              บัญชี
            </Link>
          ) : authReady ? (
            <>
              <Link href="/m/login?next=/m/home" className="ftx-header-link">
                เข้าสู่ระบบ
              </Link>
              <Link href="/m/register?next=/m/home" className="ftx-header-link ftx-header-link-accent">
                สมัคร
              </Link>
            </>
          ) : null}
        </div>
      </div>

      <div className="ftx-header-search" data-ftx-tour="search">
        <TtHomeSearchBar category={category} />
      </div>
    </header>
  );
}
