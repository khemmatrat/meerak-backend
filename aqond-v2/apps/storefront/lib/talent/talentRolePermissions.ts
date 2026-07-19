import { TALENT_NAV, type TalentNavItem } from '@/lib/talent/talentNavConfig';
import type { TalentPermission, TalentRoleId } from '@/lib/talent/talentRoleTypes';

const ALL_NAV: TalentPermission[] = [
  'nav:today',
  'nav:work',
  'nav:money',
  'nav:grow',
  'nav:ai',
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
    'nav:ai',
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
    'nav:ai',
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
  '/m/talent/ai': 'nav:ai',
  '/m/talent/trust': 'nav:trust',
  '/m/talent/calendar': 'nav:calendar',
  '/m/talent/profile': 'nav:profile',
};

/** Satellite routes — same permission cohort as nav / Today sections */
const SATELLITE_ROUTE_PERM: Record<string, TalentPermission> = {
  '/m/talent/notifications': 'today:notifications',
  '/m/talent/search': 'nav:today',
  '/m/talent/timeline': 'today:notifications',
  '/m/talent/chat': 'today:notifications',
};

const ROUTE_PERM: Record<string, TalentPermission> = {
  ...NAV_PERM,
  ...SATELLITE_ROUTE_PERM,
};

/** Sorted longest-first for prefix resolution */
const ROUTE_PERM_ENTRIES = Object.entries(ROUTE_PERM).sort(
  (a, b) => b[0].length - a[0].length,
);

/** Money (Commerce), AI, Trust — require guard + login when unauthenticated */
export const TALENT_SENSITIVE_ROUTE_PREFIXES = [
  '/m/talent/money',
  '/m/talent/ai',
  '/m/talent/trust',
] as const;

/** Personal / financial surfaces — 401 → login before role check */
export const TALENT_LOGIN_REQUIRED_PREFIXES = [
  '/m/talent/money',
  '/m/talent/trust',
  '/m/talent/notifications',
  '/m/talent/timeline',
  '/m/talent/chat',
] as const;

function normalizeTalentPath(pathname: string): string {
  if (!pathname.startsWith('/m/talent')) return pathname;
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export function talentPermissionForPath(pathname: string): TalentPermission | null {
  const normalized = normalizeTalentPath(pathname);
  if (normalized === '/m/talent') return 'nav:today';
  for (const [prefix, permission] of ROUTE_PERM_ENTRIES) {
    if (prefix === '/m/talent') continue;
    if (normalized === prefix || normalized.startsWith(`${prefix}/`)) {
      return permission;
    }
  }
  return null;
}

export function canAccessTalentRoute(role: TalentRoleId, pathname: string): boolean {
  const permission = talentPermissionForPath(pathname);
  if (!permission) return true;
  return talentHasPermission(role, permission);
}

export function isTalentSensitivePath(pathname: string): boolean {
  const normalized = normalizeTalentPath(pathname);
  return TALENT_SENSITIVE_ROUTE_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
}

export function isTalentLoginRequiredPath(pathname: string): boolean {
  const normalized = normalizeTalentPath(pathname);
  return TALENT_LOGIN_REQUIRED_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
}

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
