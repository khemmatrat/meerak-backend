/** MatchJob types — mirrors mobile/types Job (presentation + API contract). */

export enum JobStatus {
  OPEN = 'open',
  ACCEPTED = 'accepted',
  IN_PROGRESS = 'in_progress',
  WAITING_FOR_APPROVAL = 'waiting_for_approval',
  WAITING_FOR_PAYMENT = 'waiting_for_payment',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  DISPUTE = 'dispute',
}

export type JobLocation = {
  lat?: number;
  lng?: number;
  fullAddress?: string;
  district?: string;
  area?: string;
  province?: string;
};

export type MatchJob = {
  id: string;
  category: string;
  title: string;
  description: string;
  price: number;
  location: JobLocation | null;
  datetime: string;
  status: JobStatus | string;
  created_by?: string;
  created_by_name?: string;
  accepted_by?: string;
  accepted_by_name?: string;
  created_at?: string;
  has_insurance?: boolean;
  insurance_amount?: number;
};
