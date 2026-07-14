import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { proxyExperienceEvent } from '@/lib/server/experienceProxy';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';

const TELEMETRY_DIR = path.join(process.cwd(), '.data', 'telemetry');

async function appendLocal(events: unknown[]) {
  try {
    await fs.mkdir(TELEMETRY_DIR, { recursive: true });
    const file = path.join(TELEMETRY_DIR, `pv-${new Date().toISOString().slice(0, 10)}.jsonl`);
    const lines = events
      .map((e) => JSON.stringify({ ts: new Date().toISOString(), ...(e as Record<string, unknown>) }))
      .join('\n') + '\n';
    await fs.appendFile(file, lines, 'utf8');
  } catch {
    /* local analytics optional */
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const events = Array.isArray(body.events) ? body.events : [body];
  const auth = upstreamAuthFromRequest(req);

  await appendLocal(events);

  for (const ev of events) {
    void proxyExperienceEvent(
      {
        event_type: 'pv.telemetry',
        surface: ev.surface || 'unknown',
        scenario_id: ev.scenario_id,
        mission_id: ev.mission_id,
        payload: ev,
      },
      auth,
    );
  }

  return NextResponse.json({ ok: true, count: events.length });
}
