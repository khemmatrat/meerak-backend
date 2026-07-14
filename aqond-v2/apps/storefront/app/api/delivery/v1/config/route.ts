import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { deliveryConfigSummary } from '@/lib/server/deliveryConfig';
import { getScenarioBusinessMeta } from '@/lib/experience/scenarioCatalog';
import { experienceScore } from '@/lib/experience/scenarioTelemetry';
import { DELIVERY_CORE_MISSION_ID } from '@aqond/delivery-core';

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

export async function GET() {
  const started = Date.now();
  const summary = deliveryConfigSummary();
  const loadMs = Date.now() - started;
  const catalog = getScenarioBusinessMeta('B2.5-S001');
  const dims = { speed: 10, clarity: 10, recovery: 10, smoothness: 10, confidence: 10 };

  await appendServerTelemetry({
    scenario_id: 'B2.5-S001',
    mission_id: catalog?.mission_id || DELIVERY_CORE_MISSION_ID,
    surface: 'delivery_core_config',
    load_ms: loadMs,
    product_count: summary.province_count,
    business_impact: catalog?.business_impact,
    time_saved_minutes: catalog?.time_saved_minutes,
    experience_dims: dims,
    meta: {
      experience_score: experienceScore(dims),
      core: summary.core,
      source: summary.source,
      express_province_count: summary.express_province_count,
      enabled_capability_count: summary.enabled_capability_count,
      max_pickup_radius_km: summary.max_pickup_radius_km,
    },
  });

  return NextResponse.json(
    {
      ok: true,
      scenario: 'B2.5-S001',
      load_ms: loadMs,
      ...summary,
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'X-Aqond-Delivery-Core': 'delivery-core',
        'X-Aqond-Delivery-Config-Source': summary.source,
      },
    },
  );
}
