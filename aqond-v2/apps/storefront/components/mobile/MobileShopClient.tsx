'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { formatCatalogPrice } from '@/lib/format';
import { IconLuxSearch } from '@/components/mobile/TtLuxuryIcons';

type ShopProduct = {
  id: string;
  title: string;
  price_micro: number;
  category?: string;
  image_url?: string;
  discount_pct: number;
  list_price_micro?: number;
  sold_count: number;
  rating: number;
  sold_out?: boolean;
  free_shipping: boolean;
};

type ShopDetail = {
  shop: {
    id: string;
    name: string;
    rating: number;
    followers: number;
    follower_label: string;
    product_count: number;
    response_rate: number;
    province: string;
    cover_url?: string;
    avatar_url?: string;
    is_live?: boolean;
    live_room_id?: string;
  };
  products: ShopProduct[];
  recommended: ShopProduct[];
  videos: Array<{ id: string; url: string; poster?: string; caption?: string; product_id?: string }>;
  video_count: number;
  reviews: Array<{
    id: string;
    product_id: string;
    product_title: string;
    body: string;
    rating: number;
  }>;
  review_summary: { avg_rating: number; count: number };
  categories: Array<{ id: string; label: string; count: number }>;
  promo_codes: Array<{ code: string; discount_pct: number; label: string; theme: string }>;
  campaign: { title: string; subtitle: string; date_range: string };
  following?: boolean;
};

type TabId = 'shop' | 'products' | 'reviews' | 'categories';

type ChatMsg = { from: 'user' | 'shop'; text: string; at: number };

function soldLabel(n: number) {
  if (n >= 3000) return `ขายแล้ว ${Math.floor(n / 1000)}พัน+ ชิ้น`;
  if (n >= 1000) return `ขายแล้ว ${(n / 1000).toFixed(1)}k+ ชิ้น`;
  return `ขายแล้ว ${n} ชิ้น`;
}

function ShopProductTile({ p, compact }: { p: ShopProduct; compact?: boolean }) {
  return (
    <Link href={`/m/product/${p.id}`} className={`tt-shop-pro-card${compact ? ' compact' : ''}`}>
      <div className="tt-shop-pro-card-img">
        {p.image_url ? (
          <img src={p.image_url} alt="" />
        ) : (
          <span className="tt-shop-pro-card-ph">📦</span>
        )}
        {p.free_shipping && <span className="tt-shop-pro-card-ship">🚚</span>}
        {p.discount_pct > 0 && <span className="tt-shop-pro-card-off">-{p.discount_pct}%</span>}
      </div>
      <p className="tt-shop-pro-card-title">{p.title}</p>
      <div className="tt-shop-pro-card-price-row">
        <strong>{formatCatalogPrice(p.price_micro)}</strong>
        {p.discount_pct > 0 && p.list_price_micro ? (
          <span className="tt-shop-pro-card-old">{formatCatalogPrice(p.list_price_micro)}</span>
        ) : null}
      </div>
      <p className="tt-shop-pro-card-meta">
        ★ {p.rating.toFixed(1)} · {soldLabel(p.sold_count)}
      </p>
    </Link>
  );
}

export function MobileShopClient({ shopId }: { shopId: string }) {
  const router = useRouter();
  const { auth } = useAuth();
  const [detail, setDetail] = useState<ShopDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>('shop');
  const [search, setSearch] = useState('');
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState('');
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([]);
  const [pickedCategory, setPickedCategory] = useState<string | null>(null);

  const userId = auth?.userId || 'guest';
  const chatKey = `shop-chat-${shopId}`;

  const reload = useCallback(() => {
    setLoading(true);
    const q = userId !== 'guest' ? `?user_id=${encodeURIComponent(userId)}` : '';
    fetch(`/api/shop/${encodeURIComponent(shopId)}/detail${q}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d.redirect) {
          router.replace(d.redirect);
          return;
        }
        setDetail(d);
        setFollowing(!!d.following);
      })
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [shopId, userId, router]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(chatKey);
      if (raw) setChatMsgs(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, [chatKey]);

  const filteredProducts = useMemo(() => {
    const list = detail?.products || [];
    const q = search.trim().toLowerCase();
    return list.filter((p) => {
      if (pickedCategory && p.category !== pickedCategory) return false;
      if (!q) return true;
      return p.title.toLowerCase().includes(q);
    });
  }, [detail?.products, search, pickedCategory]);

  const onFollow = async () => {
    if (userId === 'guest') {
      router.push('/m/login');
      return;
    }
    setFollowBusy(true);
    try {
      const res = await fetch(`/api/shop/${encodeURIComponent(shopId)}/follow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      const data = await res.json();
      if (res.ok) {
        setFollowing(data.following);
        setDetail((prev) =>
          prev
            ? {
                ...prev,
                shop: {
                  ...prev.shop,
                  followers: data.follower_count,
                  follower_label:
                    data.follower_count >= 1000
                      ? `${(data.follower_count / 1000).toFixed(1)}k`
                      : String(data.follower_count),
                },
                following: data.following,
              }
            : prev,
        );
      }
    } finally {
      setFollowBusy(false);
    }
  };

  const sendChat = () => {
    const text = chatText.trim();
    if (!text) return;
    const next: ChatMsg[] = [
      ...chatMsgs,
      { from: 'user', text, at: Date.now() },
      {
        from: 'shop',
        text: 'ขอบคุณที่ทักแชทค่ะ 🙏 แอดมินจะตอบกลับโดยเร็วที่สุด (ตอบแชท ~85%)',
        at: Date.now() + 1,
      },
    ];
    setChatMsgs(next);
    setChatText('');
    try {
      sessionStorage.setItem(chatKey, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      /* ignore */
    }
  };

  if (loading && !detail) {
    return <p className="tt-shop-pro-loading">กำลังโหลดร้านค้า…</p>;
  }

  if (!detail) {
    return (
      <div className="tt-shop-pro-empty">
        <p>ไม่พบร้านค้านี้</p>
        <Link href="/m/home" className="tt-btn-primary">
          กลับหน้าแรก
        </Link>
      </div>
    );
  }

  const { shop } = detail;

  return (
    <div className="tt-shop-pro">
      <div
        className="tt-shop-pro-cover"
        style={shop.cover_url ? { backgroundImage: `url(${shop.cover_url})` } : undefined}
      >
        <div className="tt-shop-pro-cover-overlay" />
        <header className="tt-shop-pro-top">
          <button type="button" className="tt-shop-pro-top-btn" onClick={() => router.back()} aria-label="กลับ">
            ‹
          </button>
          <label className="tt-shop-pro-search">
            <span className="tt-search-bar-icon" aria-hidden>
              <IconLuxSearch size={18} />
            </span>
            <input
              type="search"
              placeholder="ค้นหาในร้านค้า"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                if (e.target.value && tab !== 'products') setTab('products');
              }}
            />
          </label>
          <button
            type="button"
            className="tt-shop-pro-top-btn"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="เมนู"
          >
            ⋯
          </button>
        </header>

        {menuOpen && (
          <div className="tt-shop-pro-menu">
            <button type="button" onClick={() => void copyCode(shop.name)}>
              แชร์ร้านค้า
            </button>
            <button type="button" onClick={() => setMenuOpen(false)}>
              รายงานร้านค้า
            </button>
          </div>
        )}

        <div className="tt-shop-pro-profile">
          <div className="tt-shop-pro-avatar">
            {shop.avatar_url ? <img src={shop.avatar_url} alt="" /> : <span>{shop.name.slice(0, 1)}</span>}
          </div>
          <div className="tt-shop-pro-profile-text">
            <Link href={`/m/shop/${shop.id}`} className="tt-shop-pro-name">
              {shop.name} ›
            </Link>
            <p>
              ★ {shop.rating.toFixed(1)} · {shop.follower_label} ผู้ติดตาม
            </p>
          </div>
          <div className="tt-shop-pro-profile-actions">
            <button
              type="button"
              className={`tt-shop-pro-follow${following ? ' on' : ''}`}
              disabled={followBusy}
              onClick={() => void onFollow()}
            >
              {following ? '✓ ติดตามแล้ว' : '+ ติดตาม'}
            </button>
            <button type="button" className="tt-shop-pro-chat" onClick={() => setChatOpen(true)}>
              💬 พูดคุย
            </button>
          </div>
        </div>

        {detail.video_count > 0 && (
          <button
            type="button"
            className="tt-shop-pro-video-bar"
            onClick={() => router.push(`/m/shop/${shopId}/videos`)}
          >
            <span>▶ AQOND Video</span>
            <strong>{detail.video_count} วิดีโอ</strong>
            <span className="tt-shop-pro-chevron">›</span>
          </button>
        )}
      </div>

      <nav className="tt-shop-pro-tabs" aria-label="แท็บร้านค้า">
        {(
          [
            ['shop', 'ร้านค้า'],
            ['products', 'รายการสินค้า'],
            ['reviews', 'รีวิว'],
            ['categories', 'หมวดหมู่'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? 'on' : ''}
            onClick={() => {
              setTab(id);
              if (id !== 'products') setPickedCategory(null);
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      <main className="tt-shop-pro-main">
        {tab === 'shop' && (
          <>
            <section className="tt-shop-pro-section">
              <h2>สินค้าแนะนำสำหรับคุณ</h2>
              <div className="tt-shop-pro-scroll">
                {(detail.recommended.length ? detail.recommended : detail.products).map((p) => (
                  <ShopProductTile key={p.id} p={p} compact />
                ))}
              </div>
            </section>

            <section className="tt-shop-pro-section">
              <h2>โค้ดส่วนลดพิเศษ</h2>
              <div className="tt-shop-pro-promo-row">
                {detail.promo_codes.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    className={`tt-shop-pro-promo tt-shop-pro-promo--${c.theme}`}
                    onClick={() => void copyCode(c.code)}
                  >
                    <span>SPECIAL CODE</span>
                    <strong>{c.label}</strong>
                    <em>{c.code}</em>
                  </button>
                ))}
              </div>
            </section>

            <section className="tt-shop-pro-campaign">
              <p className="tt-shop-pro-campaign-tag">AQOND</p>
              <h3>{detail.campaign.title}</h3>
              <p>{detail.campaign.subtitle}</p>
              <span>{detail.campaign.date_range}</span>
            </section>

            {shop.is_live && shop.live_room_id && (
              <Link href={`/m/live/${shop.live_room_id}`} className="tt-shop-pro-live-banner">
                🔴 ร้านกำลังไลฟ์อยู่ — เข้าชมเลย ›
              </Link>
            )}
          </>
        )}

        {tab === 'products' && (
          <section className="tt-shop-pro-section">
            {search && <p className="tt-shop-pro-hint">ผลลัพธ์สำหรับ &quot;{search}&quot;</p>}
            {filteredProducts.length === 0 ? (
              <p className="tt-shop-pro-hint">ไม่พบสินค้า</p>
            ) : (
              <div className="tt-shop-pro-grid">
                {filteredProducts.map((p) => (
                  <ShopProductTile key={p.id} p={p} />
                ))}
              </div>
            )}
          </section>
        )}

        {tab === 'reviews' && (
          <section className="tt-shop-pro-section">
            <div className="tt-shop-pro-review-head">
              <strong>★ {detail.review_summary.avg_rating.toFixed(1)}</strong>
              <span>({detail.review_summary.count} รีวิว)</span>
            </div>
            {detail.reviews.map((r) => (
              <article key={r.id} className="tt-shop-pro-review">
                <div className="tt-shop-pro-review-stars">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</div>
                <p>{r.body}</p>
                <Link href={`/m/product/${r.product_id}`} className="tt-shop-pro-review-product">
                  {r.product_title} ›
                </Link>
              </article>
            ))}
          </section>
        )}

        {tab === 'categories' && (
          <section className="tt-shop-pro-section">
            {detail.categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className="tt-shop-pro-cat-row"
                onClick={() => {
                  setPickedCategory(c.label);
                  setTab('products');
                }}
              >
                <span>{c.label}</span>
                <span>{c.count} สินค้า ›</span>
              </button>
            ))}
          </section>
        )}
      </main>

      <div className="tt-shop-pro-spacer" />

      {chatOpen && (
        <div className="tt-shop-pro-chat-sheet">
          <header>
            <strong>แชทกับ {shop.name}</strong>
            <button type="button" onClick={() => setChatOpen(false)}>
              ✕
            </button>
          </header>
          <div className="tt-shop-pro-chat-msgs">
            {chatMsgs.length === 0 && (
              <p className="tt-shop-pro-hint">สวัสดีค่ะ มีอะไรให้ช่วยไหมคะ? ตอบแชท {shop.response_rate}%</p>
            )}
            {chatMsgs.map((m, i) => (
              <div key={i} className={`tt-shop-pro-chat-bubble ${m.from}`}>
                {m.text}
              </div>
            ))}
          </div>
          <div className="tt-shop-pro-chat-input">
            <input
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              placeholder="พิมพ์ข้อความ…"
              onKeyDown={(e) => e.key === 'Enter' && sendChat()}
            />
            <button type="button" onClick={sendChat}>
              ส่ง
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
