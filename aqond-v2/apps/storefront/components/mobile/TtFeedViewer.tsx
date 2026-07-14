'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { fetchMobileFeed, type FeedPost, type FeedSource } from '@/lib/feed';
import { useAuth } from '@/lib/auth';
import { feedPostToContext, useJarvisFeed } from '@/lib/jarvis/feedContext';
import { TtFeedSlide } from './TtFeedSlide';

type Tab = 'for-you' | 'following';

const SOURCE_LABEL: Record<FeedSource, string | null> = {
  feed: null,
  local: '📡 Local feed — sync feed-svc เมื่อ stack ขึ้น',
  mixed: '🔀 Feed + Local',
  demo: 'โหมดสาธิต — รัน seed-feed-videos.ps1 เพื่อวิดีโอจริง',
  empty: null,
};

export function TtFeedViewer() {
  const { auth } = useAuth();
  const { setFeedContext } = useJarvisFeed();
  const [tab, setTab] = useState<Tab>('for-you');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<FeedSource>('empty');
  const scrollerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (kind: Tab) => {
    setLoading(true);
    setActiveIdx(0);
    try {
      const data = await fetchMobileFeed(kind, auth);
      setPosts(data.posts);
      setSource(data.source);
    } catch {
      setPosts([]);
      setSource('empty');
    } finally {
      setLoading(false);
    }
  }, [auth]);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      const h = el.clientHeight || 1;
      const idx = Math.round(el.scrollTop / h);
      setActiveIdx(Math.max(0, Math.min(idx, posts.length - 1)));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [posts.length]);

  useEffect(() => {
    if (posts.length === 0) {
      setFeedContext(null);
      return;
    }
    setFeedContext(feedPostToContext(posts[activeIdx]));
  }, [posts, activeIdx, setFeedContext]);

  useEffect(() => () => setFeedContext(null), [setFeedContext]);

  const badge = SOURCE_LABEL[source];

  return (
    <div className="tt-feed-shell">
      <div className="tt-feed-tabs">
        <button
          type="button"
          className={tab === 'for-you' ? 'active' : ''}
          onClick={() => setTab('for-you')}
        >
          สำหรับคุณ
        </button>
        <button
          type="button"
          className={tab === 'following' ? 'active' : ''}
          onClick={() => setTab('following')}
        >
          กำลังติดตาม
        </button>
      </div>

      {loading && <p className="tt-feed-loading">กำลังโหลด...</p>}

      {!loading && posts.length === 0 && (
        <div className="tt-feed-empty">
          <p>ยังไม่มีวิดีโอ</p>
          <Link href="/m/studio" className="tt-link-accent">อัปโหลดจาก Creator Studio</Link>
        </div>
      )}

      {!loading && posts.length > 0 && (
        <>
          {badge && <p className="tt-feed-demo-badge">{badge}</p>}
          <div ref={scrollerRef} className="tt-feed-scroller">
            {posts.map((post, i) => (
              <TtFeedSlide key={post.id} post={post} active={i === activeIdx} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
