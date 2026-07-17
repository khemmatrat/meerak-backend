import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminKey } from '@/lib/server/merchantAdmin';
import fs from 'fs/promises';
import path from 'path';

const OUTBOX_FILE = path.join(process.cwd(), '.data', 'dev', 'event-outbox.json');
const DLQ_FILE = path.join(process.cwd(), '.data', 'dev', 'event-dlq.json');

async function countByStatus(file: string) {
  try {
    const raw = JSON.parse(await fs.readFile(file, 'utf8')) as { entries: Array<{ status?: string }> };
    const counts: Record<string, number> = {};
    for (const e of raw.entries) {
      const s = e.status || 'unknown';
      counts[s] = (counts[s] || 0) + 1;
    }
    return { total: raw.entries.length, counts };
  } catch {
    return { total: 0, counts: {} };
  }
}

export async function GET(req: NextRequest) {
  const key = req.headers.get('x-admin-key') || req.nextUrl.searchParams.get('admin_key');
  if (!verifyAdminKey(key)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const outbox = await countByStatus(OUTBOX_FILE);
  const dlq = await countByStatus(DLQ_FILE);

  return NextResponse.json({
    ok: true,
    outbox,
    dlq: { total: dlq.total, entries: dlq.counts.dlq || dlq.total },
    backbone: process.env.FOOD_EVENT_BACKBONE || 'json',
    at: new Date().toISOString(),
  });
}
