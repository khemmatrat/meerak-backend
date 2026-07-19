import type { AuthState } from '@/lib/bff';
import { fetchIncomingBookings, fetchMyBookingRequests } from '@/lib/services/bookingApi';
import type { BookingItem } from '@/lib/services/bookingTypes';
import { fetchMyBoardApplications } from '@/lib/services/boardJobApi';
import type { BoardJobApplication } from '@/lib/services/boardJobTypes';
import { fetchMyMatchJobs } from '@/lib/services/matchJobApi';
import type { MatchJob } from '@/lib/services/matchJobTypes';
import type { TalentNotificationRow } from '@/lib/talent/notifications/talentNotificationsTypes';
import type { TalentWorkerReview } from '@/lib/talent/reviews/talentReviewsTypes';
import { fetchTalentNotifications } from '@/lib/talent/notifications/talentNotificationsAdapter';
import { fetchTalentWorkerReviews } from '@/lib/talent/reviews/talentReviewsAdapter';
import { fetchTalentWalletSummary } from '@/lib/talent/wallet/talentWalletAdapter';
import type { TalentWalletSummary } from '@/lib/talent/wallet/talentWalletTypes';

export type { TalentNotificationRow } from '@/lib/talent/notifications/talentNotificationsTypes';
export type { TalentWorkerReview } from '@/lib/talent/reviews/talentReviewsTypes';
export type { TalentWalletSummary } from '@/lib/talent/wallet/talentWalletTypes';
export { fetchTalentNotifications, fetchTalentWorkerReviews, fetchTalentWalletSummary };

export type TalentTodayRaw = {
  matchJobs: MatchJob[];
  boardApplications: BoardJobApplication[];
  incomingBookings: BookingItem[];
  myBookings: BookingItem[];
  notifications: TalentNotificationRow[];
  wallet: TalentWalletSummary | null;
  reviews: TalentWorkerReview[];
  errors: Partial<Record<'match' | 'board' | 'booking' | 'notifications' | 'wallet' | 'reviews', string>>;
};

async function safeFetch<T>(
  label: keyof TalentTodayRaw['errors'],
  fn: () => Promise<T>,
  errors: TalentTodayRaw['errors'],
  fallback: T,
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    errors[label] = e instanceof Error ? e.message : 'load_failed';
    return fallback;
  }
}

/** Parallel read — Services APIs + storefront read proxy (no direct legacy transport) */
export type TalentFetchLimits = {
  notifications?: number;
  reviews?: number;
};

export async function loadTalentTodayRaw(
  auth: AuthState | null,
  userId: string | undefined,
  limits: TalentFetchLimits = {},
): Promise<TalentTodayRaw> {
  const empty: TalentTodayRaw = {
    matchJobs: [],
    boardApplications: [],
    incomingBookings: [],
    myBookings: [],
    notifications: [],
    wallet: null,
    reviews: [],
    errors: {},
  };
  if (!auth?.userId || !userId) return empty;

  const errors: TalentTodayRaw['errors'] = {};

  const [matchJobs, boardApplications, incomingBookings, myBookings, notifications, wallet, reviews] =
    await Promise.all([
      safeFetch('match', () => fetchMyMatchJobs(userId, auth, { includeExpired: false }), errors, []),
      safeFetch('board', () => fetchMyBoardApplications(auth), errors, []),
      safeFetch('booking', () => fetchIncomingBookings(auth), errors, []),
      safeFetch('booking', () => fetchMyBookingRequests(auth), errors, []),
      safeFetch('notifications', () => fetchTalentNotifications(auth, limits.notifications ?? 8), errors, []),
      safeFetch('wallet', () => fetchTalentWalletSummary(auth), errors, null),
      safeFetch('reviews', () => fetchTalentWorkerReviews(auth, limits.reviews ?? 5), errors, []),
    ]);

  return {
    matchJobs,
    boardApplications,
    incomingBookings,
    myBookings,
    notifications,
    wallet,
    reviews,
    errors,
  };
}
