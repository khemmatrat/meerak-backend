import type { NextRequest } from 'next/server';

import { mintServiceJwt } from '@/lib/server/serviceJwt';

export type UpstreamAuth = {
  authorization?: string;
  userId?: string;
  sessionId?: string;
};

export function upstreamAuthFromRequest(req: NextRequest): UpstreamAuth {
  const authorization =
    req.headers.get('authorization') ||
    req.headers.get('Authorization') ||
    undefined;
  const userId =
    req.headers.get('x-user-id') ||
    req.headers.get('X-User-Id') ||
    req.nextUrl.searchParams.get('user_id') ||
    req.nextUrl.searchParams.get('owner_id') ||
    undefined;
  const sessionId =
    req.headers.get('x-session-id') ||
    req.headers.get('X-Session-Id') ||
    undefined;
  return { authorization, userId, sessionId };
}

export function upstreamAuthHeaders(auth?: UpstreamAuth): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Aqond-Region': 'TH',
  };
  if (!auth) return h;
  if (auth.userId) h['X-User-Id'] = auth.userId;
  if (auth.sessionId) h['X-Session-Id'] = auth.sessionId;
  const bearer = auth.authorization?.trim();
  if (bearer) {
    h.Authorization = bearer.startsWith('Bearer ') ? bearer : `Bearer ${bearer}`;
  } else if (auth.userId) {
    const tok = mintServiceJwt(auth.userId, auth.sessionId);
    if (tok) h.Authorization = `Bearer ${tok}`;
  }
  return h;
}
