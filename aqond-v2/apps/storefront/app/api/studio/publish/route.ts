import { NextRequest, NextResponse } from 'next/server';
import { kongJson } from '@/lib/server/kongFetch';
import { addPost, listAffiliateLinks } from '@/lib/server/studioStore';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    author_id: authorId,
    media_id: mediaId,
    caption,
    product_id: productId,
    media_local: mediaLocal = false,
  } = body || {};

  if (!authorId || !caption) {
    return NextResponse.json({ error: 'author_id and caption required' }, { status: 400 });
  }

  if (productId) {
    const pins = await listAffiliateLinks(authorId);
    if (!pins.some((p) => p.product_id === productId)) {
      return NextResponse.json(
        { error: 'product_not_pinned', detail: 'ปักสินค้าใน Creator Studio ก่อนเผยแพร่' },
        { status: 409 },
      );
    }
  }

  let syncedFeed = false;
  let postId: string | undefined;

  const remote = await kongJson<any>('/api/v1/feed/v1/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      author_id: authorId,
      media_id: mediaId,
      caption,
      post_type: 'video',
    }),
  });

  if (remote?.post_id) {
    syncedFeed = true;
    postId = remote.post_id;
  }

  const post = await addPost({
    post_id: postId || `local-${Date.now().toString(36)}`,
    author_id: authorId,
    media_id: mediaId,
    caption,
    product_id: productId,
    media_local: !!mediaLocal,
    synced_feed: syncedFeed,
  });

  return NextResponse.json({
    ok: true,
    post,
    synced_feed: syncedFeed,
    mode: syncedFeed ? 'feed-svc' : 'local',
  });
}
