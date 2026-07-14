import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'node:path';
import { returnConfigSummary } from '@/lib/server/returnConfig';
import { getScenarioBusinessMeta } from '@/lib/experience/scenarioCatalog';
import { experienceScore } from '@/lib/experience/scenarioTelemetry';
import { RETURN_REFUND_CORE_MISSION_ID } from '@aqond/return-core';

export const dynamic = 'force-dynamic';

const TELEMETRY_DIR = path.join(process.cwd(), '.data', 'telemetry');

async function appendServerTelemetry(event: Record<string, unknown>) {
  try {
    await fs.mkdir(TELEMETRY_DIR, { recursive: true });
    const file = path.join(TELEMETRY_DIR, `pv-${new Date().toISOString().slice(0, 10)}.jsonl`);
    await fs.appendFile(file, `${JSON.stringify({ ts: new Date().toISOString(), ...event })}\n`, 'utf8');
  } catch {
    /* optional */
  }
}

/** B2.7-S001 — Return Core config surface (OR001 foundation). */
export async function GET() {
  const started = Date.now();
  const summary = returnConfigSummary();
  const loadMs = Date.now() - started;
  const catalog = getScenarioBusinessMeta('B2.7-S001');
  const dims = { speed: 9, clarity: 9, recovery: 8.5, smoothness: 8.5, confidence: 8.5 };

  await appendServerTelemetry({
    scenario_id: 'B2.7-S001',
    mission_id: catalog?.mission_id || RETURN_REFUND_CORE_MISSION_ID,
    surface: 'return_core_config',
    load_ms: loadMs,
    business_impact: catalog?.business_impact,
    time_saved_minutes: catalog?.time_saved_minutes,
    experience_dims: dims,
    meta: {
      experience_score: experienceScore(dims),
      core: summary.core,
      source: summary.source,
      enabled_capability_count: summary.enabled_capability_count,
      return_request_enabled: summary.capabilities.return_request?.enabled === true,
    },
  });

  return NextResponse.json(
    {
      ok: true,
      scenario: 'B2.7-S001',
      or_id: 'OR001',
      load_ms: loadMs,
      ...summary,
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'X-Aqond-Return-Core': 'return-core',
        'X-Aqond-Return-Config-Source': summary.source,
      },
    },
  );
}
