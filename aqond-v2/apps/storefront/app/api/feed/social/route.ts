import { NextRequest, NextResponse } from 'next/server';
import {
  addFeedComment,
  getFeedSocialState,
  recordFeedShare,
  toggleFeedLike,
  toggleFeedSave,
} from '@/lib/server/feedSocialStore';

export async function GET(req: NextRequest) {
  const postId = req.nextUrl.searchParams.get('post_id') || '';
  const userId = req.nextUrl.searchParams.get('user_id') || 'guest';
  if (!postId) {
    return NextResponse.json({ error: 'post_id required' }, { status: 400 });
  }
  const state = await getFeedSocialState(postId, userId);
  return NextResponse.json(state);
}

export async function POST(req: NextRequest) {
  let body: {
    action?: string;
    post_id?: string;
    user_id?: string;
    user_name?: string;
    text?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const action = body.action || '';
  const postId = body.post_id || '';
  const userId = body.user_id || 'guest';

  if (!postId) {
    return NextResponse.json({ error: 'post_id required' }, { status: 400 });
  }

  try {
    switch (action) {
      case 'like': {
        const result = await toggleFeedLike(postId, userId);
        return NextResponse.json(result);
      }
      case 'save': {
        const result = await toggleFeedSave(postId, userId);
        return NextResponse.json(result);
      }
      case 'comment': {
        const result = await addFeedComment(postId, userId, body.user_name || 'ผู้ใช้', body.text || '');
        return NextResponse.json(result);
      }
      case 'share': {
        const result = await recordFeedShare(postId);
        return NextResponse.json(result);
      }
      default:
        return NextResponse.json({ error: 'unknown_action' }, { status: 400 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'social_failed';
    if (msg === 'comment_empty') {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
