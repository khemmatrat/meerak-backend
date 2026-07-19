import { TALENT_NAV, type TalentNavItem } from '@/lib/talent/talentNavConfig';
import type { TalentPermission, TalentRoleId } from '@/lib/talent/talentRoleTypes';

const ALL_NAV: TalentPermission[] = [
  'nav:today',
  'nav:work',
  'nav:money',
  'nav:grow',
  'nav:trust',
  'nav:calendar',
  'nav:profile',
];

const ALL_TODAY: TalentPermission[] = [
  'today:notifications',
  'today:bookings-incoming',
  'today:bookings-upcoming',
  'today:match',
  'today:board',
  'today:wallet',
  'today:reviews',
  'today:summary-hire',
  'today:summary-work',
];

const ROLE_PERMISSIONS: Record<TalentRoleId, TalentPermission[]> = {
  guest: [
    'nav:today',
    'nav:work',
    'nav:grow',
    'nav:profile',
    'today:summary-work',
  ],
  verified: [...ALL_NAV, ...ALL_TODAY],
  provider: [
    ...ALL_NAV,
    'today:notifications',
    'today:bookings-incoming',
    'today:bookings-upcoming',
    'today:match',
    'today:board',
    'today:wallet',
    'today:reviews',
    'today:summary-work',
  ],
  employer: [
    'nav:today',
    'nav:work',
    'nav:money',
    'nav:calendar',
    'nav:profile',
    'today:notifications',
    'today:bookings-upcoming',
    'today:wallet',
    'today:summary-hire',
  ],
  customer: [
    'nav:today',
    'nav:work',
    'nav:calendar',
    'nav:profile',
    'today:notifications',
    'today:bookings-upcoming',
    'today:summary-hire',
  ],
  enterprise: [...ALL_NAV, ...ALL_TODAY],
};

const NAV_PERM: Record<string, TalentPermission> = {
  '/m/talent': 'nav:today',
  '/m/talent/work': 'nav:work',
  '/m/talent/money': 'nav:money',
  '/m/talent/grow': 'nav:grow',
  '/m/talent/trust': 'nav:trust',
  '/m/talent/calendar': 'nav:calendar',
  '/m/talent/profile': 'nav:profile',
};

export function talentRolePermissions(role: TalentRoleId): Set<TalentPermission> {
  return new Set(ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS.verified);
}

export function talentHasPermission(role: TalentRoleId, permission: TalentPermission): boolean {
  return talentRolePermissions(role).has(permission);
}

export function filterTalentNavForRole(role: TalentRoleId): TalentNavItem[] {
  const allowed = talentRolePermissions(role);
  return TALENT_NAV.filter((item) => allowed.has(NAV_PERM[item.href]));
}

export type TalentTodaySectionId =
  | 'notifications'
  | 'bookings'
  | 'match'
  | 'board'
  | 'wallet'
  | 'reviews';

const SECTION_PERM: Record<TalentTodaySectionId, TalentPermission> = {
  notifications: 'today:notifications',
  bookings: 'today:bookings-upcoming',
  match: 'today:match',
  board: 'today:board',
  wallet: 'today:wallet',
  reviews: 'today:reviews',
};

export function isTalentTodaySectionVisible(role: TalentRoleId, section: TalentTodaySectionId): boolean {
  return talentHasPermission(role, SECTION_PERM[section]);
}

export function isTalentSummaryChipVisible(
  role: TalentRoleId,
  chip: 'pendingIncoming' | 'activeMatch' | 'boardApplications' | 'unreadNotifications' | 'walletTotal',
): boolean {
  const map: Record<string, TalentPermission> = {
    pendingIncoming: 'today:bookings-incoming',
    activeMatch: 'today:match',
    boardApplications: 'today:board',
    unreadNotifications: 'today:notifications',
    walletTotal: 'today:wallet',
  };
  const perm = map[chip];
  return perm ? talentHasPermission(role, perm) : true;
}
