import { getFeedViewerId } from '@/lib/feed';

export type FeedComment = {
  id: string;
  text: string;
  user: string;
  at: number;
};

export type FeedSocialState = {
  liked: boolean;
  saved: boolean;
  like_count: number;
  comment_count: number;
  share_count: number;
  comments: FeedComment[];
};

const LIKES_KEY = 'aqond_feed_likes';
const SAVES_KEY = 'aqond_feed_saves';

function viewerId(explicit?: string) {
  return explicit || getFeedViewerId();
}

function readLocalLikes(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(LIKES_KEY) || '{}');
  } catch {
    return {};
  }
}

function readLocalSaves(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(SAVES_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeLocalLike(postId: string, liked: boolean) {
  const map = readLocalLikes();
  if (liked) map[postId] = true;
  else delete map[postId];
  localStorage.setItem(LIKES_KEY, JSON.stringify(map));
}

function writeLocalSave(postId: string, saved: boolean) {
  const map = readLocalSaves();
  if (saved) map[postId] = true;
  else delete map[postId];
  localStorage.setItem(SAVES_KEY, JSON.stringify(map));
}

function mapComments(raw: Array<{ id: string; user_name?: string; text: string; at: string }>): FeedComment[] {
  return raw.map((c) => ({
    id: c.id,
    text: c.text,
    user: c.user_name || 'ผู้ใช้',
    at: new Date(c.at).getTime(),
  }));
}

function localFallbackState(postId: string): FeedSocialState {
  const liked = !!readLocalLikes()[postId];
  const saved = !!readLocalSaves()[postId];
  let base = 0;
  for (const c of postId) base += c.charCodeAt(0);
  return {
    liked,
    saved,
    like_count: (liked ? 1 : 0) + 80 + (base % 920),
    comment_count: 0,
    share_count: 0,
    comments: [],
  };
}

export async function fetchFeedSocial(postId: string, userId?: string): Promise<FeedSocialState> {
  const uid = viewerId(userId);
  try {
    const res = await fetch(
      `/api/feed/social?post_id=${encodeURIComponent(postId)}&user_id=${encodeURIComponent(uid)}`,
      { cache: 'no-store' },
    );
    if (!res.ok) return localFallbackState(postId);
    const data = await res.json();
    writeLocalLike(postId, !!data.liked);
    writeLocalSave(postId, !!data.saved);
    return {
      liked: !!data.liked,
      saved: !!data.saved,
      like_count: Number(data.like_count || 0),
      comment_count: Number(data.comment_count || 0),
      share_count: Number(data.share_count || 0),
      comments: mapComments(data.comments || []),
    };
  } catch {
    return localFallbackState(postId);
  }
}

export async function toggleLike(postId: string, userId?: string) {
  const uid = viewerId(userId);
  try {
    const res = await fetch('/api/feed/social', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'like', post_id: postId, user_id: uid }),
    });
    if (!res.ok) throw new Error('like_failed');
    const data = await res.json();
    writeLocalLike(postId, !!data.liked);
    return { liked: !!data.liked, like_count: Number(data.like_count || 0) };
  } catch {
    const liked = !readLocalLikes()[postId];
    writeLocalLike(postId, liked);
    const fb = localFallbackState(postId);
    return { liked, like_count: fb.like_count };
  }
}

export async function toggleSave(postId: string, userId?: string) {
  const uid = viewerId(userId);
  try {
    const res = await fetch('/api/feed/social', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', post_id: postId, user_id: uid }),
    });
    if (!res.ok) throw new Error('save_failed');
    const data = await res.json();
    writeLocalSave(postId, !!data.saved);
    return { saved: !!data.saved };
  } catch {
    const saved = !readLocalSaves()[postId];
    writeLocalSave(postId, saved);
    return { saved };
  }
}

export async function postComment(
  postId: string,
  text: string,
  userId?: string,
  userName = 'คุณ',
): Promise<{ comments: FeedComment[]; comment_count: number }> {
  const uid = viewerId(userId);
  const res = await fetch('/api/feed/social', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'comment',
      post_id: postId,
      user_id: uid,
      user_name: userName,
      text,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'comment_failed');
  }
  const data = await res.json();
  const comments = mapComments([data.comment, ...[]]);
  const full = await fetchFeedSocial(postId, uid);
  return { comments: full.comments, comment_count: full.comment_count };
}

/** @deprecated use fetchFeedSocial */
export function loadComments(postId: string): FeedComment[] {
  return [];
}

/** @deprecated use fetchFeedSocial */
export function isLiked(_postId: string): boolean {
  return false;
}

/** @deprecated use fetchFeedSocial */
export function isSaved(_postId: string): boolean {
  return false;
}

/** @deprecated use fetchFeedSocial */
export function likeCount(_postId: string): number {
  return 0;
}

/** @deprecated use postComment */
export function addComment(postId: string, text: string, user = 'คุณ'): FeedComment {
  return { id: `local-${Date.now()}`, text, user, at: Date.now() };
}

export async function sharePost(params: {
  title: string;
  productId?: string;
  creatorId?: string;
  postId: string;
  shopId?: string;
}): Promise<'shared' | 'copied' | 'failed'> {
  const ref = params.creatorId ? `?ref=${encodeURIComponent(params.creatorId)}` : '';
  let path = params.productId ? `/m/product/${params.productId}${ref}` : '/m/feed';
  if (params.shopId) {
    path = `/m/shop/${encodeURIComponent(params.shopId)}/videos`;
  }
  const url = typeof window !== 'undefined' ? `${window.location.origin}${path}` : path;
  const shareText = `${params.title}\n${url}`;

  try {
    await fetch('/api/feed/social', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'share', post_id: params.postId, user_id: viewerId() }),
    });
  } catch {
    /* count optional */
  }

  try {
    if (typeof navigator !== 'undefined' && navigator.share) {
      await navigator.share({ title: params.title, text: params.title, url });
      return 'shared';
    }
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') return 'failed';
  }

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareText);
      return 'copied';
    }
  } catch {
    /* fallback below */
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = shareText;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return 'copied';
  } catch {
    return 'failed';
  }
}
