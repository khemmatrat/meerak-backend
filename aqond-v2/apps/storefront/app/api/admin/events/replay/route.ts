import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminKey } from '@/lib/server/merchantAdmin';
import { replayOutbox } from '@/lib/server/eventProjector';
import { replayDlqEntry } from '@/lib/server/eventOutbox';

export async function POST(req: NextRequest) {
  const key = req.headers.get('x-admin-key') || req.nextUrl.searchParams.get('admin_key');
  if (!verifyAdminKey(key)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (body.dlq_id) {
    const hit = await replayDlqEntry(String(body.dlq_id));
    if (!hit) return NextResponse.json({ error: 'dlq_not_found' }, { status: 404 });
    return NextResponse.json({ ok: true, replayed: hit.id });
  }

  const limit = Number(body.limit) || 50;
  const result = await replayOutbox(limit);
  return NextResponse.json({ ok: true, ...result });
}
