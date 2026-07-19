import type { BookingItem } from '@/lib/services/bookingTypes';
import type { BoardJobApplication } from '@/lib/services/boardJobTypes';
import type { MatchJob } from '@/lib/services/matchJobTypes';
import { talentNotificationCategoryMeta } from '@/lib/talent/talentNotificationPresentation';
import { TALENT_TODAY_LINKS, talentNotificationHref } from '@/lib/talent/talentTodayLinks';
import type {
  TalentSearchFilterId,
  TalentSearchResult,
  TalentSearchSourceId,
} from '@/lib/talent/talentSearchTypes';
import type {
  TalentNotificationRow,
  TalentTodayRaw,
  TalentWalletSummary,
  TalentWorkerReview,
} from '@/lib/talent/talentTodaySources';

function blob(parts: (string | number | null | undefined)[]): string {
  return parts
    .filter((p) => p != null && String(p).trim())
    .join(' ')
    .toLowerCase();
}

function makeResult(
  partial: Omit<TalentSearchResult, 'searchText'> & { keywords?: string[] },
): TalentSearchResult {
  const searchText = blob([
    partial.title,
    partial.subtitle,
    partial.meta,
    partial.source,
    ...(partial.keywords ?? []),
  ]);
  const { keywords: _k, ...rest } = partial;
  return { ...rest, searchText };
}

const STATIC_SERVICES: TalentSearchResult[] = [
  {
    id: 'svc-match',
    source: 'services',
    title: 'Match Jobs',
    subtitle: 'หางาน Match · สร้างงาน',
    href: TALENT_TODAY_LINKS.matchList,
    icon: '⚡',
    searchText: '',
  },
  {
    id: 'svc-match-mine',
    source: 'services',
    title: 'Match ของฉัน',
    subtitle: 'งานที่รับแล้ว',
    href: TALENT_TODAY_LINKS.matchMine,
    icon: '⚡',
    searchText: '',
  },
  {
    id: 'svc-board',
    source: 'services',
    title: 'Job Board',
    subtitle: 'Advance jobs · สมัครงาน',
    href: '/m/services/board',
    icon: '💼',
    searchText: '',
  },
  {
    id: 'svc-board-apps',
    source: 'services',
    title: 'Board ใบสมัคร',
    subtitle: 'My applications',
    href: TALENT_TODAY_LINKS.boardList,
    icon: '💼',
    searchText: '',
  },
  {
    id: 'svc-booking',
    source: 'services',
    title: 'Booking',
    subtitle: 'จองบริการ · รับจอง',
    href: TALENT_TODAY_LINKS.bookingMine,
    icon: '📅',
    searchText: '',
  },
  {
    id: 'svc-video',
    source: 'services',
    title: 'Video Feed',
    subtitle: 'คลิปโปรโมต',
    href: '/m/services/video',
    icon: '🎬',
    searchText: '',
  },
  {
    id: 'svc-hub',
    source: 'services',
    title: 'AQOND Services',
    subtitle: 'ศูนย์ Services OS',
    href: '/m/services',
    icon: '🛠️',
    searchText: '',
  },
].map((r) => makeResult({ ...r, keywords: ['services', 'match', 'board', 'booking'] }));

function bookingResults(incoming: BookingItem[], mine: BookingItem[]): TalentSearchResult[] {
  const seen = new Set<string>();
  const out: TalentSearchResult[] = [];
  for (const b of [...incoming, ...mine]) {
    if (!b?.id || seen.has(b.id)) continue;
    seen.add(b.id);
    out.push(
      makeResult({
        id: `booking-${b.id}`,
        source: 'booking',
        title: b.talent_name || b.booker_name || 'Booking',
        subtitle: String(b.status || ''),
        meta: b.start_time,
        href: TALENT_TODAY_LINKS.bookingMine,
        icon: '📅',
        keywords: [b.booker_name, b.talent_name, b.status, 'booking', 'จอง'],
      }),
    );
  }
  return out;
}

function calendarResults(incoming: BookingItem[], mine: BookingItem[]): TalentSearchResult[] {
  const seen = new Set<string>();
  const out: TalentSearchResult[] = [];
  for (const b of [...incoming, ...mine]) {
    if (!b?.id || !b.start_time || seen.has(b.id)) continue;
    seen.add(b.id);
    out.push(
      makeResult({
        id: `cal-${b.id}`,
        source: 'calendar',
        title: `คิว ${b.talent_name || b.booker_name || 'Booking'}`,
        subtitle: b.start_time,
        meta: String(b.status || ''),
        href: TALENT_TODAY_LINKS.calendar,
        icon: '🗓️',
        keywords: [b.start_time, 'calendar', 'schedule', 'ปฏิทิน'],
      }),
    );
  }
  return out;
}

function matchResults(jobs: MatchJob[]): TalentSearchResult[] {
  return jobs.map((j) =>
    makeResult({
      id: `match-${j.id}`,
      source: 'match',
      title: j.title,
      subtitle: j.category,
      meta: String(j.status || ''),
      href: `/m/services/match/${encodeURIComponent(j.id)}`,
      icon: '⚡',
      keywords: [j.description, j.category, j.created_by_name, j.accepted_by_name, 'match'],
    }),
  );
}

function boardResults(apps: BoardJobApplication[]): TalentSearchResult[] {
  return apps.map((a) =>
    makeResult({
      id: `board-${a.id}`,
      source: 'board',
      title: a.title,
      subtitle: a.employer_name,
      meta: a.status,
      href: `/m/services/board/${encodeURIComponent(a.job_id)}`,
      icon: '💼',
      keywords: [a.category, a.job_status, 'board', 'advance'],
    }),
  );
}

function walletResults(wallet: TalentWalletSummary | null): TalentSearchResult[] {
  if (!wallet) return [];
  return [
    makeResult({
      id: 'wallet-summary',
      source: 'wallet',
      title: 'สรุปกระเป๋าเงิน',
      subtitle: `ใช้ได้ ฿${wallet.available} · รอเคลียร์ ฿${wallet.pending}`,
      meta: `รวม ฿${wallet.total}`,
      href: TALENT_TODAY_LINKS.wallet,
      icon: '💰',
      keywords: ['wallet', 'payment', 'เงิน', 'กระเป๋า', 'escrow'],
    }),
  ];
}

function reviewResults(reviews: TalentWorkerReview[]): TalentSearchResult[] {
  return reviews.map((r) =>
    makeResult({
      id: `review-${r.id}`,
      source: 'reviews',
      title: r.reviewer_name || 'รีวิว',
      subtitle: r.comment || '',
      meta: r.rating_overall != null ? `${r.rating_overall} ★` : undefined,
      href: TALENT_TODAY_LINKS.trust,
      icon: '⭐',
      keywords: [r.comment, 'review', 'rating', 'รีวิว'],
    }),
  );
}

function notificationResults(rows: TalentNotificationRow[]): TalentSearchResult[] {
  return rows.map((n, i) => {
    const meta = talentNotificationCategoryMeta(n);
    const href = talentNotificationHref(n) || TALENT_TODAY_LINKS.notifications;
    return makeResult({
      id: `notif-${n.id || i}`,
      source: 'notifications',
      title: n.title || 'แจ้งเตือน',
      subtitle: n.message,
      meta: meta.label,
      href,
      icon: meta.icon,
      keywords: [n.notificationType, n.message, 'notification', 'แจ้งเตือน'],
    });
  });
}

/** Build client-side search index from existing Today raw payload — no indexing service */
export function composeTalentSearchIndex(raw: TalentTodayRaw): TalentSearchResult[] {
  return [
    ...STATIC_SERVICES,
    ...bookingResults(raw.incomingBookings, raw.myBookings),
    ...calendarResults(raw.incomingBookings, raw.myBookings),
    ...matchResults(raw.matchJobs),
    ...boardResults(raw.boardApplications),
    ...walletResults(raw.wallet),
    ...reviewResults(raw.reviews),
    ...notificationResults(raw.notifications),
  ];
}

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase();
}

export function filterTalentSearchResults(
  index: TalentSearchResult[],
  query: string,
  sourceFilter: TalentSearchFilterId,
): TalentSearchResult[] {
  const q = normalizeQuery(query);
  return index.filter((item) => {
    if (sourceFilter !== 'all' && item.source !== sourceFilter) return false;
    if (!q) return true;
    return item.searchText.includes(q) || item.title.toLowerCase().includes(q);
  });
}

export function groupTalentSearchResultsBySource(
  items: TalentSearchResult[],
): Partial<Record<TalentSearchSourceId, TalentSearchResult[]>> {
  const groups: Partial<Record<TalentSearchSourceId, TalentSearchResult[]>> = {};
  for (const item of items) {
    if (!groups[item.source]) groups[item.source] = [];
    groups[item.source]!.push(item);
  }
  return groups;
}
