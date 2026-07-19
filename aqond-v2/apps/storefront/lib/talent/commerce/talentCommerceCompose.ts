import { bookingStatusTone } from '@/lib/services/bookingApi';
import type { BookingItem } from '@/lib/services/bookingTypes';
import type { BoardJobApplication } from '@/lib/services/boardJobTypes';
import type { MatchJob } from '@/lib/services/matchJobTypes';
import { filterMyMatchJobs } from '@/lib/services/myMatchJobsFilter';
import { TALENT_COMMERCE_LINKS } from '@/lib/talent/commerce/talentCommerceLinks';
import type {
  TalentCommerceChartBar,
  TalentCommerceComposed,
  TalentCommerceGrowthMetric,
  TalentCommercePeriodId,
  TalentCommerceTrendDirection,
} from '@/lib/talent/commerce/talentCommerceTypes';
import type { TalentTodayRaw } from '@/lib/talent/talentTodaySources';

const LIST_LIMIT = 4;
const DAY_MS = 86_400_000;

function norm(s: unknown): string {
  return String(s ?? '').trim().toLowerCase();
}

function normStatus(s: unknown): string {
  return norm(s).replace(/\s+/g, '_');
}

function parseTime(iso?: string | null): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

function mergeBookings(incoming: BookingItem[], mine: BookingItem[]): BookingItem[] {
  const seen = new Set<string>();
  const out: BookingItem[] = [];
  for (const b of [...incoming, ...mine]) {
    if (!b?.id || seen.has(b.id)) continue;
    seen.add(b.id);
    out.push(b);
  }
  return out.sort((a, b) => parseTime(b.created_at) - parseTime(a.created_at));
}

function periodStartMs(period: TalentCommercePeriodId): number {
  const now = Date.now();
  return period === 'week' ? now - 7 * DAY_MS : now - 30 * DAY_MS;
}

function previousPeriodStartMs(period: TalentCommercePeriodId): number {
  const span = period === 'week' ? 7 * DAY_MS : 30 * DAY_MS;
  return periodStartMs(period) - span;
}

function inRange(ms: number, start: number, end: number): boolean {
  return ms >= start && ms < end;
}

function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function shortDayLabel(ms: number): string {
  try {
    return new Intl.DateTimeFormat('th-TH', { weekday: 'short' }).format(new Date(ms));
  } catch {
    return '';
  }
}

function boardMidBudget(app: BoardJobApplication): number {
  return (Number(app.min_budget) + Number(app.max_budget)) / 2;
}

function isWorkerMatch(job: MatchJob, userId: string): boolean {
  return norm(job.accepted_by) === norm(userId);
}

function completionRate(completed: number, cancelled: number): number | null {
  const total = completed + cancelled;
  if (!total) return null;
  return Math.round((completed / total) * 100);
}

function growthMetric(
  id: string,
  label: string,
  current: number,
  previous: number,
): TalentCommerceGrowthMetric {
  const delta = current - previous;
  const deltaPct = previous > 0 ? Math.round((delta / previous) * 100) : current > 0 ? 100 : null;
  return { id, label, current, previous, delta, deltaPct };
}

function trendDirection(delta: number): TalentCommerceTrendDirection {
  if (delta > 0) return 'up';
  if (delta < 0) return 'down';
  return 'flat';
}

function buildActivityChart(
  period: TalentCommercePeriodId,
  bookings: BookingItem[],
  matchJobs: MatchJob[],
  boardApps: BoardJobApplication[],
): TalentCommerceChartBar[] {
  const days = period === 'week' ? 7 : 30;
  const now = Date.now();
  const buckets: TalentCommerceChartBar[] = [];

  for (let i = days - 1; i >= 0; i -= 1) {
    const dayStart = new Date(now - i * DAY_MS);
    dayStart.setHours(0, 0, 0, 0);
    const start = dayStart.getTime();
    const key = dayKey(start);

    let count = 0;
    for (const b of bookings) {
      const ms = parseTime(b.created_at);
      if (ms && dayKey(ms) === key) count += 1;
    }
    for (const j of matchJobs) {
      const ms = parseTime(j.created_at || j.datetime);
      if (ms && dayKey(ms) === key) count += 1;
    }
    for (const a of boardApps) {
      const ms = parseTime(a.created_at);
      if (ms && dayKey(ms) === key) count += 1;
    }

    buckets.push({
      id: key,
      label: period === 'week' ? shortDayLabel(start) : String(dayStart.getDate()),
      value: count,
    });
  }

  return buckets;
}

function countInPeriod(items: { ms: number }[], start: number, end: number): number {
  return items.filter((x) => inRange(x.ms, start, end)).length;
}

/** Pure client aggregation — existing fetch payloads only */
export function composeTalentCommerce(
  raw: TalentTodayRaw,
  userId: string,
  period: TalentCommercePeriodId = 'week',
): TalentCommerceComposed {
  const bookings = mergeBookings(raw.incomingBookings, raw.myBookings);
  const workingMatch = filterMyMatchJobs(raw.matchJobs, 'working', userId, { showExpired: true });
  const historyMatch = filterMyMatchJobs(raw.matchJobs, 'history', userId, { showExpired: true });
  const completedMatch = historyMatch.filter((j) => normStatus(j.status) === 'completed');
  const cancelledMatch = historyMatch.filter((j) => normStatus(j.status) === 'cancelled');

  const workerCompletedMatch = completedMatch.filter((j) => isWorkerMatch(j, userId));
  const matchCompletedIncome = workerCompletedMatch.reduce((sum, j) => sum + Number(j.price || 0), 0);
  const pipelineValue = workingMatch.reduce((sum, j) => sum + Number(j.price || 0), 0);

  const pendingBookings = bookings.filter((b) => bookingStatusTone(b.status) === 'pending');
  const confirmedBookings = bookings.filter((b) => bookingStatusTone(b.status) === 'active');
  const completedBookings = bookings.filter((b) => bookingStatusTone(b.status) === 'completed');
  const cancelledBookings = bookings.filter((b) => bookingStatusTone(b.status) === 'cancelled');

  const bookingDeposits = completedBookings.reduce((sum, b) => sum + Number(b.deposit_amount || 0), 0);

  const hiredBoard = raw.boardApplications.filter((a) => normStatus(a.status) === 'hired');
  const activeBoard = raw.boardApplications.filter((a) => {
    const s = normStatus(a.status);
    return s === 'interested' || s === 'shortlisted';
  });
  const rejectedBoard = raw.boardApplications.filter((a) => normStatus(a.status) === 'rejected');
  const boardHiredIncome = hiredBoard.reduce((sum, a) => sum + boardMidBudget(a), 0);

  const walletAvailable = raw.wallet?.available ?? 0;
  const walletPending = raw.wallet?.pending ?? 0;
  const estimatedTotal = matchCompletedIncome + boardHiredIncome + bookingDeposits + walletAvailable;

  const matchCompleted = completedMatch.length;
  const matchCancelled = cancelledMatch.length;
  const bookingCompleted = completedBookings.length;
  const bookingCancelled = cancelledBookings.length;
  const boardCompleted = hiredBoard.length;
  const boardCancelled = rejectedBoard.length;

  const totalCompleted = matchCompleted + bookingCompleted + boardCompleted;
  const totalCancelled = matchCancelled + bookingCancelled + boardCancelled;
  const overallRate = completionRate(totalCompleted, totalCancelled);

  const reviewsSorted = [...raw.reviews].sort(
    (a, b) => parseTime(b.created_at) - parseTime(a.created_at),
  );
  const ratings = reviewsSorted
    .map((r) => Number(r.rating_overall))
    .filter((n) => Number.isFinite(n) && n > 0);
  const averageRating = ratings.length
    ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
    : null;

  const periodStart = periodStartMs(period);
  const prevStart = previousPeriodStartMs(period);
  const now = Date.now();

  const bookingEvents = bookings.map((b) => ({ ms: parseTime(b.created_at) })).filter((x) => x.ms);
  const matchEvents = raw.matchJobs
    .map((j) => ({ ms: parseTime(j.created_at || j.datetime) }))
    .filter((x) => x.ms);
  const boardEvents = raw.boardApplications.map((a) => ({ ms: parseTime(a.created_at) })).filter((x) => x.ms);
  const reviewEvents = raw.reviews.map((r) => ({ ms: parseTime(r.created_at) })).filter((x) => x.ms);

  const completedEvents = [
    ...completedMatch.map((j) => ({ ms: parseTime(j.datetime || j.created_at) })),
    ...completedBookings.map((b) => ({ ms: parseTime(b.end_time || b.created_at) })),
    ...hiredBoard.map((a) => ({ ms: parseTime(a.created_at) })),
  ].filter((x) => x.ms);

  const growth: TalentCommerceGrowthMetric[] = [
    growthMetric(
      'bookings',
      'การจองใหม่',
      countInPeriod(bookingEvents, periodStart, now),
      countInPeriod(bookingEvents, prevStart, periodStart),
    ),
    growthMetric(
      'match',
      'Match ใหม่',
      countInPeriod(matchEvents, periodStart, now),
      countInPeriod(matchEvents, prevStart, periodStart),
    ),
    growthMetric(
      'completions',
      'งานสำเร็จ',
      countInPeriod(completedEvents, periodStart, now),
      countInPeriod(completedEvents, prevStart, periodStart),
    ),
    growthMetric(
      'reviews',
      'รีวิวใหม่',
      countInPeriod(reviewEvents, periodStart, now),
      countInPeriod(reviewEvents, prevStart, periodStart),
    ),
  ];

  const incomeSlices = [
    {
      id: 'match',
      label: 'Match สำเร็จ',
      amount: matchCompletedIncome,
      href: TALENT_COMMERCE_LINKS.matchHistory,
    },
    {
      id: 'board',
      label: 'Board จ้างแล้ว',
      amount: boardHiredIncome,
      href: TALENT_COMMERCE_LINKS.boardList,
    },
    {
      id: 'booking',
      label: 'มัดจำจอง',
      amount: bookingDeposits,
      href: TALENT_COMMERCE_LINKS.bookings,
    },
    {
      id: 'wallet',
      label: 'กระเป๋า (ใช้ได้)',
      amount: walletAvailable,
      href: TALENT_COMMERCE_LINKS.wallet,
    },
  ].filter((s) => s.amount > 0);

  const incomeBreakdown: TalentCommerceChartBar[] = incomeSlices.map((s) => ({
    id: s.id,
    label: s.label,
    value: s.amount,
  }));

  const activityByDay = buildActivityChart(period, bookings, raw.matchJobs, raw.boardApplications);

  const bookingsGrowth = growth.find((g) => g.id === 'bookings')!;

  const metrics = [
    {
      id: 'bookings',
      label: 'การจอง',
      value: String(bookings.length),
      hint: `${pendingBookings.length} รอตอบ`,
      icon: '📅',
      href: TALENT_COMMERCE_LINKS.bookings,
      trend: {
        label: `${bookingsGrowth.delta >= 0 ? '+' : ''}${bookingsGrowth.delta}`,
        direction: trendDirection(bookingsGrowth.delta),
      },
    },
    {
      id: 'income',
      label: 'รายได้ประมาณ',
      value: formatThbCompact(estimatedTotal),
      hint: 'จาก price · budget · deposit · wallet',
      icon: '💵',
      href: TALENT_COMMERCE_LINKS.dashboard,
    },
    {
      id: 'match',
      label: 'Match',
      value: String(workingMatch.length),
      hint: `${completedMatch.length} สำเร็จ`,
      icon: '⚡',
      href: TALENT_COMMERCE_LINKS.matchMine,
    },
    {
      id: 'board',
      label: 'Board',
      value: String(raw.boardApplications.length),
      hint: `${hiredBoard.length} จ้างแล้ว`,
      icon: '💼',
      href: TALENT_COMMERCE_LINKS.boardList,
    },
    {
      id: 'wallet',
      label: 'กระเป๋า',
      value: raw.wallet ? formatThbCompact(raw.wallet.total) : '—',
      hint: raw.wallet ? `รอเคลียร์ ${formatThbCompact(raw.wallet.pending)}` : undefined,
      icon: '💰',
      href: TALENT_COMMERCE_LINKS.wallet,
    },
    {
      id: 'reviews',
      label: 'รีวิว',
      value: averageRating != null ? `${averageRating} ★` : String(reviewsSorted.length),
      hint: `${reviewsSorted.length} รายการ`,
      icon: '⭐',
      href: TALENT_COMMERCE_LINKS.trust,
    },
    {
      id: 'completion',
      label: 'อัตราสำเร็จ',
      value: overallRate != null ? `${overallRate}%` : '—',
      hint: `${totalCompleted} สำเร็จ / ${totalCancelled} ยกเลิก`,
      icon: '✅',
      href: TALENT_COMMERCE_LINKS.matchHistory,
    },
    {
      id: 'growth',
      label: period === 'week' ? 'Growth 7 วัน' : 'Growth 30 วัน',
      value: `${growth[2].delta >= 0 ? '+' : ''}${growth[2].delta}`,
      hint: 'งานสำเร็จ vs ช่วงก่อน',
      icon: '📈',
      href: TALENT_COMMERCE_LINKS.dashboard,
      trend: {
        label:
          growth[2].deltaPct != null ? `${growth[2].deltaPct >= 0 ? '+' : ''}${growth[2].deltaPct}%` : '—',
        direction: trendDirection(growth[2].delta),
      },
    },
  ];

  return {
    period,
    metrics,
    income: {
      estimatedTotal,
      matchCompleted: matchCompletedIncome,
      boardHired: boardHiredIncome,
      bookingDeposits,
      walletAvailable,
      walletPending,
      slices: incomeSlices,
    },
    completion: {
      overallRate,
      completed: totalCompleted,
      cancelled: totalCancelled,
      total: totalCompleted + totalCancelled,
      bySource: [
        {
          source: 'match',
          label: 'Match',
          completed: matchCompleted,
          cancelled: matchCancelled,
          rate: completionRate(matchCompleted, matchCancelled),
        },
        {
          source: 'booking',
          label: 'Booking',
          completed: bookingCompleted,
          cancelled: bookingCancelled,
          rate: completionRate(bookingCompleted, bookingCancelled),
        },
        {
          source: 'board',
          label: 'Board',
          completed: boardCompleted,
          cancelled: boardCancelled,
          rate: completionRate(boardCompleted, boardCancelled),
        },
      ],
    },
    growth,
    charts: {
      activityByDay,
      incomeBreakdown,
    },
    bookings: {
      items: bookings.slice(0, LIST_LIMIT),
      total: bookings.length,
      href: TALENT_COMMERCE_LINKS.bookings,
      pending: pendingBookings.length,
      confirmed: confirmedBookings.length,
      completed: completedBookings.length,
    },
    match: {
      items: [...workingMatch, ...completedMatch].slice(0, LIST_LIMIT),
      total: raw.matchJobs.length,
      href: TALENT_COMMERCE_LINKS.matchMine,
      working: workingMatch.length,
      completed: completedMatch.length,
      cancelled: cancelledMatch.length,
      pipelineValue,
    },
    board: {
      items: raw.boardApplications.slice(0, LIST_LIMIT),
      total: raw.boardApplications.length,
      href: TALENT_COMMERCE_LINKS.boardList,
      hired: hiredBoard.length,
      active: activeBoard.length,
    },
    wallet: raw.wallet,
    reviews: {
      items: reviewsSorted.slice(0, LIST_LIMIT),
      total: reviewsSorted.length,
      href: TALENT_COMMERCE_LINKS.trust,
      averageRating,
    },
    errors: raw.errors,
  };
}

export function formatThbCompact(amount: number): string {
  try {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `฿${Math.round(amount)}`;
  }
}

export function chartBarHeight(value: number, max: number): number {
  if (!max || !value) return 4;
  return Math.max(4, Math.round((value / max) * 100));
}
