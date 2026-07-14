import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { deliveryProvinceConfiguration } from '@/lib/server/deliveryConfig';
import { getScenarioBusinessMeta } from '@/lib/experience/scenarioCatalog';
import { experienceScore } from '@/lib/experience/scenarioTelemetry';
import {
  DELIVERY_CORE_MISSION_ID,
  resolveProvince,
} from '@aqond/delivery-core';
import { loadServerDeliveryConfig } from '@/lib/server/deliveryConfigStore';

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

export async function GET(req: NextRequest) {
  const started = Date.now();
  const payload = deliveryProvinceConfiguration();
  const loadMs = Date.now() - started;
  const catalog = getScenarioBusinessMeta('B2.5-S002');
  const dims = { speed: 10, clarity: 10, recovery: 10, smoothness: 10, confidence: 10 };

  const alias = req.nextUrl.searchParams.get('alias');
  const code = req.nextUrl.searchParams.get('code');
  const loaded = loadServerDeliveryConfig();
  const match =
    code || alias
      ? resolveProvince(loaded.config, {
          province_code: code ?? undefined,
          alias_en: alias ?? undefined,
        })
      : null;

  await appendServerTelemetry({
    scenario_id: 'B2.5-S002',
    mission_id: catalog?.mission_id || DELIVERY_CORE_MISSION_ID,
    surface: 'delivery_province_config',
    load_ms: loadMs,
    product_count: payload.summary.enabled_count,
    business_impact: catalog?.business_impact,
    time_saved_minutes: catalog?.time_saved_minutes,
    experience_dims: dims,
    meta: {
      experience_score: experienceScore(dims),
      core: payload.core,
      hot_reload: payload.hot_reload,
      max_pickup_radius_km: payload.max_pickup_radius_km,
    },
  });

  return NextResponse.json(
    {
      ok: true,
      load_ms: loadMs,
      match,
      ...payload,
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'X-Aqond-Delivery-Core': 'delivery-core',
        'X-Aqond-Delivery-Hot-Reload': 'supported',
      },
    },
  );
}
