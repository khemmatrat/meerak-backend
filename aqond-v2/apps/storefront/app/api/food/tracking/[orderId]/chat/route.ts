import { NextRequest, NextResponse } from 'next/server';
import { shouldUseDispatchFallback, submitDispatchChat } from '@/lib/server/dispatchSvc';
import { addChatMessage } from '@/lib/server/riderTracking';

export async function POST(
  req: NextRequest,
  ctx: { params: { orderId: string } },
) {
  try {
    const body = await req.json();
    const text = String(body.text || body.message || '').trim();
    if (!text) {
      return NextResponse.json({ error: 'text required' }, { status: 400 });
    }
    const from = body.from === 'rider' ? 'rider' : 'customer';

    const dispatch = await submitDispatchChat(ctx.params.orderId, { from, text });
    if (dispatch) return NextResponse.json(dispatch);

    const tracking = await addChatMessage(ctx.params.orderId, text, from);
    if (!tracking) {
      if (!shouldUseDispatchFallback()) {
        return NextResponse.json({ error: 'tracking_not_found' }, { status: 404 });
      }
      return NextResponse.json({ error: 'tracking_not_found' }, { status: 404 });
    }
    return NextResponse.json(tracking);
  } catch (err) {
    console.error('[chat]', ctx.params.orderId, err);
    return NextResponse.json({ error: 'chat_failed' }, { status: 500 });
  }
}
