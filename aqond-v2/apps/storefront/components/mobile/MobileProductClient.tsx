'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { bffPost } from '@/lib/bff';
import { useAuth } from '@/lib/auth';
import { markCartScope, resolveCartOwnerId } from '@/lib/cartOwner';
import { formatCatalogPrice } from '@/lib/format';
import type { PdpMedia, PdpVariant } from '@/lib/pdpMeta';
import { dispatchCartUpdated, type ShopCartSummary } from '@/lib/shopCart';
import { useShopCart } from '@/lib/useShopCart';
import { recordCartAddTelemetry, recordProductTelemetry } from '@/lib/experience/scenarioTelemetry';
import { PdpBuySheet } from '@/components/mobile/PdpBuySheet';
import { IconLuxCart, IconLuxChat, IconLuxSearch } from '@/components/mobile/TtLuxuryIcons';

type PdpDetail = {
  product: {
    id: string;
    title: string;
    description?: string;
    price_micro: number;
    merchant_id?: string;
    sold_count?: number;
    image_url?: string;
  };
  media: PdpMedia[];
  variants: PdpVariant[];
  discount: { list_price_micro?: number; discount_pct: number; label: string };
  promo: { coupon_label: string; coupon_pct: number; vip_price_micro?: number };
  shipping: { free: boolean; label: string; late_discount_thb: number };
  shop: {
    id: string;
    name: string;
    rating: number;
    product_count: number;
    response_rate: number;
    province: string;
  };
  reviews: {
    avg_rating: number;
    count: number;
    items: Array<{ id?: string; body?: string; rating?: number; verified_purchase?: boolean }>;
    filter_tags: Array<{ label: string; count: number }>;
    ai_summary: string[];
  };
  related: Array<{ id: string; title: string; price_micro: number; image_url?: string }>;
  recommendations: Array<{ id: string; title: string; price_micro: number; image_url?: string; category?: string }>;
  live?: {
    active: boolean;
    room_id?: string;
    preview_url?: string;
    stream_url?: string;
    title?: string;
  };
  video?: {
    url: string;
    poster?: string;
    media_id?: string;
    has_file: boolean;
  };
  attributes: Array<{ label: string; value: string }>;
};

type Props = {
  id: string;
  title: string;
  priceMicro: number;
  category: string;
  description?: string;
  merchantId?: string;
  imageUrl?: string;
};

const SWATCH = ['#1f2937', '#ec4899', '#f8fafc', '#a855f7', '#059669'];

export function MobileProductClient(props: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { auth } = useAuth();
  const embed = searchParams.get('embed') === '1';
  const [detail, setDetail] = useState<PdpDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [mediaIdx, setMediaIdx] = useState(0);
  const [variantIdx, setVariantIdx] = useState(0);
  const [descOpen, setDescOpen] = useState(false);
  const [couponTaken, setCouponTaken] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [liveClosed, setLiveClosed] = useState(false);
  const [pipPos, setPipPos] = useState({ x: 12, y: 120 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);
  const galleryTouchX = useRef(0);
  const galleryVideoRef = useRef<HTMLVideoElement>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [showTop, setShowTop] = useState(false);
  const [buySheet, setBuySheet] = useState<'buy' | 'cart' | null>(null);
  const [sheetVariantIdx, setSheetVariantIdx] = useState(0);
  const [qty, setQty] = useState(1);
  const { count: cartCount, optimisticBump } = useShopCart();

  useEffect(() => {
    const t0 = performance.now();
    fetch(`/api/product/${encodeURIComponent(props.id)}/detail`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setDetail(d);
        recordProductTelemetry({
          loadMs: Math.round(performance.now() - t0),
          productId: props.id,
          hasDetail: Boolean(d?.product?.title),
          error: d ? null : 'detail_missing',
        });
      })
      .catch(() => {
        setDetail(null);
        recordProductTelemetry({
          loadMs: Math.round(performance.now() - t0),
          productId: props.id,
          hasDetail: false,
          error: 'detail_fetch_failed',
        });
      })
      .finally(() => setLoading(false));
  }, [props.id]);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 480);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const product = detail?.product;
  const variants = detail?.variants?.length
    ? detail.variants
    : [{ id: props.id, label: 'ตัวเลือก', value: 'มาตรฐาน', price_micro: props.priceMicro }];
  const selected = variants[variantIdx] || variants[0];
  const media = detail?.media?.length
    ? detail.media
    : props.imageUrl
      ? [{ type: 'image' as const, url: props.imageUrl }]
      : [];
  const currentMedia = media[mediaIdx] || media[0];
  const title = product?.title || props.title;
  const priceMicro = selected?.price_micro || product?.price_micro || props.priceMicro;
  const merchantId = product?.merchant_id || props.merchantId;

  const displayImage =
    selected.image_url ||
    (currentMedia?.type === 'image' ? currentMedia.url : undefined) ||
    media.find((m) => m.type === 'image')?.url ||
    props.imageUrl;

  const videoUrl =
    (currentMedia?.type === 'video' ? currentMedia.url : '') ||
    detail?.video?.url ||
    media.find((m) => m.type === 'video')?.url ||
    '';
  const videoPoster =
    detail?.video?.poster ||
    (currentMedia?.type === 'image' ? currentMedia.url : undefined) ||
    displayImage ||
    props.imageUrl ||
    '';
  const liveActive = detail?.live?.active ?? !!videoUrl;
  const livePreview = detail?.live?.preview_url || videoPoster;
  const liveRoom = detail?.live?.room_id || `live-${merchantId || 'shop'}`;
  const showingVideo = videoOpen || currentMedia?.type === 'video';
  const chatShopId = detail?.shop?.id || merchantId || 'demo-merchant';
  const chatHref = useMemo(() => {
    const q = new URLSearchParams({
      productId: props.id,
      productTitle: title,
      priceMicro: String(priceMicro),
    });
    if (displayImage) q.set('imageUrl', displayImage);
    if (embed) q.set('embed', '1');
    return `/m/chat/${encodeURIComponent(chatShopId)}?${q.toString()}`;
  }, [chatShopId, props.id, title, priceMicro, displayImage, embed]);

  const openVideo = () => {
    if (videoUrl) {
      const vi = media.findIndex((m) => m.type === 'video');
      if (vi >= 0) setMediaIdx(vi);
      setVideoOpen(true);
    } else {
      setVideoOpen(true);
    }
  };

  const openLive = () => {
    setLiveClosed(false);
    if (!liveActive) {
      router.push(`/m/live/${liveRoom}`);
    }
  };

  useEffect(() => {
    if (media[mediaIdx]?.type === 'video') setVideoOpen(true);
    else setVideoOpen(false);
  }, [mediaIdx, media]);

  useEffect(() => {
    const el = galleryVideoRef.current;
    if (!el) return;
    const onVideoSlide = showingVideo && videoUrl && currentMedia?.type === 'video';
    if (!onVideoSlide) {
      el.pause();
      return;
    }
    el.currentTime = 0;
    const playPromise = el.play();
    if (playPromise) {
      playPromise.catch(() => {
        /* autoplay blocked until user gesture */
      });
    }
  }, [showingVideo, videoUrl, currentMedia?.type, mediaIdx]);

  const onGalleryTouchStart = (e: React.TouchEvent) => {
    galleryTouchX.current = e.touches[0]?.clientX ?? 0;
  };

  const onGalleryTouchEnd = (e: React.TouchEvent) => {
    const endX = e.changedTouches[0]?.clientX ?? 0;
    const dx = endX - galleryTouchX.current;
    if (Math.abs(dx) < 48 || media.length < 2) return;
    if (dx < 0 && mediaIdx < media.length - 1) setMediaIdx((i) => i + 1);
    if (dx > 0 && mediaIdx > 0) setMediaIdx((i) => i - 1);
  };

  useEffect(() => {
    if (!buySheet) {
      document.body.classList.remove('tt-modal-open');
      return;
    }
    setSheetVariantIdx(variantIdx);
    setQty(1);
    setError('');
    document.body.classList.add('tt-modal-open');
    return () => document.body.classList.remove('tt-modal-open');
  }, [buySheet, variantIdx]);

  const sheetSelected = variants[sheetVariantIdx] || variants[0];
  const sheetPriceMicro = sheetSelected?.price_micro || priceMicro;
  const sheetImage =
    sheetSelected?.image_url || displayImage || product?.image_url || props.imageUrl;
  const sheetListPrice =
    detail?.discount?.list_price_micro ||
    (detail?.discount?.discount_pct
      ? Math.round((sheetPriceMicro * (100 + detail.discount.discount_pct)) / 100)
      : undefined);

  const onPipDown = (e: React.PointerEvent) => {
    setDragging(true);
    dragRef.current = { sx: e.clientX, sy: e.clientY, px: pipPos.x, py: pipPos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPipMove = (e: React.PointerEvent) => {
    if (!dragging || !dragRef.current) return;
    const dx = e.clientX - dragRef.current.sx;
    const dy = e.clientY - dragRef.current.sy;
    setPipPos({
      x: Math.max(4, Math.min(window.innerWidth - 120, dragRef.current.px + dx)),
      y: Math.max(64, Math.min(window.innerHeight - 200, dragRef.current.py + dy)),
    });
  };
  const onPipUp = () => setDragging(false);

  const addToCart = useCallback(
    async (goCheckout = false, options?: { variantIdx?: number; qty?: number }) => {
      const vi = options?.variantIdx ?? variantIdx;
      const v = variants[vi] || variants[0];
      const q = options?.qty ?? 1;
      const unitPrice = v?.price_micro || priceMicro;
      setAdding(true);
      setError('');
      setOk('');
      const owner = resolveCartOwnerId(auth?.userId);
      const payload = {
        owner_id: owner,
        product_id: props.id,
        variant_id: v.id,
        title: `${title} (${v.value})`,
        qty: q,
        unit_price_micro: unitPrice,
        merchant_id: merchantId || 'demo-merchant',
      };

      const addLocal = async () => {
        const res = await fetch('/api/cart/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'เพิ่มรถเข็นไม่สำเร็จ');
        }
        return res.json() as Promise<ShopCartSummary>;
      };

      const t0 = performance.now();
      optimisticBump(q);
      markCartScope('shop');
      try {
        let cartSummary: ShopCartSummary;
        try {
          cartSummary = await bffPost<ShopCartSummary>('/v1/cart/items', payload, auth);
        } catch {
          cartSummary = await addLocal();
        }
        dispatchCartUpdated({
          items: (cartSummary.items || []).map((it) => ({
            ...it,
            line_micro: it.line_micro ?? (it.unit_price_micro || 0) * (it.qty || 1),
          })),
          count: cartSummary.count ?? 1,
          item_qty_total: cartSummary.item_qty_total ?? q,
          total_micro: cartSummary.total_micro ?? 0,
        });
        recordCartAddTelemetry({
          loadMs: Math.round(performance.now() - t0),
          productId: props.id,
          cartCount: cartSummary.count,
          qty: q,
        });
        setVariantIdx(vi);
        setBuySheet(null);
        if (goCheckout) {
          router.push('/m/checkout');
          return;
        }
        setOk('ใส่รถเข็นแล้ว ✓');
      } catch (e: unknown) {
        recordCartAddTelemetry({
          loadMs: Math.round(performance.now() - t0),
          productId: props.id,
          error: e instanceof Error ? e.message : 'cart_add_failed',
        });
        setError(e instanceof Error ? e.message : 'เพิ่มรถเข็นไม่สำเร็จ');
      } finally {
        setAdding(false);
      }
    },
    [auth, merchantId, priceMicro, props.id, optimisticBump, router, title, variantIdx, variants],
  );

  const confirmBuySheet = () => {
    void addToCart(buySheet === 'buy', { variantIdx: sheetVariantIdx, qty });
  };

  return (
    <div className="tt-pdp-pro">
      <header className="tt-pdp-pro-header">
        <Link href="/m/home" className="tt-pdp-pro-back" aria-label="กลับ">
          ‹
        </Link>
        <div className="tt-pdp-pro-search">
          <span className="tt-pdp-pro-search-icon" aria-hidden>
            <IconLuxSearch size={18} />
          </span>
          <span className="tt-pdp-pro-search-text">{title.slice(0, 28)}</span>
        </div>
        <div className="tt-pdp-pro-header-actions">
          <button type="button" className="tt-pdp-pro-icon" aria-label="แชร์">
            ↗
          </button>
          <Link href="/m/cart" className="tt-pdp-pro-icon tt-pdp-pro-cart tt-mp-tool-wrap" aria-label="รถเข็น">
            <IconLuxCart size={22} />
            {cartCount > 0 ? (
              <em className="tt-mp-tool-badge" data-testid="cart-count-badge">
                {cartCount > 99 ? '99+' : cartCount}
              </em>
            ) : null}
          </Link>
        </div>
      </header>

      <section
        className="tt-pdp-pro-gallery"
        data-testid="pdp-gallery"
        onTouchStart={onGalleryTouchStart}
        onTouchEnd={onGalleryTouchEnd}
      >
        {showingVideo && videoUrl ? (
          <video
            ref={galleryVideoRef}
            key={`${videoUrl}-${mediaIdx}`}
            data-testid="pdp-gallery-video"
            src={videoUrl}
            poster={videoPoster}
            className="tt-pdp-pro-gallery-img"
            controls
            playsInline
            muted
            loop
            autoPlay
          />
        ) : displayImage ? (
          <img src={displayImage} alt={title} className="tt-pdp-pro-gallery-img" />
        ) : (
          <div className="tt-pdp-pro-gallery-placeholder">📦</div>
        )}

        <div className="tt-pdp-pro-media-rail" aria-label="สื่อวิดีโอและไลฟ์">
          <button
            type="button"
            data-testid="pdp-rail-video"
            className={`tt-pdp-pro-rail-video${showingVideo ? ' active' : ''}`}
            onClick={openVideo}
            aria-label="วิดีโอสินค้า"
          >
            {videoPoster ? (
              <img src={videoPoster} alt="" className="tt-pdp-pro-rail-thumb" />
            ) : (
              <span className="tt-pdp-pro-rail-thumb tt-pdp-pro-rail-thumb--empty">▶</span>
            )}
            <span className="tt-pdp-pro-rail-play">▶</span>
            <span className="tt-pdp-pro-rail-label">Video</span>
          </button>

          <button
            type="button"
            className={`tt-pdp-pro-rail-live${liveActive ? ' active' : ''}`}
            onClick={openLive}
            aria-label="ไลฟ์ร้านค้า"
          >
            {livePreview ? (
              <img src={livePreview} alt="" className="tt-pdp-pro-rail-thumb" />
            ) : (
              <span className="tt-pdp-pro-rail-thumb tt-pdp-pro-rail-thumb--empty">🔴</span>
            )}
            <span className="tt-pdp-pro-rail-live-badge">LIVE</span>
          </button>
        </div>

        <div className="tt-pdp-pro-gallery-badges">
          {detail?.shipping?.free !== false && (
            <span className="tt-pdp-pro-badge tt-pdp-pro-badge--ship">FREE ส่งฟรี</span>
          )}
          {detail?.discount?.label && (
            <span className="tt-pdp-pro-badge tt-pdp-pro-badge--sale">{detail.discount.label}</span>
          )}
        </div>

        {media.length > 1 && (
          <span className="tt-pdp-pro-gallery-count tt-pdp-pro-gallery-count--rail">
            {mediaIdx + 1}/{media.length}
          </span>
        )}

        {media.length > 1 && (
          <div className="tt-pdp-pro-gallery-dots" data-testid="pdp-gallery-dots">
            {media.map((m, i) => (
              <button
                key={`${m.url}-${i}`}
                type="button"
                className={i === mediaIdx ? 'on' : ''}
                onClick={() => setMediaIdx(i)}
                aria-label={`สื่อ ${i + 1}`}
              />
            ))}
          </div>
        )}
      </section>

      {variants.length > 0 && (
        <section className="tt-pdp-pro-variants">
          <p className="tt-pdp-pro-variants-label">{variants.length} ตัวเลือกสินค้า</p>
          <div className="tt-pdp-pro-variant-row">
            {variants.map((v, i) => (
              <button
                key={`${v.id}-${i}`}
                type="button"
                className={`tt-pdp-pro-variant-thumb${i === variantIdx ? ' active' : ''}`}
                onClick={() => {
                  setVariantIdx(i);
                  if (v.image_url) {
                    const mi = media.findIndex((m) => m.url === v.image_url);
                    if (mi >= 0) setMediaIdx(mi);
                  }
                }}
              >
                {v.image_url ? (
                  <img src={v.image_url} alt={v.value} />
                ) : (
                  <span style={{ background: SWATCH[i % SWATCH.length] }} />
                )}
              </button>
            ))}
          </div>
          <p className="tt-pdp-pro-variant-pick">
            {selected.label}: <strong>{selected.value}</strong>
          </p>
        </section>
      )}

      <section className="tt-pdp-pro-price-block">
        <div className="tt-pdp-pro-price-row">
          <strong className="tt-pdp-pro-price">{formatCatalogPrice(priceMicro)}</strong>
          {detail?.discount?.list_price_micro ? (
            <span className="tt-pdp-pro-list-price">
              {formatCatalogPrice(detail.discount.list_price_micro)}
            </span>
          ) : null}
          <span className="tt-pdp-pro-sold">
            ขายแล้ว {product?.sold_count ? `${Math.floor(product.sold_count / 100) || product.sold_count}${product.sold_count >= 1000 ? 'k+' : ''}` : '—'} ชิ้น
          </span>
        </div>
        <h1 className="tt-pdp-pro-title">{title}</h1>
      </section>

      <section className="tt-pdp-pro-coupon">
        <div>
          <span className="tt-pdp-pro-coupon-tag">คูปอง</span>
          <strong>{detail?.promo?.coupon_label || 'ส่วนลดร้านค้า'}</strong>
          <p>ลด {detail?.promo?.coupon_pct || 10}% เมื่อซื้อครบตามเงื่อนไข</p>
        </div>
        <button type="button" className={couponTaken ? 'taken' : ''} onClick={() => setCouponTaken(true)}>
          {couponTaken ? 'เก็บแล้ว' : 'เก็บ'}
        </button>
      </section>

      {detail?.promo?.vip_price_micro ? (
        <p className="tt-pdp-pro-vip">
          👑 ซื้อสินค้านี้ในราคา {formatCatalogPrice(detail.promo.vip_price_micro)} ด้วย AQOND VIP
        </p>
      ) : null}

      <section className="tt-pdp-pro-ship-row">
        <span>🚚</span>
        <div>
          <strong>{detail?.shipping?.label || '2-4 วันทำการ'}</strong>
          <p>
            {detail?.shipping?.free ? 'ส่งฟรี' : 'ค่าส่งตามร้าน'} · หากส่งช้า รับส่วนลด ฿
            {detail?.shipping?.late_discount_thb || 30}
          </p>
        </div>
        <span className="tt-pdp-pro-chevron">›</span>
      </section>

      <section className="tt-pdp-pro-trust-row">
        <span>💵 เก็บเงินปลายทาง</span>
        <span>💳 ผ่อน 0%</span>
        <span>🏆 ขายดี</span>
      </section>

      {detail?.reviews?.avg_rating > 0 && (
        <section className="tt-pdp-pro-rating">
          <strong>★ {detail.reviews.avg_rating.toFixed(1)}</strong>
          <span>({detail.reviews.count} รีวิว)</span>
        </section>
      )}

      {detail?.reviews?.ai_summary?.length ? (
        <section className="tt-pdp-pro-ai">
          <p className="tt-pdp-pro-ai-label">✨ สรุปโดย AI</p>
          <ul>
            {detail.reviews.ai_summary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {media.length > 0 && (
        <section className="tt-pdp-pro-media-row">
          <p className="tt-pdp-pro-section-title">รูป & วิดีโอสินค้า</p>
          <div className="tt-pdp-pro-media-scroll">
            {media.map((m, i) => (
              <button
                key={`${m.url}-${i}`}
                type="button"
                className="tt-pdp-pro-media-item"
                onClick={() => setMediaIdx(i)}
              >
                {m.type === 'video' ? (
                  <span className="tt-pdp-pro-play">▶</span>
                ) : (
                  <img src={m.url} alt="" />
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      {detail?.reviews?.filter_tags?.length ? (
        <section className="tt-pdp-pro-review-tags">
          <p className="tt-pdp-pro-section-title">รีวิวจากลูกค้า</p>
          <div className="tt-pdp-pro-chip-row">
            {detail.reviews.filter_tags.map((t) => (
              <span key={t.label} className="tt-pdp-pro-chip">
                {t.label} ({t.count})
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {detail?.shop && (
        <section className="tt-pdp-pro-shop">
          <div className="tt-pdp-pro-shop-top">
            <div className="tt-pdp-pro-shop-avatar">{detail.shop.name.slice(0, 1)}</div>
            <div>
              <strong>{detail.shop.name}</strong>
              <p>ออนไลน์ล่าสุด · {detail.shop.province}</p>
            </div>
            <Link href={`/m/shop/${detail.shop.id}`} className="tt-pdp-pro-shop-btn">
              ดูร้านค้า
            </Link>
          </div>
          <div className="tt-pdp-pro-shop-stats">
            <div>
              <strong>{detail.shop.rating.toFixed(1)}</strong>
              <span>คะแนน</span>
            </div>
            <div>
              <strong>{detail.shop.product_count}</strong>
              <span>สินค้า</span>
            </div>
            <div>
              <strong>{detail.shop.response_rate}%</strong>
              <span>ตอบแชท</span>
            </div>
          </div>
        </section>
      )}

      {detail?.related?.length ? (
        <section className="tt-pdp-pro-related">
          <p className="tt-pdp-pro-section-title">จากร้านเดียวกัน</p>
          <div className="tt-pdp-pro-related-scroll">
            {detail.related.map((p) => (
              <Link key={p.id} href={`/m/product/${p.id}`} className="tt-pdp-pro-related-card">
                {p.image_url ? <img src={p.image_url} alt="" /> : <span>📦</span>}
                <p>{p.title}</p>
                <strong>{formatCatalogPrice(p.price_micro)}</strong>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="tt-pdp-pro-attrs">
        <p className="tt-pdp-pro-section-title">คุณลักษณะ</p>
        {(detail?.attributes || []).map((a) => (
          <div key={a.label} className="tt-pdp-pro-attr-row">
            <span>{a.label}</span>
            <span>{a.value}</span>
          </div>
        ))}
      </section>

      <section className="tt-pdp-pro-desc">
        <p className="tt-pdp-pro-section-title">รายละเอียด</p>
        <p className={descOpen ? 'open' : ''}>
          {product?.description || props.description || 'สินค้าคุณภาพจากร้านค้าใน marketplace'}
        </p>
        <button type="button" onClick={() => setDescOpen((v) => !v)}>
          {descOpen ? 'ย่อ' : 'เพิ่มเติม'} {descOpen ? '▴' : '▾'}
        </button>
      </section>

      {detail?.recommendations?.length ? (
        <section className="tt-pdp-pro-reco">
          <p className="tt-pdp-pro-section-title">คุณอาจจะชอบสิ่งนี้</p>
          <div className="tt-pdp-pro-reco-grid">
            {detail.recommendations.map((p) => (
              <Link key={p.id} href={`/m/product/${p.id}`} className="tt-pdp-pro-reco-card">
                {p.image_url ? <img src={p.image_url} alt="" /> : <span>📦</span>}
                <p>{p.title}</p>
                <strong>{formatCatalogPrice(p.price_micro)}</strong>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {error && <p className="tt-error tt-pdp-pro-msg" role="alert">{error}</p>}
      {ok && <p className="tt-warn tt-pdp-pro-msg" role="status" aria-live="polite">{ok}</p>}

      <div className="tt-pdp-pro-spacer" />

      {liveActive && !liveClosed && (
        <div
          className="tt-pdp-pro-pip"
          style={{ right: pipPos.x, top: pipPos.y }}
          onPointerDown={onPipDown}
          onPointerMove={onPipMove}
          onPointerUp={onPipUp}
          onPointerCancel={onPipUp}
        >
          <button type="button" className="tt-pdp-pro-pip-close" onClick={() => setLiveClosed(true)}>
            ✕
          </button>
          <Link href={`/m/live/${liveRoom}`} className="tt-pdp-pro-pip-link">
            {detail?.live?.stream_url ? (
              <video
                src={detail.live.stream_url}
                className="tt-pdp-pro-pip-media"
                muted
                playsInline
                autoPlay
                loop
              />
            ) : livePreview ? (
              <img src={livePreview} alt="Live" className="tt-pdp-pro-pip-media" />
            ) : (
              <div className="tt-pdp-pro-pip-placeholder">🔴 LIVE</div>
            )}
            <span className="tt-pdp-pro-pip-label">LIVE</span>
          </Link>
        </div>
      )}

      {showTop && (
        <button type="button" className="tt-pdp-pro-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          ↑
        </button>
      )}

      <footer className="tt-pdp-pro-bar">
        <Link href={chatHref} className="tt-pdp-pro-bar-item">
          <IconLuxChat size={22} />
          <small>แชท</small>
        </Link>
        <button type="button" className="tt-pdp-pro-bar-item" disabled={adding} onClick={() => setBuySheet('cart')}>
          <IconLuxCart size={22} />
          <small>รถเข็น</small>
        </button>
        <button
          type="button"
          className="tt-pdp-pro-bar-buy"
          disabled={adding || loading}
          onClick={() => setBuySheet('buy')}
        >
          ซื้อเลย {formatCatalogPrice(priceMicro)}
        </button>
      </footer>

      <PdpBuySheet
        open={buySheet !== null}
        mode={buySheet === 'cart' ? 'cart' : 'buy'}
        onClose={() => setBuySheet(null)}
        title={title}
        imageUrl={sheetImage}
        variants={variants}
        variantIdx={sheetVariantIdx}
        onVariantIdx={setSheetVariantIdx}
        qty={qty}
        onQty={setQty}
        priceMicro={sheetPriceMicro}
        listPriceMicro={sheetListPrice}
        shippingLabel={detail?.shipping?.label || ''}
        shippingFree={detail?.shipping?.free !== false}
        onConfirm={confirmBuySheet}
        busy={adding}
        error={error}
      />
    </div>
  );
}
