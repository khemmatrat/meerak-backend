/** v2 auth via bff-svc — OTP / LINE (Kong-compatible JWT). */

import { MEERAK_SESSION_ID_KEY, MEERAK_TOKEN_KEY, MEERAK_USER_ID_KEY, persistAuth } from './meerakAuth';
import type { MeerakUser } from './meerakAuth';

const BFF_AUTH = '/api/bff/v1/auth';

async function authFetch<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const res = await fetch(`${BFF_AUTH}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Aqond-Region': 'TH' },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (data as { error?: string }).error || `auth_http_${res.status}`;
    throw new Error(err);
  }
  return data as T;
}

export async function requestOtp(phone: string): Promise<{ ok: boolean; dev_code?: string }> {
  return authFetch('/otp/request', { phone });
}

export async function verifyOtp(
  phone: string,
  code: string,
): Promise<{ token: string; session_id: string; user_id: string; auth_method: string }> {
  return authFetch('/otp/verify', { phone, code, device: 'web' });
}

export async function loginWithOtp(phone: string, code: string): Promise<{ token: string; user: MeerakUser; sessionId: string }> {
  const data = await verifyOtp(phone, code);
  const user: MeerakUser = {
    id: data.user_id,
    phone,
    name: `ลูกค้า ${phone.slice(-4)}`,
  };
  persistAuth(data.token, data.user_id, data.session_id);
  return { token: data.token, user, sessionId: data.session_id };
}

export const LINE_LOGIN_CALLBACK_PATH = '/m/login/line-callback';
export const LINE_OAUTH_STATE_KEY = 'aqond_line_oauth_state';

export async function getLineLoginUrl(redirectUri: string): Promise<{
  ok: boolean;
  url?: string;
  state?: string;
  error?: string;
  message?: string;
}> {
  const q = new URLSearchParams({ redirect_uri: redirectUri });
  return authFetch(`/line/login-url?${q.toString()}`, undefined, 'GET');
}

export async function loginWithLineOAuth(
  code: string,
  redirectUri: string,
  state: string,
): Promise<{ token: string; user: MeerakUser; sessionId: string }> {
  const data = await authFetch<{
    token: string;
    session_id: string;
    user_id: string;
    display_name?: string;
  }>('/line/oauth/callback', { code, redirect_uri: redirectUri, state, device: 'web' });
  const user: MeerakUser = {
    id: data.user_id,
    name: data.display_name || 'LINE User',
  };
  persistAuth(data.token, data.user_id, data.session_id);
  return { token: data.token, user, sessionId: data.session_id };
}

export function lineLoginRedirectUri(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}${LINE_LOGIN_CALLBACK_PATH}`;
}

export function readSessionId(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(MEERAK_SESSION_ID_KEY) || '';
}

export const V2_AUTH_ENABLED = process.env.NEXT_PUBLIC_V2_AUTH !== '0';
