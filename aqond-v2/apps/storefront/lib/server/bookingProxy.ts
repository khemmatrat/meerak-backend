import { meerakBackendBase } from '@/lib/server-env';
import { upstreamAuthHeaders, type UpstreamAuth } from '@/lib/server/upstreamAuth';

export async function proxyBookingProviders(
  params: { category?: string; verified?: string },
  auth?: UpstreamAuth,
) {
  const q = new URLSearchParams();
  if (params.category) q.set('category', params.category);
  if (params.verified) q.set('verified', params.verified);
  const suffix = q.toString() ? `?${q}` : '';
  const res = await fetch(`${meerakBackendBase()}/api/providers${suffix}`, {
    cache: 'no-store',
    headers: upstreamAuthHeaders(auth),
  });
  const data = await res.json().catch(() => []);
  return { ok: res.ok, data, status: res.status };
}

export async function proxyTalentProfile(talentId: string, auth?: UpstreamAuth) {
  const res = await fetch(
    `${meerakBackendBase()}/api/users/profile/${encodeURIComponent(talentId)}`,
    { cache: 'no-store', headers: upstreamAuthHeaders(auth) },
  );
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, status: res.status };
}

export async function proxyTalentSlots(talentId: string, auth?: UpstreamAuth) {
  const res = await fetch(
    `${meerakBackendBase()}/api/availability/${encodeURIComponent(talentId)}`,
    { cache: 'no-store', headers: upstreamAuthHeaders(auth) },
  );
  const data = await res.json().catch(() => ({ slots: [] }));
  return { ok: res.ok, data, status: res.status };
}

export async function proxyCreateBooking(body: Record<string, unknown>, auth?: UpstreamAuth) {
  const res = await fetch(`${meerakBackendBase()}/api/bookings`, {
    method: 'POST',
    headers: upstreamAuthHeaders(auth),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, status: res.status };
}

export async function proxyMyBookingRequests(auth?: UpstreamAuth) {
  const res = await fetch(`${meerakBackendBase()}/api/bookings/my-requests`, {
    cache: 'no-store',
    headers: upstreamAuthHeaders(auth),
  });
  const data = await res.json().catch(() => ({ bookings: [] }));
  return { ok: res.ok, data, status: res.status };
}

export async function proxyIncomingBookings(auth?: UpstreamAuth) {
  const res = await fetch(`${meerakBackendBase()}/api/bookings/me`, {
    cache: 'no-store',
    headers: upstreamAuthHeaders(auth),
  });
  const data = await res.json().catch(() => ({ bookings: [] }));
  return { ok: res.ok, data, status: res.status };
}

export async function proxyPatchBooking(
  bookingId: string,
  body: Record<string, unknown>,
  auth?: UpstreamAuth,
) {
  const res = await fetch(`${meerakBackendBase()}/api/bookings/${encodeURIComponent(bookingId)}`, {
    method: 'PATCH',
    headers: upstreamAuthHeaders(auth),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, status: res.status };
}

export async function proxyPayBookingDeposit(bookingId: string, auth?: UpstreamAuth) {
  const res = await fetch(
    `${meerakBackendBase()}/api/bookings/${encodeURIComponent(bookingId)}/pay-deposit`,
    { method: 'POST', headers: upstreamAuthHeaders(auth), body: JSON.stringify({}) },
  );
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, status: res.status };
}
