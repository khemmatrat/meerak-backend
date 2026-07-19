import type { AuthState } from '@/lib/bff';
import { talentAuthHeaders } from '@/lib/talent/talentClient';
import { TALENT_READ_CLIENT } from '@/lib/talent/talentReadClient';
import type {
  TalentNotificationRow,
  TalentNotificationsLatestResponse,
} from '@/lib/talent/notifications/talentNotificationsTypes';

export async function fetchTalentNotifications(
  auth: AuthState,
  limit = 8,
): Promise<TalentNotificationRow[]> {
  const q = new URLSearchParams({ userId: auth.userId, limit: String(limit) });
  const res = await fetch(`${TALENT_READ_CLIENT}/notifications/latest?${q}`, {
    cache: 'no-store',
    headers: talentAuthHeaders(auth),
  });
  if (res.status === 404 || res.status === 401) return [];
  if (!res.ok) throw new Error('notifications_unavailable');
  const data = (await res.json().catch(() => ({}))) as TalentNotificationsLatestResponse;
  return Array.isArray(data?.notifications) ? data.notifications : [];
}
