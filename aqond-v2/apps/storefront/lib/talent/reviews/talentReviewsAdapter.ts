import type { AuthState } from '@/lib/bff';
import { talentAuthHeaders } from '@/lib/talent/talentClient';
import { TALENT_READ_CLIENT } from '@/lib/talent/talentReadClient';
import type {
  TalentWorkerReview,
  TalentWorkerReviewsResponse,
} from '@/lib/talent/reviews/talentReviewsTypes';

export async function fetchTalentWorkerReviews(
  auth: AuthState,
  limit = 5,
): Promise<TalentWorkerReview[]> {
  const q = new URLSearchParams({ limit: String(limit) });
  const res = await fetch(
    `${TALENT_READ_CLIENT}/reviews/worker/${encodeURIComponent(auth.userId)}?${q}`,
    {
      cache: 'no-store',
      headers: talentAuthHeaders(auth),
    },
  );
  if (res.status === 404) return [];
  if (!res.ok) throw new Error('reviews_unavailable');
  const data = (await res.json().catch(() => ({}))) as TalentWorkerReviewsResponse;
  return Array.isArray(data?.reviews) ? data.reviews : [];
}
