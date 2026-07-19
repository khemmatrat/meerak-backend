import type { BookingItem } from '@/lib/services/bookingTypes';
import type { BoardJobApplication } from '@/lib/services/boardJobTypes';
import type { MatchJob } from '@/lib/services/matchJobTypes';
import { talentNotificationCategoryMeta } from '@/lib/talent/talentNotificationPresentation';
import { TALENT_TODAY_LINKS, talentBoardJobHref, talentMatchJobHref, talentNotificationHref } from '@/lib/talent/talentTodayLinks';
import type {
  TalentTimelineDayGroupId,
  TalentTimelineEvent,
  TalentTimelinePeriodId,
  TalentTimelineSourceId,
} from '@/lib/talent/talentTimelineTypes';
import type {
  TalentNotificationRow,
  TalentTodayRaw,
  TalentWalletSummary,
  TalentWorkerReview,
} from '@/lib/talent/talentTodaySources';

function parseTime(iso?: string | null): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

function pickTime(...candidates: (string | undefined | null)[]): { iso: string; ms: number } {
  for (const c of candidates) {
    const ms = parseTime(c);
    if (ms > 0) return { iso: c!, ms };
  }
  return { iso: '', ms: 0 };
}

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function periodStartMs(period: TalentTimelinePeriodId): number {
  const now = Date.now();
  if (period === 'today') return startOfTodayMs();
  if (period === 'week') return now - 7 * 86_400_000;
  return now - 30 * 86_400_000;
}

function makeEvent(
  partial: Omit<TalentTimelineEvent, 'occurredAt' | 'occurredAtMs'> & {
    timeCandidates: (string | undefined | null)[];
    fallbackMs?: number;
  },
): TalentTimelineEvent | null {
  const picked = pickTime(...partial.timeCandidates);
  const ms = picked.ms || partial.fallbackMs || 0;
  if (!ms) return null;
  const { timeCandidates: _t, fallbackMs: _f, ...rest } = partial;
  const iso = picked.iso || new Date(ms).toISOString();
  return { ...rest, occurredAt: iso, occurredAtMs: ms };
}

function bookingEvents(incoming: BookingItem[], mine: BookingItem[]): TalentTimelineEvent[] {
  const seen = new Set<string>();
  const out: TalentTimelineEvent[] = [];
  for (const b of [...incoming, ...mine]) {
    if (!b?.id || seen.has(b.id)) continue;
    seen.add(b.id);
    const ev = makeEvent({
      id: `tl-booking-${b.id}`,
      source: 'booking',
      title: b.talent_name || b.booker_name || 'Booking',
      subtitle: String(b.status || ''),
      meta: b.start_time ? undefined : undefined,
      href: TALENT_TODAY_LINKS.bookingMine,
      icon: '📅',
      timeCandidates: [b.start_time, b.created_at],
    });
    if (ev) out.push(ev);
  }
  return out;
}

function calendarEvents(incoming: BookingItem[], mine: BookingItem[]): TalentTimelineEvent[] {
  const seen = new Set<string>();
  const out: TalentTimelineEvent[] = [];
  for (const b of [...incoming, ...mine]) {
    if (!b?.id || !b.start_time || seen.has(`cal-${b.id}`)) continue;
    seen.add(`cal-${b.id}`);
    const ev = makeEvent({
      id: `tl-cal-${b.id}`,
      source: 'calendar',
      title: `คิว ${b.talent_name || b.booker_name || 'Booking'}`,
      subtitle: String(b.status || ''),
      href: TALENT_TODAY_LINKS.calendar,
      icon: '🗓️',
      timeCandidates: [b.start_time, b.created_at],
    });
    if (ev) out.push(ev);
  }
  return out;
}

function matchEvents(jobs: MatchJob[]): TalentTimelineEvent[] {
  return jobs
    .map((j) =>
      makeEvent({
        id: `tl-match-${j.id}`,
        source: 'match',
        title: j.title,
        subtitle: j.category,
        meta: String(j.status || ''),
        href: talentMatchJobHref(j.id),
        icon: '⚡',
        timeCandidates: [j.datetime, j.created_at],
      }),
    )
    .filter((e): e is TalentTimelineEvent => e != null);
}

function boardEvents(apps: BoardJobApplication[]): TalentTimelineEvent[] {
  return apps
    .map((a) =>
      makeEvent({
        id: `tl-board-${a.id}`,
        source: 'board',
        title: a.title,
        subtitle: a.employer_name,
        meta: a.status,
        href: talentBoardJobHref(a.job_id),
        icon: '💼',
        timeCandidates: [a.created_at],
      }),
    )
    .filter((e): e is TalentTimelineEvent => e != null);
}

function walletEvents(wallet: TalentWalletSummary | null): TalentTimelineEvent[] {
  if (!wallet) return [];
  const ev = makeEvent({
    id: 'tl-wallet-snapshot',
    source: 'wallet',
    title: 'สรุปกระเป๋าเงิน',
    subtitle: `ใช้ได้ ฿${wallet.available} · รอเคลียร์ ฿${wallet.pending}`,
    meta: `รวม ฿${wallet.total}`,
    href: TALENT_TODAY_LINKS.wallet,
    icon: '💰',
    timeCandidates: [],
    fallbackMs: Date.now(),
  });
  return ev ? [ev] : [];
}

function reviewEvents(reviews: TalentWorkerReview[]): TalentTimelineEvent[] {
  return reviews
    .map((r) =>
      makeEvent({
        id: `tl-review-${r.id}`,
        source: 'reviews',
        title: r.reviewer_name || 'รีวิว',
        subtitle: r.comment || '',
        meta: r.rating_overall != null ? `${r.rating_overall} ★` : undefined,
        href: TALENT_TODAY_LINKS.trust,
        icon: '⭐',
        timeCandidates: [r.created_at],
      }),
    )
    .filter((e): e is TalentTimelineEvent => e != null);
}

function notificationEvents(rows: TalentNotificationRow[]): TalentTimelineEvent[] {
  return rows
    .map((n, i) => {
      const cat = talentNotificationCategoryMeta(n);
      const href = talentNotificationHref(n) || TALENT_TODAY_LINKS.notifications;
      return makeEvent({
        id: `tl-notif-${n.id || i}`,
        source: 'notifications',
        title: n.title || 'แจ้งเตือน',
        subtitle: n.message,
        meta: cat.label,
        href,
        icon: cat.icon,
        timeCandidates: [n.sentAt, n.created_at],
      });
    })
    .filter((e): e is TalentTimelineEvent => e != null);
}

/** Compose timeline events from existing fetches — no event store */
export function composeTalentTimelineEvents(raw: TalentTodayRaw): TalentTimelineEvent[] {
  return [
    ...bookingEvents(raw.incomingBookings, raw.myBookings),
    ...calendarEvents(raw.incomingBookings, raw.myBookings),
    ...matchEvents(raw.matchJobs),
    ...boardEvents(raw.boardApplications),
    ...walletEvents(raw.wallet),
    ...reviewEvents(raw.reviews),
    ...notificationEvents(raw.notifications),
  ];
}

export function sortTalentTimelineNewestFirst(events: TalentTimelineEvent[]): TalentTimelineEvent[] {
  return [...events].sort((a, b) => b.occurredAtMs - a.occurredAtMs);
}

export function filterTalentTimelineByPeriod(
  events: TalentTimelineEvent[],
  period: TalentTimelinePeriodId,
): TalentTimelineEvent[] {
  const start = periodStartMs(period);
  return events.filter((e) => e.occurredAtMs >= start);
}

export function talentTimelineDayGroup(event: TalentTimelineEvent): TalentTimelineDayGroupId {
  const todayStart = startOfTodayMs();
  const yesterdayStart = todayStart - 86_400_000;
  if (event.occurredAtMs >= todayStart) return 'today';
  if (event.occurredAtMs >= yesterdayStart) return 'yesterday';
  return 'earlier';
}

export function groupTalentTimelineByDay(
  events: TalentTimelineEvent[],
): Record<TalentTimelineDayGroupId, TalentTimelineEvent[]> {
  const groups: Record<TalentTimelineDayGroupId, TalentTimelineEvent[]> = {
    today: [],
    yesterday: [],
    earlier: [],
  };
  for (const e of sortTalentTimelineNewestFirst(events)) {
    groups[talentTimelineDayGroup(e)].push(e);
  }
  return groups;
}

export function countTalentTimelineBySource(
  events: TalentTimelineEvent[],
): Partial<Record<TalentTimelineSourceId, number>> {
  const counts: Partial<Record<TalentTimelineSourceId, number>> = {};
  for (const e of events) {
    counts[e.source] = (counts[e.source] ?? 0) + 1;
  }
  return counts;
}
