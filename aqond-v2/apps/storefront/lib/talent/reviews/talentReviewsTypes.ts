export type TalentWorkerReview = {
  id: string;
  rating_overall?: number;
  comment?: string;
  created_at?: string;
  reviewer_name?: string;
  job_id?: string;
};

export type TalentWorkerReviewsResponse = {
  reviews?: TalentWorkerReview[];
};
