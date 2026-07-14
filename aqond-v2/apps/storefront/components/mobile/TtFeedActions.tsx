'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FeedPost } from '@/lib/feed';
import { useAuth } from '@/lib/auth';
import {
  fetchFeedSocial,
  postComment,
  sharePost,
  toggleLike,
  toggleSave,
  type FeedComment,
} from '@/lib/feedSocial';

type Props = {
  post: FeedPost;
  shopId?: string;
  refreshKey?: number;
  onCommentOpen: () => void;
  onToast: (msg: string) => void;
};

export function TtFeedActions({ post, shopId, refreshKey = 0, onCommentOpen, onToast }: Props) {
  const { auth } = useAuth();
  const userId = auth?.userId;
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [likes, setLikes] = useState(0);
  const [comments, setComments] = useState(0);
  const [shares, setShares] = useState(0);
  const [busy, setBusy] = useState('');

  const reload = useCallback(async () => {
    const state = await fetchFeedSocial(post.id, userId);
    setLiked(state.liked);
    setSaved(state.saved);
    setLikes(state.like_count);
    setComments(state.comment_count);
    setShares(state.share_count);
  }, [post.id, userId]);

  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);

  const onLike = async () => {
    if (busy) return;
    setBusy('like');
    try {
      const result = await toggleLike(post.id, userId);
      setLiked(result.liked);
      setLikes(result.like_count);
      onToast(result.liked ? 'ถูกใจแล้ว ❤️' : 'ยกเลิกถูกใจ');
    } finally {
      setBusy('');
    }
  };

  const onSave = async () => {
    if (busy) return;
    setBusy('save');
    try {
      const result = await toggleSave(post.id, userId);
      setSaved(result.saved);
      onToast(result.saved ? 'บันทึกแล้ว ✓' : 'ยกเลิกบันทึก');
    } finally {
      setBusy('');
    }
  };

  const onShare = async () => {
    if (busy) return;
    setBusy('share');
    try {
      const result = await sharePost({
        title: post.productTitle || post.caption,
        productId: post.productId,
        creatorId: post.authorId,
        postId: post.id,
        shopId,
      });
      if (result === 'shared') {
        setShares((n) => n + 1);
        onToast('แชร์แล้ว ✓');
      } else if (result === 'copied') {
        setShares((n) => n + 1);
        onToast('คัดลอกลิงก์แล้ว ✓');
      } else {
        onToast('แชร์ไม่สำเร็จ — ลองอีกครั้ง');
      }
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="tt-feed-rail">
      <button
        type="button"
        className={`tt-feed-action${liked ? ' tt-feed-action-on' : ''}`}
        aria-label="ถูกใจ"
        disabled={!!busy}
        onClick={() => void onLike()}
      >
        <span aria-hidden>{liked ? '❤️' : '🤍'}</span>
        <span className="tt-feed-action-count">{likes > 999 ? `${(likes / 1000).toFixed(1)}k` : likes}</span>
      </button>
      <button
        type="button"
        className="tt-feed-action"
        aria-label="ความคิดเห็น"
        onClick={onCommentOpen}
      >
        <span aria-hidden>💬</span>
        <span className="tt-feed-action-count">{comments}</span>
      </button>
      <button
        type="button"
        className="tt-feed-action"
        aria-label="แชร์"
        disabled={!!busy}
        onClick={() => void onShare()}
      >
        <span aria-hidden>↗️</span>
        <span className="tt-feed-action-count">{shares > 0 ? shares : 'แชร์'}</span>
      </button>
      <button
        type="button"
        className={`tt-feed-action${saved ? ' tt-feed-action-on' : ''}`}
        aria-label="บันทึก"
        disabled={!!busy}
        onClick={() => void onSave()}
      >
        <span aria-hidden>{saved ? '🔖' : '📑'}</span>
        <span className="tt-feed-action-count">{saved ? 'แล้ว' : 'บันทึก'}</span>
      </button>
    </div>
  );
}

type SheetProps = {
  post: FeedPost;
  open: boolean;
  onClose: () => void;
  onCommentAdded?: () => void;
};

export function TtFeedCommentSheet({ post, open, onClose, onCommentAdded }: SheetProps) {
  const { auth, user } = useAuth();
  const userName = user?.name || user?.phone || auth?.userId || 'คุณ';
  const userId = auth?.userId;
  const [text, setText] = useState('');
  const [items, setItems] = useState<FeedComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    document.body.classList.add('tt-modal-open');
    setLoading(true);
    setErr('');
    fetchFeedSocial(post.id, userId)
      .then((state) => setItems(state.comments))
      .finally(() => setLoading(false));
    return () => document.body.classList.remove('tt-modal-open');
  }, [open, post.id, userId]);

  if (!open) return null;

  const submit = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setErr('');
    try {
      const result = await postComment(post.id, body, userId, userName);
      setItems(result.comments);
      setText('');
      onCommentAdded?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'ส่งคอมเมนต์ไม่สำเร็จ');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="tt-modal-backdrop" onClick={onClose} role="presentation">
      <div className="tt-modal-sheet tt-feed-comment-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="tt-modal-handle" />
        <h3 className="tt-modal-title">ความคิดเห็น ({items.length})</h3>
        <div className="tt-feed-comment-list">
          {loading && <p className="tt-hint">กำลังโหลด…</p>}
          {!loading && items.length === 0 && (
            <p className="tt-hint">ยังไม่มีคอมเมนต์ — เป็นคนแรก!</p>
          )}
          {items.map((c) => (
            <div key={c.id} className="tt-feed-comment-item">
              <strong>{c.user}</strong>
              <p>{c.text}</p>
            </div>
          ))}
        </div>
        {err && <p className="tt-error" style={{ padding: '0 16px' }}>{err}</p>}
        <div className="tt-feed-comment-input-row">
          <input
            className="tt-input"
            placeholder="แสดงความคิดเห็น..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
            disabled={sending}
          />
          <button type="button" className="tt-btn-sm" disabled={sending || !text.trim()} onClick={() => void submit()}>
            {sending ? '…' : 'ส่ง'}
          </button>
        </div>
      </div>
    </div>
  );
}
