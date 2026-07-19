import type { BookingItem } from '@/lib/services/bookingTypes';
import type { BoardJobApplication } from '@/lib/services/boardJobTypes';
import type { MatchJob } from '@/lib/services/matchJobTypes';
import type { TalentWalletSummary, TalentWorkerReview } from '@/lib/talent/talentTodaySources';

export type TalentCommercePeriodId = 'week' | 'month';

export type TalentCommerceTrendDirection = 'up' | 'down' | 'flat';

export type TalentCommerceMetric = {
  id: string;
  label: string;
  value: string;
  hint?: string;
  icon: string;
  href: string;
  trend?: {
    label: string;
    direction: TalentCommerceTrendDirection;
  };
};

export type TalentCommerceChartBar = {
  id: string;
  label: string;
  value: number;
};

export type TalentCommerceIncomeSlice = {
  id: string;
  label: string;
  amount: number;
  href: string;
};

export type TalentCommerceCompletionSlice = {
  source: 'match' | 'booking' | 'board';
  label: string;
  completed: number;
  cancelled: number;
  rate: number | null;
};

export type TalentCommerceGrowthMetric = {
  id: string;
  label: string;
  current: number;
  previous: number;
  delta: number;
  deltaPct: number | null;
};

export type TalentCommerceSection<T> = {
  items: T[];
  total: number;
  href: string;
};

export type TalentCommerceComposed = {
  period: TalentCommercePeriodId;
  metrics: TalentCommerceMetric[];
  income: {
    estimatedTotal: number;
    matchCompleted: number;
    boardHired: number;
    bookingDeposits: number;
    walletAvailable: number;
    walletPending: number;
    slices: TalentCommerceIncomeSlice[];
  };
  completion: {
    overallRate: number | null;
    completed: number;
    cancelled: number;
    total: number;
    bySource: TalentCommerceCompletionSlice[];
  };
  growth: TalentCommerceGrowthMetric[];
  charts: {
    activityByDay: TalentCommerceChartBar[];
    incomeBreakdown: TalentCommerceChartBar[];
  };
  bookings: TalentCommerceSection<BookingItem> & {
    pending: number;
    confirmed: number;
    completed: number;
  };
  match: TalentCommerceSection<MatchJob> & {
    working: number;
    completed: number;
    cancelled: number;
    pipelineValue: number;
  };
  board: TalentCommerceSection<BoardJobApplication> & {
    hired: number;
    active: number;
  };
  wallet: TalentWalletSummary | null;
  reviews: TalentCommerceSection<TalentWorkerReview> & {
    averageRating: number | null;
  };
  errors: Partial<Record<'match' | 'board' | 'booking' | 'wallet' | 'reviews', string>>;
};
