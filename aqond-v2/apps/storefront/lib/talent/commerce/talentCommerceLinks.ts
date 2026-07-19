import type { BookingItem } from '@/lib/services/bookingTypes';
import type { BoardJobApplication } from '@/lib/services/boardJobTypes';
import type { MatchJob } from '@/lib/services/matchJobTypes';
import { TALENT_TODAY_LINKS } from '@/lib/talent/talentTodayLinks';

export const TALENT_COMMERCE_LINKS = {
  dashboard: TALENT_TODAY_LINKS.wallet,
  bookings: TALENT_TODAY_LINKS.bookingMine,
  bookingIncoming: TALENT_TODAY_LINKS.bookingIncoming,
  matchList: TALENT_TODAY_LINKS.matchList,
  matchMine: TALENT_TODAY_LINKS.matchMine,
  matchHistory: '/m/services/match/mine?tab=history',
  boardList: TALENT_TODAY_LINKS.boardList,
  wallet: '/m/account/wallet',
  trust: TALENT_TODAY_LINKS.trust,
} as const;

export function talentCommerceBookingHref(booking: BookingItem): string {
  const status = String(booking.status || '').toLowerCase();
  if (status === 'pending') return TALENT_COMMERCE_LINKS.bookingIncoming;
  return TALENT_COMMERCE_LINKS.bookings;
}

export function talentCommerceMatchHref(job: MatchJob): string {
  if (!job.id) return TALENT_COMMERCE_LINKS.matchMine;
  return `/m/services/match/${encodeURIComponent(job.id)}`;
}

export function talentCommerceBoardHref(app: BoardJobApplication): string {
  if (!app.job_id) return TALENT_COMMERCE_LINKS.boardList;
  return `/m/services/board/${encodeURIComponent(app.job_id)}`;
}
