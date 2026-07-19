import type { AuthState } from '@/lib/bff';
import { fetchIncomingBookings, fetchMyBookingRequests } from '@/lib/services/bookingApi';
import { fetchMyBoardApplications } from '@/lib/services/boardJobApi';
import { fetchMyMatchJobs } from '@/lib/services/matchJobApi';
import type { TalentTodayRaw } from '@/lib/talent/talentTodaySources';
import { fetchTalentWalletSummary, fetchTalentWorkerReviews } from '@/lib/talent/talentTodaySources';

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

/** Commerce reads same endpoints as Today/Search with wider limits + expired match history */
export async function loadTalentCommerceRaw(
  auth: AuthState | null,
  userId: string | undefined,
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

  const [matchJobs, boardApplications, incomingBookings, myBookings, wallet, reviews] =
    await Promise.all([
      safeFetch(
        'match',
        () => fetchMyMatchJobs(userId, auth, { includeExpired: true }),
        errors,
        [],
      ),
      safeFetch('board', () => fetchMyBoardApplications(auth), errors, []),
      safeFetch('booking', () => fetchIncomingBookings(auth), errors, []),
      safeFetch('booking', () => fetchMyBookingRequests(auth), errors, []),
      safeFetch('wallet', () => fetchTalentWalletSummary(auth), errors, null),
      safeFetch('reviews', () => fetchTalentWorkerReviews(auth, 50), errors, []),
    ]);

  return {
    matchJobs,
    boardApplications,
    incomingBookings,
    myBookings,
    notifications: [],
    wallet,
    reviews,
    errors,
  };
}
