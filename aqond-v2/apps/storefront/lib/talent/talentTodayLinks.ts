import type { TalentNotificationRow } from '@/lib/talent/talentTodaySources';

function jobIdFromNotification(n: TalentNotificationRow): string | null {
  if (n.jobId) return String(n.jobId).trim() || null;
  const raw = n.data?.job_id ?? n.data?.jobId;
  if (raw != null && String(raw).trim()) return String(raw).trim();
  return null;
}

/** Map legacy notification payload → storefront deep link (presentation only) */
export function talentNotificationHref(n: TalentNotificationRow): string | null {
  const type = String(n.notificationType || n.data?.type || '').toLowerCase();
  const jobId = jobIdFromNotification(n);
  const advanceId = n.data?.advance_job_id ?? n.data?.advanceJobId;

  if (type.includes('advance') || type.includes('board') || advanceId) {
    const id = advanceId ? String(advanceId) : jobId;
    if (id) return `/m/services/board/${encodeURIComponent(id)}`;
  }

  if (type.includes('booking') || n.data?.booking_id) {
    const bid = n.data?.booking_id ?? n.data?.bookingId;
    if (bid) return `/m/services/booking/mine?tab=incoming`;
    return '/m/services/booking/mine';
  }

  if (jobId) {
    const openChat = type.includes('chat') || type.includes('message') || n.data?.open_chat === true;
    return openChat
      ? `/m/services/match/${encodeURIComponent(jobId)}#chat`
      : `/m/services/match/${encodeURIComponent(jobId)}`;
  }

  if (type.includes('kyc')) return '/m/account';
  return '/m/account/notifications';
}

export const TALENT_TODAY_LINKS = {
  matchList: '/m/services/match',
  matchMine: '/m/services/match/mine?tab=working',
  boardList: '/m/services/board?tab=my-applications',
  bookingIncoming: '/m/services/booking/mine?tab=incoming',
  bookingMine: '/m/services/booking/mine',
  wallet: '/m/talent/money',
  trust: '/m/talent/trust',
  notifications: '/m/account/notifications',
} as const;
