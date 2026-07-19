export type TalentNavItem = {
  href: string;
  label: string;
  icon: string;
  exact?: boolean;
  phase: string;
};

/** TOS-1 workspace tabs — presentation only, no API wiring */
export const TALENT_NAV: TalentNavItem[] = [
  { href: '/m/talent', label: 'Today', icon: '☀️', exact: true, phase: 'TOS-2' },
  { href: '/m/talent/work', label: 'Work', icon: '💼', phase: 'TOS-2' },
  { href: '/m/talent/money', label: 'Money', icon: '💰', phase: 'TOS-2' },
  { href: '/m/talent/grow', label: 'Grow', icon: '🌱', phase: 'TOS-2' },
  { href: '/m/talent/ai', label: 'AI', icon: '🤖', phase: 'TOS-4' },
  { href: '/m/talent/trust', label: 'Trust', icon: '🛡️', phase: 'TOS-2' },
  { href: '/m/talent/calendar', label: 'Calendar', icon: '📅', phase: 'TOS-2' },
  { href: '/m/talent/profile', label: 'Profile', icon: '👤', phase: 'TOS-2' },
];

export function isTalentNavActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
