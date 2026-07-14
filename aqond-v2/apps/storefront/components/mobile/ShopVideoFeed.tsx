'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TtFeedSlide } from '@/components/mobile/TtFeedSlide';
import { feedPostToContext, useJarvisFeed } from '@/lib/jarvis/feedContext';
import { shopVideosToFeedPosts } from '@/lib/shopVideoFeed';
import type { FeedPost } from '@/lib/feed';

type Props = {
  shopId: string;
};

export function ShopVideoFeed({ shopId }: Props) {
  const router = useRouter();
  const { setFeedContext } = useJarvisFeed();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [shopName, setShopName] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setActiveIdx(0);
    try {
      const res = await fetch(`/api/shop/${encodeURIComponent(shopId)}/detail`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || data.redirect) {
        setPosts([]);
        return;
      }
      setShopName(data.shop?.name || shopId);
      const mapped = shopVideosToFeedPosts(data.videos || [], data.shop, data.products || []);
      setPosts(mapped);
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    load();
  }, [load]);

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
    if (!posts.length) {
      setFeedContext(null);
      return;
    }
    setFeedContext(feedPostToContext(posts[activeIdx]));
  }, [posts, activeIdx, setFeedContext]);

  useEffect(() => () => setFeedContext(null), [setFeedContext]);

  return (
    <div className="tt-shop-video-feed">
      <div className="tt-shop-video-feed-top">
        <button type="button" className="tt-shop-video-feed-back" onClick={() => router.back()} aria-label="กลับ">
          ‹
        </button>
        <div className="tt-shop-video-feed-title">
          <strong>{shopName}</strong>
          <span>{posts.length} วิดีโอ · เลื่อนขึ้นลงเพื่อดูต่อ</span>
        </div>
      </div>

      <div className="tt-feed-shell tt-shop-video-feed-shell">
        {loading && <p className="tt-feed-loading">กำลังโหลดวิดีโอร้านค้า…</p>}

        {!loading && posts.length === 0 && (
          <div className="tt-feed-empty">
            <p>ร้านนี้ยังไม่มีวิดีโอ</p>
            <button type="button" className="tt-btn-primary" onClick={() => router.back()}>
              กลับหน้าร้าน
            </button>
          </div>
        )}

        {!loading && posts.length > 0 && (
          <div ref={scrollerRef} className="tt-feed-scroller">
            {posts.map((post, i) => (
              <TtFeedSlide key={post.id} post={post} active={i === activeIdx} shopId={shopId} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
