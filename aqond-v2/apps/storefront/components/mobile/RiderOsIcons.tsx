'use client';

import type { ReactNode } from 'react';

export type RiderOsIconName = 'home' | 'jobs' | 'map' | 'wallet' | 'cod' | 'profile' | 'package';

export type RiderOsIconProps = {
  name: RiderOsIconName;
  size?: number;
  className?: string;
};

function RiderOsSvg({
  size = 24,
  className,
  children,
}: {
  size?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ? `tt-rider-os-icon ${className}` : 'tt-rider-os-icon'}
      aria-hidden
    >
      {children}
    </svg>
  );
}

const ICONS: Record<RiderOsIconName, ReactNode> = {
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 10v10h14V10" />
    </>
  ),
  jobs: (
    <>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M12 11h4" />
      <path d="M12 16h4" />
      <path d="M8 11h.01" />
      <path d="M8 16h.01" />
    </>
  ),
  map: (
    <>
      <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z" />
      <path d="M9 3v15" />
      <path d="M15 6v15" />
    </>
  ),
  wallet: (
    <>
      <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
      <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
    </>
  ),
  cod: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2" />
      <path d="M6 10h.01" />
      <path d="M18 14h.01" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M20 21a8 8 0 0 0-16 0" />
    </>
  ),
  package: (
    <>
      <path d="M16.5 9.4 7.55 4.24" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.29 7 12 12 20.71 7" />
      <line x1="12" y1="22" x2="12" y2="12" />
    </>
  ),
};

export function RiderOsIcon({ name, size = 24, className }: RiderOsIconProps) {
  return (
    <RiderOsSvg size={size} className={className}>
      {ICONS[name]}
    </RiderOsSvg>
  );
}

export const RIDER_OS_NAV_ITEMS = [
  { hrefKey: '/home', label: 'หน้าหลัก', icon: 'home' as const },
  { hrefKey: '/jobs', label: 'รับงาน', icon: 'jobs' as const },
  { hrefKey: '/map', label: 'แผนที่', icon: 'map' as const },
  { hrefKey: '/wallet', label: 'กระเป๋า', icon: 'wallet' as const },
  { hrefKey: '/cod', label: 'COD', icon: 'cod' as const },
  { hrefKey: '/profile', label: 'ฉัน', icon: 'profile' as const },
];

export const RIDER_OS_QUICK_ACTIONS = [
  { hrefKey: '/jobs', label: 'รับงาน', icon: 'jobs' as const },
  { hrefKey: '/mine', label: 'งานของฉัน', icon: 'package' as const },
  { hrefKey: '/map', label: 'แผนที่', icon: 'map' as const },
  { hrefKey: '/wallet', label: 'กระเป๋า', icon: 'wallet' as const },
];
