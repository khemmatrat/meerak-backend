'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { bffPost } from '@/lib/bff';
import { useAuth } from '@/lib/auth';
import { trackAffiliateClick } from '@/lib/affiliate';
import { captionText, type FeedPost } from '@/lib/feed';
import { formatCatalogPrice } from '@/lib/format';
import { TtFeedActions, TtFeedCommentSheet } from './TtFeedActions';
import { TtProductThumb } from './TtProductThumb';
import { TtVideoPlayer } from './TtVideoPlayer';

type Props = {
  post: FeedPost;
  active: boolean;
  shopId?: string;
};

export function TtFeedSlide({ post, active, shopId }: Props) {
  const router = useRouter();
  const { auth } = useAuth();
  const [buying, setBuying] = useState(false);
  const [msg, setMsg] = useState('');
  const [toast, setToast] = useState('');
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [socialTick, setSocialTick] = useState(0);

  const title = post.productTitle || captionText(post.caption);
  const priceMicro = post.priceMicro || 0;
  const hasAffiliate = !!(post.authorId && post.productId);

  const showToast = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(''), 2000);
  };

  const buy = async (checkout = false) => {
    if (!post.productId) return;
    setBuying(true);
    setMsg('');
    const owner = auth?.userId || 'guest';
    if (post.authorId) {
      await trackAffiliateClick({
        creatorId: post.authorId,
        productId: post.productId,
        postId: post.postId || post.id,
        buyerId: owner,
      });
    }
    try {
      await bffPost('/v1/cart/items', {
        owner_id: owner,
        product_id: post.productId,
        title,
        qty: 1,
        unit_price_micro: priceMicro,
        merchant_id: post.merchantId || 'demo-merchant',
        creator_id: post.authorId,
        affiliate: hasAffiliate,
        source: 'feed',
        post_id: post.postId || post.id,
      }, auth);
      if (checkout) {
        router.push('/m/checkout');
        return;
      }
      setMsg(hasAffiliate ? 'ใส่รถเข็นแล้ว · ร้านได้เครดิต Affiliate ✓' : 'ใส่รถเข็นแล้ว ✓');
    } catch (e: any) {
      setMsg(e.message || 'ไม่สำเร็จ');
    } finally {
      setBuying(false);
    }
  };

  return (
    <section className="tt-feed-slide">
      <TtVideoPlayer
        src={post.manifestUrl}
        posterEmoji={post.posterEmoji}
        active={active}
      />

      <div className="tt-feed-gradient" aria-hidden />

      <TtFeedActions
        post={post}
        shopId={shopId}
        refreshKey={socialTick}
        onCommentOpen={() => setCommentsOpen(true)}
        onToast={showToast}
      />

      <div className="tt-feed-meta">
        <p className="tt-feed-caption">@{post.authorId || 'creator'}</p>
        <p className="tt-feed-caption-sub">{captionText(post.caption)}</p>
        {hasAffiliate && (
          <span className="tt-feed-affiliate-badge">🛒 ปักตะกร้า Affiliate</span>
        )}
      </div>

      {post.productId && (
        <div className="tt-feed-pin">
          <Link href={`/m/product/${post.productId}${post.authorId ? `?ref=${post.authorId}` : ''}`} className="tt-feed-pin-main">
            <TtProductThumb
              category={post.category}
              title={title}
              className="tt-feed-pin-thumb"
            />
            <div className="tt-feed-pin-info">
              <p className="tt-feed-pin-title">{title}</p>
              <p className="tt-feed-pin-price">{formatCatalogPrice(priceMicro)}</p>
            </div>
          </Link>
          <div className="tt-feed-pin-actions">
            <button
              type="button"
              className="tt-btn-sm tt-feed-buy"
              disabled={buying}
              onClick={() => buy(false)}
            >
              รถเข็น
            </button>
            <button
              type="button"
              className="tt-btn-primary tt-feed-buy-now"
              disabled={buying}
              onClick={() => buy(true)}
            >
              ซื้อเลย
            </button>
          </div>
          {msg && <p className="tt-feed-msg">{msg}</p>}
        </div>
      )}

      {toast && <p className="tt-feed-toast">{toast}</p>}

      <TtFeedCommentSheet
        post={post}
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        onCommentAdded={() => setSocialTick((n) => n + 1)}
      />
    </section>
  );
}
