import { NextRequest, NextResponse } from 'next/server';
import { submitBuyerReview } from '@/lib/server/reviewService';

export const dynamic = 'force-dynamic';

/** Submit product review (local store + optional upstream). */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }
  const {
    product_id,
    merchant_id,
    author_id,
    order_id,
    rating,
    title,
    body: reviewBody,
  } = body || {};

  if (!product_id || !merchant_id || !author_id || !order_id || !rating) {
    return NextResponse.json({ ok: false, error: 'missing_fields' }, { status: 400 });
  }

  try {
    const result = await submitBuyerReview({
      product_id: String(product_id),
      merchant_id: String(merchant_id),
      author_id: String(author_id),
      order_id: String(order_id),
      rating: Number(rating),
      title: title ? String(title) : undefined,
      body: reviewBody ? String(reviewBody) : undefined,
    });

    try {
      const { kongBase } = await import('@/lib/server-env');
      await fetch(`${kongBase()}/api/v1/reviews/v1/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Aqond-Region': 'TH' },
        body: JSON.stringify(body),
      });
    } catch {
      /* upstream optional in dev */
    }

    return NextResponse.json(
      {
        ok: true,
        review: result.review,
        coins_awarded: result.coins_awarded,
        wallet: {
          balance: result.wallet.balance,
          lifetime_earned: result.wallet.lifetime_earned,
        },
      },
      { status: 201 },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'submit_failed';
    const status = msg === 'review_duplicate' ? 409 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
