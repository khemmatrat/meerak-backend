import { NextRequest, NextResponse } from 'next/server';
import {
  addShopChatMessage,
  autoReplyForBuyerText,
  listShopChatMessages,
} from '@/lib/server/shopChatStore';

export async function GET(req: NextRequest, ctx: { params: { shopId: string } }) {
  const shopId = ctx.params.shopId;
  const buyerId = req.nextUrl.searchParams.get('buyer_id') || 'guest';
  try {
    const messages = await listShopChatMessages(shopId, buyerId);
    return NextResponse.json({ messages });
  } catch (e) {
    console.error('[shop-chat GET]', shopId, e);
    return NextResponse.json({ error: 'chat_load_failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: { params: { shopId: string } }) {
  const shopId = ctx.params.shopId;
  try {
    const body = await req.json();
    const buyerId = String(body.buyer_id || 'guest');
    const text = String(body.text || '').trim();
    const from = body.from === 'shop' ? 'shop' : body.from === 'ai' ? 'ai' : 'buyer';
    if (!text) {
      return NextResponse.json({ error: 'text_required' }, { status: 400 });
    }

    const buyerMsg = await addShopChatMessage(shopId, buyerId, from, text);
    const replies = [buyerMsg];

    if (from === 'buyer') {
      const aiText = autoReplyForBuyerText(text);
      const aiMsg = await addShopChatMessage(shopId, buyerId, 'ai', aiText);
      replies.push(aiMsg);
    }

    const messages = await listShopChatMessages(shopId, buyerId);
    return NextResponse.json({ messages, sent: replies });
  } catch (e) {
    console.error('[shop-chat POST]', shopId, e);
    return NextResponse.json({ error: 'chat_send_failed' }, { status: 500 });
  }
}
