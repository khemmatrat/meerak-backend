/** TOS-3 workspace role contexts — presentation only, not server auth roles */

export const TALENT_ROLES = [
  'guest',
  'verified',
  'provider',
  'employer',
  'customer',
  'enterprise',
] as const;

export type TalentRoleId = (typeof TALENT_ROLES)[number];

export type TalentPermission =
  | 'nav:today'
  | 'nav:work'
  | 'nav:money'
  | 'nav:grow'
  | 'nav:trust'
  | 'nav:calendar'
  | 'nav:profile'
  | 'today:notifications'
  | 'today:bookings-incoming'
  | 'today:bookings-upcoming'
  | 'today:match'
  | 'today:board'
  | 'today:wallet'
  | 'today:reviews'
  | 'today:summary-hire'
  | 'today:summary-work';

export type TalentRoleMeta = {
  id: TalentRoleId;
  label: string;
  shortLabel: string;
  icon: string;
  description: string;
  tone: 'muted' | 'primary' | 'success' | 'warning' | 'premium';
};

export const TALENT_ROLE_META: Record<TalentRoleId, TalentRoleMeta> = {
  guest: {
    id: 'guest',
    label: 'Guest',
    shortLabel: 'Guest',
    icon: '👋',
    description: 'Browse Talent OS — login เพื่อรับ/จ้างงาน',
    tone: 'muted',
  },
  verified: {
    id: 'verified',
    label: 'Verified User',
    shortLabel: 'Verified',
    icon: '✓',
    description: 'บัญชี AQOND — KYC / Compass ตามสถานะ backend',
    tone: 'primary',
  },
  provider: {
    id: 'provider',
    label: 'Provider / Talent',
    shortLabel: 'Provider',
    icon: '🛠️',
    description: 'รับงาน Match · Board · Booking · คลิป',
    tone: 'success',
  },
  employer: {
    id: 'employer',
    label: 'Employer',
    shortLabel: 'Employer',
    icon: '📋',
    description: 'จ้างงาน · โพสต์ · อนุมัติงาน',
    tone: 'warning',
  },
  customer: {
    id: 'customer',
    label: 'Customer',
    shortLabel: 'Customer',
    icon: '🛒',
    description: 'จองช่าง · ติดตามการจอง',
    tone: 'primary',
  },
  enterprise: {
    id: 'enterprise',
    label: 'Enterprise',
    shortLabel: 'Enterprise',
    icon: '🏢',
    description: 'PRO 1299 · ทีม · multi-seat',
    tone: 'premium',
  },
};

export type TalentRoleSignals = {
  loggedIn: boolean;
  userId?: string;
  userRole?: string;
  proTier?: string | null;
  providerStatus?: string | null;
};

export const TALENT_ROLE_STORAGE_KEY = 'aqond_talent_role_context_v1';
