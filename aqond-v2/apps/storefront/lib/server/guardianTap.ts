import { NextResponse } from 'next/server';
import {
  enforce,
  observeComplete,
  observeStart,
  reportShadowCompare,
  resolveCanaryLane,
  shadowEvaluateForCompare,
} from '@aqond/guardian-sdk';

export type GuardianObserveSession = {
  traceId: string;
  correlationId: string;
  agentId: string;
  mode: string;
  lane?: 'canary' | 'legacy';
  startedAt: number;
};

export function startJarvisObserve(input: {
  req: Request;
  buyerId: string;
  userMessage: string;
  surface?: string | null;
}): GuardianObserveSession {
  const headerTrace = input.req.headers.get('x-trace-id');
  const headerCorr = input.req.headers.get('x-correlation-id');
  const ids = observeStart({
    traceId: headerTrace || undefined,
    correlationId: headerCorr || undefined,
    buyerId: input.buyerId,
    userMessage: input.userMessage,
    surface: input.surface || 'jarvis',
    route: '/api/ai/jarvis',
    method: 'POST',
    flags: {},
  });
  return { ...ids, startedAt: Date.now() };
}

/** Phase 1.3 — policy gate. Returns NextResponse if denied; null to proceed. */
export async function jarvisGuardianEnforceGate(input: {
  observe: GuardianObserveSession;
  buyerId: string;
  userMessage: string;
  surface?: string | null;
  action?: string;
}): Promise<NextResponse | null> {
  const result = await enforce({
    traceId: input.observe.traceId,
    correlationId: input.observe.correlationId,
    agentId: input.observe.agentId,
    buyerId: input.buyerId,
    userMessage: input.userMessage,
    surface: input.surface || 'jarvis',
    action: input.action || 'none',
  });

  if (result.allowed) return null;

  return finishJarvisObserve(
    {
      ok: false,
      error: result.code || 'guardian.denied',
      reason: result.reason || 'policy_denied',
      risk_class: result.risk_class,
      guardian: {
        decision: 'deny',
        mode: 'enforce',
        trace_id: input.observe.traceId,
      },
    },
    { ...input.observe, mode: 'enforce' },
    {
      mode: 'enforce',
      action: 'denied',
      status: result.code === 'guardian.unavailable' ? 503 : 403,
      error: result.code || 'guardian.denied',
      buyerId: input.buyerId,
      userMessage: input.userMessage,
      surface: input.surface,
    },
  );
}

/** Phase 3.6 — shadow path: legacy response vs AGK decision (fire-and-forget). */
export function scheduleJarvisShadowCompare(input: {
  observe: GuardianObserveSession;
  buyerId: string;
  userMessage: string;
  surface?: string | null;
  action?: string;
  legacyStatus: number;
  legacyMode: string;
}) {
  const lane = input.observe.lane || resolveCanaryLane(input.buyerId, input.observe.traceId);

  void (async () => {
    const agk = await shadowEvaluateForCompare({
      traceId: input.observe.traceId,
      correlationId: input.observe.correlationId,
      agentId: input.observe.agentId,
      userMessage: input.userMessage,
      surface: input.surface || 'jarvis',
      action: input.action || 'none',
    });
    if (!agk) return;
    await reportShadowCompare({
      traceId: input.observe.traceId,
      lane,
      legacyAllowed: input.legacyStatus >= 200 && input.legacyStatus < 400,
      legacyStatus: input.legacyStatus,
      legacyMode: input.legacyMode,
      action: input.action || 'none',
      agk,
    });
  })();
}

function applyGuardianHeaders(
  res: NextResponse,
  session: Pick<GuardianObserveSession, 'traceId' | 'correlationId' | 'agentId' | 'mode' | 'lane'>,
) {
  res.headers.set('X-Trace-Id', session.traceId);
  res.headers.set('X-Correlation-Id', session.correlationId);
  res.headers.set('X-Agent-Id', session.agentId);
  if (session.lane) res.headers.set('X-Guardian-Lane', session.lane);
  if (session.mode === 'shadow' || session.mode === 'enforce') {
    res.headers.set('X-Guardian-Mode', session.mode);
  }
  return res;
}

/** Returns JSON response with trace headers. Success body unchanged from Sprint 35. */
export async function finishJarvisObserve(
  data: Record<string, unknown>,
  session: GuardianObserveSession,
  meta: {
    mode: string;
    action?: string;
    status?: number;
    error?: string | null;
    buyerId?: string;
    userMessage?: string;
    surface?: string | null;
  },
) {
  const status = meta.status ?? 200;
  void observeComplete({
    traceId: session.traceId,
    correlationId: session.correlationId,
    agentId: session.agentId,
    mode: meta.mode,
    action: meta.action || 'none',
    latencyMs: Date.now() - session.startedAt,
    status,
    error: meta.error ?? null,
    riskClass: (data.risk_class as string) || null,
  });

  scheduleJarvisShadowCompare({
    observe: session,
    buyerId: meta.buyerId || 'guest',
    userMessage: meta.userMessage || '',
    surface: meta.surface || 'jarvis',
    action: meta.action || 'none',
    legacyStatus: status,
    legacyMode: meta.mode,
  });

  const res = NextResponse.json(data, { status });
  return applyGuardianHeaders(res, session);
}

export function jarvisHealthResponse(
  data: Record<string, unknown>,
  session?: Pick<GuardianObserveSession, 'traceId' | 'correlationId' | 'agentId'>,
) {
  const res = NextResponse.json(data);
  if (session) applyGuardianHeaders(res, session);
  return res;
}
