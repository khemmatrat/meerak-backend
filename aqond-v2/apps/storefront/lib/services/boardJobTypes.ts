/** Job Board (Advance Job) types — mirrors mobile/types/api.ts */

export type BoardJobStatus = 'open' | 'pending' | 'closed' | 'completed' | 'draft';

export type BoardJob = {
  id: string;
  employer_id: string;
  employer_name?: string;
  employer_trust_score?: number;
  title: string;
  description: string;
  scope: string;
  category: string;
  target_province?: string | null;
  employment_type?: string | null;
  work_surface?: string | null;
  min_budget: number;
  max_budget: number;
  duration_days: number;
  status: BoardJobStatus | string;
  applicant_count: number;
  view_count?: number;
  is_platinum_priority?: boolean;
  created_at: string;
  updated_at: string;
  published_at?: string | null;
  closed_at?: string | null;
  hired_user_id?: string | null;
  escrow_status?: string;
  escrow_amount?: number;
  agreed_amount?: number | null;
  work_submission_status?: string;
  review_pending?: boolean;
};

export type BoardJobApplication = {
  id: string;
  job_id: string;
  user_id: string;
  status: 'interested' | 'shortlisted' | 'hired' | 'rejected' | string;
  created_at: string;
  title: string;
  category: string;
  min_budget: number;
  max_budget: number;
  duration_days: number;
  job_status: string;
  employer_name: string;
  escrow_status?: string;
  quote_status?: string | null;
};

export type BoardJobsTab = 'all' | 'my-jobs' | 'my-applications' | 'saved';

export type BoardJobSort = 'newest' | 'budget_high' | 'applicants';

export type BoardJobFilters = {
  q: string;
  category: string;
  target_province: string;
  employment_type: string;
  sort: BoardJobSort;
};

export type BoardApplicant = {
  id: string;
  job_id: string;
  user_id: string;
  status: 'interested' | 'shortlisted' | 'hired' | 'rejected' | string;
  created_at: string;
  full_name?: string;
  rating?: number;
  completed_jobs_count?: number;
  trust_score?: number;
  quote_total_amount?: number | null;
};

export type CreateBoardJobInput = {
  title: string;
  description: string;
  scope: string;
  category: string;
  min_budget: number;
  max_budget: number;
  duration_days: number;
  target_province: string;
  employment_type: string;
  work_surface: 'jobboard';
  status: 'open';
};

export type EscrowBreakdown = {
  jobFee: number;
  handlingFeeAmount: number;
  paymentMarkupAmount: number;
  commissionFeeAmount: number;
  talentReceives: number;
  totalToPay: number;
  has_insurance?: boolean;
  insurance_amount?: number;
};
