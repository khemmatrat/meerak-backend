import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { proxyExperienceEvent } from '@/lib/server/experienceProxy';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';

const OBS_DIR = path.join(process.cwd(), '.data', 'jarvis-observations');

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const auth = upstreamAuthFromRequest(req);

  const record = {
    ts: new Date().toISOString(),
    ...body,
  };

  try {
    await fs.mkdir(OBS_DIR, { recursive: true });
    const file = path.join(OBS_DIR, `home-${new Date().toISOString().slice(0, 10)}.jsonl`);
    await fs.appendFile(file, `${JSON.stringify(record)}\n`, 'utf8');
  } catch {
    /* optional local store */
  }

  void proxyExperienceEvent(
    {
      event_type: 'jarvis.observation',
      surface: body.surface || 'home',
      scenario_id: body.scenario_id,
      payload: body,
    },
    auth,
  );

  return NextResponse.json({ ok: true, stored: true });
}

export async function GET(req: NextRequest) {
  const surface = req.nextUrl.searchParams.get('surface') || 'home';
  const file = path.join(OBS_DIR, `${surface}-${new Date().toISOString().slice(0, 10)}.jsonl`);
  try {
    const raw = await fs.readFile(file, 'utf8');
    const lines = raw.trim().split('\n').filter(Boolean);
    const recent = lines.slice(-20).map((l) => JSON.parse(l));
    return NextResponse.json({ surface, observations: recent });
  } catch {
    return NextResponse.json({ surface, observations: [] });
  }
}
