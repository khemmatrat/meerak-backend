import type { AuthState } from '@/lib/bff';
import { loadTalentTodayRaw } from '@/lib/talent/talentTodaySources';

/** Search uses same parallel fetches as Today with wider read limits — no new API */
export function loadTalentSearchRaw(auth: AuthState | null, userId: string | undefined) {
  return loadTalentTodayRaw(auth, userId, { notifications: 50, reviews: 20 });
}
