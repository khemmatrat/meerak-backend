/** TOS-7 Activity Timeline — presentation types only */

export type TalentTimelineSourceId =
  | 'booking'
  | 'match'
  | 'board'
  | 'wallet'
  | 'reviews'
  | 'notifications'
  | 'calendar';

export type TalentTimelinePeriodId = 'today' | 'week' | 'month';

export type TalentTimelineEvent = {
  id: string;
  source: TalentTimelineSourceId;
  title: string;
  subtitle?: string;
  meta?: string;
  href: string;
  icon: string;
  occurredAt: string;
  occurredAtMs: number;
};

export const TALENT_TIMELINE_SOURCE_META: Record<
  TalentTimelineSourceId,
  { label: string; icon: string }
> = {
  booking: { label: 'จอง', icon: '📅' },
  match: { label: 'Match', icon: '⚡' },
  board: { label: 'Board', icon: '💼' },
  wallet: { label: 'กระเป๋า', icon: '💰' },
  reviews: { label: 'รีวิว', icon: '⭐' },
  notifications: { label: 'แจ้งเตือน', icon: '🔔' },
  calendar: { label: 'ปฏิทิน', icon: '🗓️' },
};

export const TALENT_TIMELINE_PERIODS: { id: TalentTimelinePeriodId; label: string }[] = [
  { id: 'today', label: 'วันนี้' },
  { id: 'week', label: 'สัปดาห์นี้' },
  { id: 'month', label: 'เดือนนี้' },
];

export type TalentTimelineDayGroupId = 'today' | 'yesterday' | 'earlier';

export const TALENT_TIMELINE_DAY_LABELS: Record<TalentTimelineDayGroupId, string> = {
  today: 'วันนี้',
  yesterday: 'เมื่อวาน',
  earlier: 'ก่อนหน้านี้',
};
