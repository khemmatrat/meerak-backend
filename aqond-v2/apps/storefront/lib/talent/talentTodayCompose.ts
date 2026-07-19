import type { BookingItem } from '@/lib/services/bookingTypes';
import type { BoardJobApplication } from '@/lib/services/boardJobTypes';
import type { MatchJob } from '@/lib/services/matchJobTypes';
import { filterMyMatchJobs } from '@/lib/services/myMatchJobsFilter';
import type { TalentNotificationRow, TalentTodayRaw, TalentWalletSummary, TalentWorkerReview } from '@/lib/talent/talentTodaySources';

const RECENT_LIMIT = 3;
const NOTIFICATION_LIMIT = 6;

function parseTime(iso?: string): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export type TalentTodaySection<T> = {
  items: T[];
  total: number;
};

export type TalentTodayComposed = {
  summary: {
    pendingIncoming: number;
    activeMatch: number;
    boardApplications: number;
    unreadNotifications: number;
    walletTotal: number | null;
  };
  notifications: TalentTodaySection<TalentNotificationRow>;
  upcomingBookings: TalentTodaySection<BookingItem>;
  recentMatch: TalentTodaySection<MatchJob>;
  recentBoard: TalentTodaySection<BoardJobApplication>;
  wallet: TalentWalletSummary | null;
  recentReviews: TalentTodaySection<TalentWorkerReview>;
};

function upcomingBookings(incoming: BookingItem[], mine: BookingItem[]): BookingItem[] {
  const seen = new Set<string>();
  const merged: BookingItem[] = [];
  for (const b of [...incoming, ...mine]) {
    if (!b?.id || seen.has(b.id)) continue;
    seen.add(b.id);
    merged.push(b);
  }
  const todayStart = startOfTodayMs();
  return merged
    .filter((b) => {
      const status = String(b.status || '').toLowerCase();
      if (status === 'cancelled' || status === 'completed') return false;
      return parseTime(b.start_time) >= todayStart;
    })
    .sort((a, b) => parseTime(a.start_time) - parseTime(b.start_time));
}

/** Pure aggregation — reuses existing filter helpers only */
export function composeTalentToday(raw: TalentTodayRaw, userId: string): TalentTodayComposed {
  const workingMatch = filterMyMatchJobs(raw.matchJobs, 'working', userId);
  const upcoming = upcomingBookings(raw.incomingBookings, raw.myBookings);
  const boardSorted = [...raw.boardApplications].sort(
    (a, b) => parseTime(b.created_at) - parseTime(a.created_at),
  );
  const reviewsSorted = [...raw.reviews].sort(
    (a, b) => parseTime(b.created_at) - parseTime(a.created_at),
  );
  const notifications = [...raw.notifications].sort(
    (a, b) => parseTime(b.sentAt || b.created_at) - parseTime(a.sentAt || a.created_at),
  );

  const pendingIncoming = raw.incomingBookings.filter(
    (b) => String(b.status || '').toLowerCase() === 'pending',
  ).length;

  return {
    summary: {
      pendingIncoming,
      activeMatch: workingMatch.length,
      boardApplications: raw.boardApplications.length,
      unreadNotifications: notifications.length,
      walletTotal: raw.wallet?.total ?? null,
    },
    notifications: {
      items: notifications.slice(0, NOTIFICATION_LIMIT),
      total: notifications.length,
    },
    upcomingBookings: {
      items: upcoming.slice(0, RECENT_LIMIT),
      total: upcoming.length,
    },
    recentMatch: {
      items: workingMatch.slice(0, RECENT_LIMIT),
      total: workingMatch.length,
    },
    recentBoard: {
      items: boardSorted.slice(0, RECENT_LIMIT),
      total: boardSorted.length,
    },
    wallet: raw.wallet,
    recentReviews: {
      items: reviewsSorted.slice(0, RECENT_LIMIT),
      total: reviewsSorted.length,
    },
  };
}
