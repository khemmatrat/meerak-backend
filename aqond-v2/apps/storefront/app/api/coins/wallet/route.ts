import { NextRequest, NextResponse } from 'next/server';
import { getCoinWalletView } from '@/lib/server/coinWalletService';

export const dynamic = 'force-dynamic';

/** AQOND Coins wallet — balance + ledger (redeemable for video gen tokens). */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('user_id') || req.nextUrl.searchParams.get('buyer_id') || '';
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'user_id_required' }, { status: 400 });
  }

  const wallet = await getCoinWalletView(userId);
  return NextResponse.json({
    ok: true,
    user_id: userId,
    wallet,
    redeem: {
      video_token_rate: wallet.video_token_rate,
      video_tokens_available: wallet.video_tokens_available,
      note_th: `แลก ${wallet.video_token_rate} Coins = 1 Video Token (เร็วๆ นี้)`,
    },
  });
}
