import type { TalentNotificationRow } from '@/lib/talent/talentTodaySources';

export type TalentNotificationFilterId =
  | 'all'
  | 'unread'
  | 'booking'
  | 'work'
  | 'money'
  | 'review'
  | 'chat'
  | 'calendar';

export type TalentNotificationCategory =
  | 'booking'
  | 'work'
  | 'money'
  | 'review'
  | 'chat'
  | 'calendar'
  | 'other';

export type TalentNotificationGroupId = 'today' | 'yesterday' | 'older';

export const TALENT_NOTIFICATION_FILTERS: { id: TalentNotificationFilterId; label: string; icon: string }[] = [
  { id: 'all', label: 'ทั้งหมด', icon: '📋' },
  { id: 'unread', label: 'ยังไม่อ่าน', icon: '🔵' },
  { id: 'booking', label: 'จอง', icon: '📅' },
  { id: 'work', label: 'งาน', icon: '💼' },
  { id: 'money', label: 'เงิน', icon: '💰' },
  { id: 'review', label: 'รีวิว', icon: '⭐' },
  { id: 'chat', label: 'แชท', icon: '💬' },
  { id: 'calendar', label: 'ปฏิทิน', icon: '🗓️' },
];

export const TALENT_NOTIFICATION_GROUP_LABELS: Record<TalentNotificationGroupId, string> = {
  today: 'วันนี้',
  yesterday: 'เมื่อวาน',
  older: 'ก่อนหน้านี้',
};

const CATEGORY_META: Record<TalentNotificationCategory, { label: string; icon: string }> = {
  booking: { label: 'จอง', icon: '📅' },
  work: { label: 'งาน', icon: '💼' },
  money: { label: 'เงิน', icon: '💰' },
  review: { label: 'รีวิว', icon: '⭐' },
  chat: { label: 'แชท', icon: '💬' },
  calendar: { label: 'ปฏิทิน', icon: '🗓️' },
  other: { label: 'ระบบ', icon: '🔔' },
};

function normType(n: TalentNotificationRow): string {
  return String(n.notificationType || n.data?.type || '')
    .trim()
    .toLowerCase();
}

function parseTime(iso?: string): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

function startOfDayMs(d = new Date()): number {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}

/** Read-only unread heuristic from existing API fields — no mark-read mutation */
export function isTalentNotificationUnread(n: TalentNotificationRow): boolean {
  if (n.is_read === true || n.read === true) return false;
  if (n.is_read === false || n.read === false) return true;
  if (n.read_at) return false;
  const dataRead = n.data?.is_read ?? n.data?.read;
  if (dataRead === true) return false;
  if (dataRead === false) return true;
  return false;
}

/** Presentation-only category — mirrors mobile type heuristics, not backend enums */
export function talentNotificationCategory(n: TalentNotificationRow): TalentNotificationCategory {
  const type = normType(n);
  const data = n.data || {};

  if (
    type.includes('chat') ||
    type.includes('message') ||
    type === 'job_progress' ||
    data.open_chat === true ||
    data.openJobChat === true
  ) {
    return 'chat';
  }
  if (type.includes('review') || type.includes('rating')) return 'review';
  if (
    type.includes('wallet') ||
    type.includes('payment') ||
    type.includes('payout') ||
    type.includes('escrow') ||
    type.includes('tip')
  ) {
    return 'money';
  }
  if (type.includes('calendar') || type.includes('schedule') || type.includes('reminder')) return 'calendar';
  if (type.includes('booking') || data.booking_id != null || data.bookingId != null) return 'booking';
  if (
    type.includes('advance') ||
    type.includes('board') ||
    type.includes('match') ||
    type.includes('job') ||
    data.advance_job_id != null ||
    data.advanceJobId != null ||
    n.jobId
  ) {
    return 'work';
  }
  return 'other';
}

export function talentNotificationCategoryMeta(n: TalentNotificationRow) {
  return CATEGORY_META[talentNotificationCategory(n)];
}

export function notificationRowTimestamp(n: TalentNotificationRow): number {
  return parseTime(n.sentAt || n.created_at);
}

export function talentNotificationGroupId(n: TalentNotificationRow): TalentNotificationGroupId {
  const ts = notificationRowTimestamp(n);
  if (!ts) return 'older';
  const todayStart = startOfDayMs();
  const yesterdayStart = todayStart - 86_400_000;
  if (ts >= todayStart) return 'today';
  if (ts >= yesterdayStart) return 'yesterday';
  return 'older';
}

export function filterTalentNotificationsByFilter(
  items: TalentNotificationRow[],
  filter: TalentNotificationFilterId,
): TalentNotificationRow[] {
  if (filter === 'all') return items;
  if (filter === 'unread') return items.filter(isTalentNotificationUnread);
  return items.filter((n) => talentNotificationCategory(n) === filter);
}

export function sortTalentNotifications(items: TalentNotificationRow[]): TalentNotificationRow[] {
  return [...items].sort((a, b) => notificationRowTimestamp(b) - notificationRowTimestamp(a));
}

export function groupTalentNotifications(
  items: TalentNotificationRow[],
): Record<TalentNotificationGroupId, TalentNotificationRow[]> {
  const groups: Record<TalentNotificationGroupId, TalentNotificationRow[]> = {
    today: [],
    yesterday: [],
    older: [],
  };
  for (const n of sortTalentNotifications(items)) {
    groups[talentNotificationGroupId(n)].push(n);
  }
  return groups;
}
