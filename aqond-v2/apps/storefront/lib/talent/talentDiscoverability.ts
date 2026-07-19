import { TALENT_TODAY_LINKS } from '@/lib/talent/talentTodayLinks';
import type { TalentPermission } from '@/lib/talent/talentRoleTypes';

/** Primary workspace entry — SSOT for hub links */
export const TALENT_WORKSPACE_PATH = '/m/talent';
export const TALENT_WORKSPACE_LOGIN = '/m/login?next=/m/talent';

export type TalentDiscoverEntry = {
  id: string;
  href: string;
  label: string;
  description: string;
  icon: string;
};

/** Hub tiles pointing *to* Talent (Services, Account, Marketplace) */
export const TALENT_HUB_TILE = {
  href: TALENT_WORKSPACE_PATH,
  loginHref: TALENT_WORKSPACE_LOGIN,
  icon: '✨',
  title: 'Talent OS',
  description: 'ศูนย์รวมงานของคุณ — Today · Match · Money · AI',
  cta: 'เปิด Workspace',
} as const;

/** Reverse guide — from Talent back to platform hubs (guest / onboarding) */
export const TALENT_PLATFORM_ENTRIES: TalentDiscoverEntry[] = [
  {
    id: 'services',
    href: '/m/services',
    label: 'AQOND Services',
    description: 'Match · Board · Booking · Video',
    icon: '💼',
  },
  {
    id: 'marketplace',
    href: '/m/home',
    label: 'Marketplace',
    description: 'ช้อป · อาหาร · โปรโมชัน',
    icon: '🛒',
  },
  {
    id: 'account',
    href: '/m/account',
    label: 'บัญชีของฉัน',
    description: 'กระเป๋า · คำสั่งซื้อ · ตั้งค่า',
    icon: '👤',
  },
];

export type TalentSatelliteShortcut = {
  id: string;
  href: string;
  label: string;
  icon: string;
  permission: TalentPermission;
};

/** Satellite modules — not in bottom nav; reachable from Today */
export const TALENT_SATELLITE_SHORTCUTS: TalentSatelliteShortcut[] = [
  { id: 'search', href: TALENT_TODAY_LINKS.search, label: 'ค้นหา', icon: '🔍', permission: 'nav:today' },
  {
    id: 'notifications',
    href: TALENT_TODAY_LINKS.notifications,
    label: 'แจ้งเตือน',
    icon: '🔔',
    permission: 'today:notifications',
  },
  {
    id: 'timeline',
    href: TALENT_TODAY_LINKS.timeline,
    label: 'Timeline',
    icon: '🕐',
    permission: 'today:notifications',
  },
  { id: 'chat', href: TALENT_TODAY_LINKS.chat, label: 'แชท', icon: '💬', permission: 'today:notifications' },
];
