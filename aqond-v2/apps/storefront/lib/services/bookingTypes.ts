/** Booking types — mirrors mobile booking flows */

export type BookingProvider = {
  id: string;
  name?: string;
  avatar_url?: string;
  rating?: number;
  completedJobs?: number;
  completed_jobs_count?: number;
  expert_category?: string | null;
  signature_service?: string;
  verified_badge?: string | null;
  location?: string | Record<string, unknown>;
  status?: string;
};

export type BookingSlot = {
  id: string;
  start_time: string;
  end_time: string;
  user_id?: string;
};

export type BookingTalentProfile = {
  id: string;
  name?: string;
  full_name?: string;
  avatar_url?: string;
  rating?: number;
  signature_service?: string;
  the_journey?: string;
  verified_badge?: string;
  expert_category?: string;
  portfolio_urls?: string[];
  completed_jobs_count?: number;
};

export type BookingItem = {
  id: string;
  slot_id: string;
  booker_id: string;
  talent_id: string;
  status: string;
  start_time: string;
  end_time: string;
  created_at: string;
  deposit_amount: number;
  deposit_status: string;
  talent_name?: string | null;
  talent_avatar?: string | null;
  booker_name?: string | null;
  booker_avatar?: string | null;
};

export type BookingTab = 'my-requests' | 'incoming';

export type ExpertCategory =
  | 'all'
  | 'chef'
  | 'tailor'
  | 'artist'
  | 'barber'
  | 'wellness'
  | 'beauty'
  | 'party_guest';
