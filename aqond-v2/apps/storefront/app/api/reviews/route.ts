import { NextRequest, NextResponse } from 'next/server';
import { kongBase } from '@/lib/server-env';
import { listReviewsForAuthor, listReviewsForProduct } from '@/lib/server/reviewStore';

export async function GET(req: NextRequest) {
  const authorId = req.nextUrl.searchParams.get('author_id') || req.nextUrl.searchParams.get('user_id');
  const productId = req.nextUrl.searchParams.get('product_id');
  const q = new URLSearchParams();
  if (authorId) q.set('author_id', authorId);
  if (productId) q.set('product_id', productId);
  if (!authorId && !productId) {
    return NextResponse.json({ error: 'author_id or product_id required' }, { status: 400 });
  }
  try {
    const res = await fetch(`${kongBase()}/api/v1/reviews/v1/reviews?${q}`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if ((data.reviews || []).length > 0) {
        return NextResponse.json(data, { status: res.status });
      }
    }
  } catch {
    /* fall through to local */
  }

  const reviews = authorId
    ? await listReviewsForAuthor(authorId)
    : productId
      ? await listReviewsForProduct(productId)
      : [];
  return NextResponse.json({ reviews });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  try {
    const res = await fetch(`${kongBase()}/api/v1/reviews/v1/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Aqond-Region': 'TH' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return NextResponse.json(data, { status: res.status });
    }
  } catch {
    /* fall through */
  }

  try {
    const { submitBuyerReview } = await import('@/lib/server/reviewService');
    const result = await submitBuyerReview({
      product_id: body.product_id,
      merchant_id: body.merchant_id,
      author_id: body.author_id,
      order_id: body.order_id,
      rating: Number(body.rating),
      title: body.title,
      body: body.body,
    });
    return NextResponse.json(
      { ok: true, review: result.review, coins_awarded: result.coins_awarded, wallet: result.wallet },
      { status: 201 },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'reviews_unavailable';
    return NextResponse.json({ error: msg }, { status: msg === 'review_duplicate' ? 409 : 503 });
  }
}
