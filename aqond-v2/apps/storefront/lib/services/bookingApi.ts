import type { AuthState } from '@/lib/bff';
import type {
  BookingItem,
  BookingProvider,
  BookingSlot,
  BookingTalentProfile,
  ExpertCategory,
} from './bookingTypes';
import { expertCategoryApiParam } from './bookingTaxonomy';

function authHeaders(auth?: AuthState | null): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth?.token) h.Authorization = `Bearer ${auth.token}`;
  if (auth?.userId) h['X-User-Id'] = auth.userId;
  if (auth?.sessionId) h['X-Session-Id'] = auth.sessionId;
  return h;
}

function normalizeProvider(p: Record<string, unknown>): BookingProvider {
  return {
    ...(p as unknown as BookingProvider),
    id: String(p.id ?? ''),
    name: String(p.name || p.full_name || 'Talent'),
    rating: Number(p.rating ?? 0),
    completedJobs: Number(p.completedJobs ?? p.completed_jobs_count ?? 0),
  };
}

export async function fetchBookingProviders(
  category: ExpertCategory,
  auth?: AuthState | null,
): Promise<BookingProvider[]> {
  const apiCat = expertCategoryApiParam(category);
  const params = new URLSearchParams();
  if (apiCat) params.set('category', apiCat);
  const q = params.toString();
  const res = await fetch(`/api/services/booking/providers${q ? `?${q}` : ''}`, {
    cache: 'no-store',
    headers: authHeaders(auth),
  });
  const data = await res.json().catch(() => []);
  return (Array.isArray(data) ? data : []).map((p) =>
    normalizeProvider(p as Record<string, unknown>),
  );
}

export async function fetchBookingTalentProfile(
  talentId: string,
  auth?: AuthState | null,
): Promise<BookingTalentProfile | undefined> {
  const res = await fetch(
    `/api/services/booking/talents/${encodeURIComponent(talentId)}/profile`,
    { cache: 'no-store', headers: authHeaders(auth) },
  );
  if (!res.ok) return undefined;
  const data = await res.json().catch(() => null);
  if (!data?.id && !data?.firebase_uid) return undefined;
  return {
    id: String(data.id || data.firebase_uid || talentId),
    name: data.name || data.full_name,
    full_name: data.full_name || data.name,
    avatar_url: data.avatar_url,
    rating: Number(data.rating ?? 0),
    signature_service: data.signature_service,
    the_journey: data.the_journey,
    verified_badge: data.verified_badge,
    expert_category: data.expert_category,
    portfolio_urls: Array.isArray(data.portfolio_urls) ? data.portfolio_urls : [],
    completed_jobs_count: Number(data.completed_jobs_count ?? 0),
  };
}

export async function fetchBookingTalentSlots(
  talentId: string,
  auth?: AuthState | null,
): Promise<BookingSlot[]> {
  const res = await fetch(
    `/api/services/booking/talents/${encodeURIComponent(talentId)}/slots`,
    { cache: 'no-store', headers: authHeaders(auth) },
  );
  const data = await res.json().catch(() => ({ slots: [] }));
  return Array.isArray(data?.slots) ? data.slots : [];
}

export async function createBookingRequest(
  payload: { slot_id: string; talent_id: string; deposit_amount: number },
  auth?: AuthState | null,
): Promise<BookingItem> {
  const res = await fetch('/api/services/booking/bookings', {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (typeof data?.error === 'string' && data.error) ||
      (typeof data?.message === 'string' && data.message) ||
      'จองคิวไม่สำเร็จ';
    throw new Error(msg);
  }
  const b = data?.booking ?? data;
  return b as BookingItem;
}

export async function fetchMyBookingRequests(auth?: AuthState | null): Promise<BookingItem[]> {
  const res = await fetch('/api/services/booking/bookings/mine', {
    cache: 'no-store',
    headers: authHeaders(auth),
  });
  const data = await res.json().catch(() => ({ bookings: [] }));
  return Array.isArray(data?.bookings) ? data.bookings : [];
}

export async function fetchIncomingBookings(auth?: AuthState | null): Promise<BookingItem[]> {
  const res = await fetch('/api/services/booking/bookings/incoming', {
    cache: 'no-store',
    headers: authHeaders(auth),
  });
  const data = await res.json().catch(() => ({ bookings: [] }));
  return Array.isArray(data?.bookings) ? data.bookings : [];
}

export async function patchBookingStatus(
  bookingId: string,
  status: 'confirmed' | 'cancelled',
  auth?: AuthState | null,
): Promise<void> {
  const res = await fetch(`/api/services/booking/bookings/${encodeURIComponent(bookingId)}`, {
    method: 'PATCH',
    headers: authHeaders(auth),
    body: JSON.stringify({ status }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((typeof data?.error === 'string' && data.error) || 'อัปเดตไม่สำเร็จ');
  }
}

export async function payBookingDeposit(bookingId: string, auth?: AuthState | null): Promise<void> {
  const res = await fetch(
    `/api/services/booking/bookings/${encodeURIComponent(bookingId)}/pay-deposit`,
    { method: 'POST', headers: authHeaders(auth), body: JSON.stringify({}) },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((typeof data?.error === 'string' && data.error) || 'ชำระมัดจำไม่สำเร็จ');
  }
}

export function bookingStatusTone(
  status: string,
): 'pending' | 'active' | 'completed' | 'cancelled' | 'default' {
  const s = String(status || '').toLowerCase();
  if (s === 'pending') return 'pending';
  if (s === 'confirmed' || s === 'in_progress') return 'active';
  if (s === 'completed') return 'completed';
  if (s === 'cancelled') return 'cancelled';
  return 'default';
}
