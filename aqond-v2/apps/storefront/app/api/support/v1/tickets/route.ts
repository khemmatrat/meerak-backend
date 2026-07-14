import { NextRequest, NextResponse } from 'next/server';
import { createSupportTicket } from '@/lib/server/supportTicketBridge';
import { parseSupportChannel, type SupportChannelCode } from '@/lib/supportChannel';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const channel = parseSupportChannel(body.channel || body.source) as SupportChannelCode;
    const userId = String(body.user_id || body.userId || 'guest');
    const subject = String(body.subject || 'ต้องการความช่วยเหลือ');
    const message = String(body.message || subject);
    if (!message.trim()) {
      return NextResponse.json({ ok: false, error: 'message_required' }, { status: 400 });
    }
    const result = await createSupportTicket({
      channel,
      userId,
      subject,
      message,
      category: body.category,
      email: body.email,
      full_name: body.full_name,
      phone: body.phone,
      order_id: body.order_id,
      merchant_id: body.merchant_id,
      shop_id: body.shop_id,
      job_id: body.job_id,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error('[support/v1/tickets POST]', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'support_ticket_create_failed' },
      { status: 500 },
    );
  }
}
