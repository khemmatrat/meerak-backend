import type { AuthState } from '@/lib/bff';
import { fetchIncomingBookings, fetchMyBookingRequests } from '@/lib/services/bookingApi';
import type { BookingItem } from '@/lib/services/bookingTypes';
import { fetchMyBoardApplications } from '@/lib/services/boardJobApi';
import type { BoardJobApplication } from '@/lib/services/boardJobTypes';
import { fetchMyMatchJobs } from '@/lib/services/matchJobApi';
import type { MatchJob } from '@/lib/services/matchJobTypes';
import { meerakLegacyUrl, talentAuthHeaders } from '@/lib/talent/talentClient';

export type TalentNotificationRow = {
  id?: string;
  title?: string;
  message?: string;
  sentAt?: string;
  created_at?: string;
  notificationType?: string;
  jobId?: string | null;
  data?: Record<string, unknown> | null;
  source?: string;
};

export type TalentWalletSummary = {
  available: number;
  pending: number;
  total: number;
  wallet_frozen?: boolean;
};

export type TalentWorkerReview = {
  id: string;
  rating_overall?: number;
  comment?: string;
  created_at?: string;
  reviewer_name?: string;
  job_id?: string;
};

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

export async function fetchTalentNotifications(auth: AuthState, limit = 8): Promise<TalentNotificationRow[]> {
  const q = new URLSearchParams({ userId: auth.userId, limit: String(limit) });
  const res = await fetch(meerakLegacyUrl(`/api/notifications/latest?${q}`), {
    cache: 'no-store',
    headers: talentAuthHeaders(auth),
  });
  if (res.status === 404 || res.status === 401) return [];
  if (!res.ok) throw new Error('notifications_unavailable');
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data?.notifications) ? data.notifications : [];
}

export async function fetchTalentWalletSummary(auth: AuthState): Promise<TalentWalletSummary | null> {
  const res = await fetch(meerakLegacyUrl(`/api/wallet/${encodeURIComponent(auth.userId)}/summary`), {
    cache: 'no-store',
    headers: talentAuthHeaders(auth),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('wallet_unavailable');
  const data = await res.json().catch(() => null);
  if (!data || typeof data !== 'object') return null;
  return {
    available: Number(data.available ?? 0),
    pending: Number(data.pending ?? 0),
    total: Number(data.total ?? 0),
    wallet_frozen: !!data.wallet_frozen,
  };
}

export async function fetchTalentWorkerReviews(auth: AuthState, limit = 5): Promise<TalentWorkerReview[]> {
  const q = new URLSearchParams({ limit: String(limit) });
  const res = await fetch(meerakLegacyUrl(`/api/reviews/worker/${encodeURIComponent(auth.userId)}?${q}`), {
    cache: 'no-store',
    headers: talentAuthHeaders(auth),
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error('reviews_unavailable');
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data?.reviews) ? data.reviews : [];
}

/** Parallel read from existing Services + legacy endpoints — no new API contracts */
export async function loadTalentTodayRaw(auth: AuthState | null, userId: string | undefined): Promise<TalentTodayRaw> {
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
      safeFetch('notifications', () => fetchTalentNotifications(auth), errors, []),
      safeFetch('wallet', () => fetchTalentWalletSummary(auth), errors, null),
      safeFetch('reviews', () => fetchTalentWorkerReviews(auth), errors, []),
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
