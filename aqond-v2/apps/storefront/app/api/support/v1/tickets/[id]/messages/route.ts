import { NextRequest, NextResponse } from 'next/server';
import {
  listSupportTicketMessages,
  postSupportTicketMessage,
} from '@/lib/server/supportTicketBridge';

export async function GET(
  _req: NextRequest,
  ctx: { params: { id: string } },
) {
  try {
    const ticketId = String(ctx.params.id || '');
    const messages = await listSupportTicketMessages(ticketId);
    return NextResponse.json({ ok: true, messages });
  } catch (e) {
    console.error('[support/v1/messages GET]', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'support_messages_load_failed' },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: { id: string } },
) {
  try {
    const ticketId = String(ctx.params.id || '');
    const body = await req.json();
    const message = String(body.message || '').trim();
    if (!message) {
      return NextResponse.json({ ok: false, error: 'message_required' }, { status: 400 });
    }
    const messages = await postSupportTicketMessage(ticketId, message);
    return NextResponse.json({ ok: true, messages });
  } catch (e) {
    console.error('[support/v1/messages POST]', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'support_message_send_failed' },
      { status: 500 },
    );
  }
}
