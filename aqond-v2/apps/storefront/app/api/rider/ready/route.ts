import { NextResponse } from 'next/server';
import { meerakBackendBase } from '@/lib/server-env';
import { riderDispatchReadiness } from '@/lib/server/dispatchMode';

export async function GET() {
  const dispatch = riderDispatchReadiness();
  const backendBase = meerakBackendBase();

  let backend: Record<string, unknown> = { reachable: false };
  try {
    const res = await fetch(`${backendBase}/api/rider-os/ready`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    backend = {
      reachable: true,
      status: res.status,
      ...(await res.json().catch(() => ({}))),
    };
  } catch (e: unknown) {
    backend = {
      reachable: false,
      error: e instanceof Error ? e.message : 'backend_unreachable',
    };
  }

  const jwtConfigured = !!(
    process.env.JWT_SECRET ||
    process.env.MEERAK_JWT_SECRET ||
    process.env.KONG_JWT_SECRET
  )?.trim();

  const ready =
    jwtConfigured &&
    (dispatch.production_safe || dispatch.local_fallback) &&
    backend.reachable &&
    ((backend as { ready?: boolean }).ready === true ||
      (backend as { status?: number }).status === 404);

  return NextResponse.json(
    {
      ready,
      storefront: {
        jwt_configured: jwtConfigured,
        dispatch,
        backend_url: backendBase,
      },
      backend,
    },
    { status: ready ? 200 : 503 },
  );
}
