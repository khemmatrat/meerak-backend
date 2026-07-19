'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { TALENT_HUB_TILE } from '@/lib/talent/talentDiscoverability';

const SERVICES_NAV = [
  { href: '/m/services', label: 'ศูนย์รวม', icon: '✨', exact: true },
  { href: '/m/services/match', label: 'Match', icon: '⚡' },
  { href: '/m/services/board', label: 'Board', icon: '💼' },
  { href: '/m/services/booking', label: 'จอง', icon: '📅' },
  { href: '/m/services/video', label: 'วิดีโอ', icon: '🎬' },
] as const;

function isNavActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ServicesShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { auth } = useAuth();

  return (
    <div className="tt-services-shell">
      <header className="tt-services-header">
        <Link href="/m/account" className="tt-services-back" aria-label="กลับ">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="tt-services-title">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="tt-services-title-icon"
            aria-hidden
          >
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          <h1>AQOND Services</h1>
        </div>
        <Link href="/m/account" className="tt-services-gear" aria-label="บัญชี">
          👤
        </Link>
        <Link href={TALENT_HUB_TILE.href} className="tt-services-gear" aria-label={TALENT_HUB_TILE.title}>
          {TALENT_HUB_TILE.icon}
        </Link>
      </header>

      <div className="tt-services-body">
        {!auth?.userId && (
          <Link href="/m/login?next=/m/services" className="tt-services-login-banner">
            <span>🔔</span>
            <div>
              <strong>เข้าสู่ระบบเพื่อจ้างงาน / รับงาน</strong>
              <p className="tt-hint" style={{ margin: '4px 0 0' }}>
                1 บัญชี AQOND — MatchJob · Job Board · Booking · Video
              </p>
            </div>
          </Link>
        )}
        {children}
      </div>

      <nav className="tt-services-os-nav" aria-label="เมนู Services OS">
        {SERVICES_NAV.map((t) => {
          const active = isNavActive(pathname, t.href, 'exact' in t ? t.exact : false);
          return (
            <Link key={t.href} href={t.href} className={active ? 'active' : ''}>
              <span className="tt-services-os-nav-icon">{t.icon}</span>
              <span>{t.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
