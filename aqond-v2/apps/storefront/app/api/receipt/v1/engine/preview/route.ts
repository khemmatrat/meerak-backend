import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { renderEnginePreview } from '@/lib/server/receiptEngine';
import { getScenarioBusinessMeta } from '@/lib/experience/scenarioCatalog';
import { experienceScore } from '@/lib/experience/scenarioTelemetry';

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
  try {
    const preview = await renderEnginePreview(process.env.NODE_ENV === 'development' ? 'local-dev' : 'production');
    const loadMs = Date.now() - started;
  const catalog = getScenarioBusinessMeta('B2.6-S001');
  const dims = { speed: 10, clarity: 10, recovery: 10, smoothness: 10, confidence: 10 };

  await appendServerTelemetry({
    scenario_id: 'B2.6-S001',
    mission_id: catalog?.mission_id || 'RECEIPT-CORE',
    surface: 'receipt_engine',
    load_ms: loadMs,
    business_impact: catalog?.business_impact,
    time_saved_minutes: catalog?.time_saved_minutes,
    experience_dims: dims,
    meta: {
      experience_score: experienceScore(dims),
      validation_ok: preview.validation.ok,
      receipt_core_version: preview.receipt_core_version,
    },
  });

  const { pdf: _pdf, ...body } = preview;

  return NextResponse.json(
    {
      ok: preview.validation.ok,
      load_ms: loadMs,
      ...body,
    },
    {
      status: preview.validation.ok ? 200 : 500,
      headers: {
        'Cache-Control': 'no-store',
        'X-Aqond-Receipt-Core': 'receipt-core',
      },
    },
  );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
