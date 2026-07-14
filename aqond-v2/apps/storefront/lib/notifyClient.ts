'use client';

import type { AuthState } from './bff';

const NOTIFY = '/api/notify';

function headers(auth?: AuthState | null): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth?.userId) h['X-User-Id'] = auth.userId;
  if (auth?.sessionId) h['X-Session-Id'] = auth.sessionId;
  if (auth?.token) h['Authorization'] = `Bearer ${auth.token}`;
  return h;
}

async function notifyGet<T>(path: string, auth?: AuthState | null): Promise<T> {
  const res = await fetch(`${NOTIFY}${path}`, { headers: headers(auth), cache: 'no-store' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function notifyPost<T>(path: string, body: unknown, auth?: AuthState | null): Promise<T> {
  const res = await fetch(`${NOTIFY}${path}`, {
    method: 'POST',
    headers: headers(auth),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export type PushStatus = {
  user_id: string;
  push_enabled: boolean;
  devices: { platform: string; endpoint: string; registered: boolean }[];
};

export type LineStatus = {
  user_id: string;
  line_linked: boolean;
  line_user_id: string;
  display_name: string;
};

export function getPushStatus(auth: AuthState) {
  return notifyGet<PushStatus>(`/v1/push/status?user_id=${encodeURIComponent(auth.userId)}`, auth);
}

export function registerPush(auth: AuthState, fcmToken: string, platform = 'web') {
  return notifyPost<{ ok: boolean }>(
    '/v1/push/register',
    { user_id: auth.userId, fcm_token: fcmToken, platform },
    auth,
  );
}

export function getLineStatus(auth: AuthState) {
  return notifyGet<LineStatus>(`/v1/line/status?user_id=${encodeURIComponent(auth.userId)}`, auth);
}

export function linkLineManual(auth: AuthState, lineUserId: string, displayName?: string) {
  return notifyPost<{ ok: boolean }>(
    '/v1/line/link',
    { user_id: auth.userId, line_user_id: lineUserId, display_name: displayName || '' },
    auth,
  );
}

export async function getLineLoginUrl(auth: AuthState, redirectUri: string) {
  const q = new URLSearchParams({
    user_id: auth.userId,
    redirect_uri: redirectUri,
  });
  return notifyGet<{ ok: boolean; url?: string; error?: string; message?: string }>(
    `/v1/line/login-url?${q.toString()}`,
    auth,
  );
}

export function completeLineOAuth(auth: AuthState, code: string, redirectUri: string) {
  return notifyPost<{ ok: boolean }>(
    '/v1/line/oauth/callback',
    { user_id: auth.userId, code, redirect_uri: redirectUri },
    auth,
  );
}

/** Best-effort web push token via legacy backend (same as mobile landing). */
export async function registerLegacyFcm(token: string, userId: string) {
  await fetch('/api/notifications/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, source: 'mobile', userId }),
  }).catch(() => {});
}
