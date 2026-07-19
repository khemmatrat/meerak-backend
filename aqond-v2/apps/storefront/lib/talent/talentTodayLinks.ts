import type { TalentNotificationRow } from '@/lib/talent/talentTodaySources';

function jobIdFromNotification(n: TalentNotificationRow): string | null {
  if (n.jobId) return String(n.jobId).trim() || null;
  const raw = n.data?.job_id ?? n.data?.jobId;
  if (raw != null && String(raw).trim()) return String(raw).trim();
  return null;
}

/** Match job detail — Services SSOT; no #chat until anchor handler exists */
export function talentMatchJobHref(jobId: string): string {
  return `/m/services/match/${encodeURIComponent(jobId)}`;
}

export function talentBoardJobHref(jobId: string): string {
  return `/m/services/board/${encodeURIComponent(jobId)}`;
}

/** Map legacy notification payload → storefront deep link (presentation only) */
export function talentNotificationHref(n: TalentNotificationRow): string | null {
  const type = String(n.notificationType || n.data?.type || '').toLowerCase();
  const jobId = jobIdFromNotification(n);
  const advanceId = n.data?.advance_job_id ?? n.data?.advanceJobId;

  const openChat =
    type.includes('chat') ||
    type.includes('message') ||
    type === 'job_progress' ||
    n.data?.open_chat === true ||
    n.data?.openJobChat === true;

  if (type.includes('wallet') || type.includes('payment') || type.includes('payout') || type.includes('escrow')) {
    return TALENT_TODAY_LINKS.accountWallet;
  }

  if (type.includes('review') || type.includes('rating')) {
    return TALENT_TODAY_LINKS.trust;
  }

  if (type.includes('calendar') || type.includes('schedule') || type.includes('reminder')) {
    return TALENT_TODAY_LINKS.calendar;
  }

  if (type.includes('advance') || type.includes('board') || advanceId) {
    const id = advanceId ? String(advanceId) : jobId;
    if (id) return talentBoardJobHref(id);
  }

  if (type.includes('booking') || n.data?.booking_id || n.data?.bookingId) {
    return TALENT_TODAY_LINKS.bookingIncoming;
  }

  if (jobId) {
    return talentMatchJobHref(jobId);
  }

  if (openChat) return TALENT_TODAY_LINKS.chat;

  if (type.includes('kyc')) return '/m/account';
  return TALENT_TODAY_LINKS.notifications;
}

export const TALENT_TODAY_LINKS = {
  matchList: '/m/services/match',
  matchMine: '/m/services/match/mine?tab=working',
  boardList: '/m/services/board?tab=my-applications',
  bookingIncoming: '/m/services/booking/mine?tab=incoming',
  bookingMine: '/m/services/booking/mine',
  /** Commerce Money tab */
  wallet: '/m/talent/money',
  /** AqondPay SSOT — payment/wallet notifications */
  accountWallet: '/m/account/wallet',
  trust: '/m/talent/trust',
  /** Schedule deep links → Booking SSOT (not placeholder calendar tab) */
  calendar: '/m/services/booking/mine',
  notifications: '/m/talent/notifications',
  search: '/m/talent/search',
  timeline: '/m/talent/timeline',
  chat: '/m/talent/chat',
} as const;
