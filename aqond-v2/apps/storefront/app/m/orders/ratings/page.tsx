'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useCartOwner } from '@/lib/cartOwner';
import { formatDate } from '@/lib/format';
import { TtRatingPendingCard, type PendingReviewRow } from '@/components/mobile/TtRatingPendingCard';

type ReviewStats = {
  review_count: number;
  coins_balance: number;
  coins_earned: number;
  video_tokens_available: number;
  likes: number;
  views: number;
  pending_count: number;
  max_coins_pending: number;
};

type CoinWallet = {
  balance: number;
  lifetime_earned: number;
  lifetime_spent: number;
  video_tokens_available: number;
  video_token_rate: number;
  recent_ledger: Array<{
    id: string;
    amount: number;
    label_th: string;
    created_at: string;
    balance_after: number;
  }>;
};

type HubTab = 'pending' | 'mine';

export default function OrderRatingsPage() {
  const { auth } = useAuth();
  const { ownerId, ready: ownerReady } = useCartOwner();
  const owner = ownerId || auth?.userId || 'guest';
  const [tab, setTab] = useState<HubTab>('pending');
  const [pending, setPending] = useState<PendingReviewRow[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [wallet, setWallet] = useState<CoinWallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [coinPopup, setCoinPopup] = useState<{ amount: number; balance: number } | null>(null);

  const loadPending = useCallback(() => {
    const qs = new URLSearchParams({ buyer_id: owner, seed_if_empty: '1' });
    return fetch(`/api/reviews/pending?${qs}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((body) => {
        setPending(body.pending || []);
        setStats(body.stats || null);
        setWallet(body.wallet || null);
      });
  }, [owner]);

  const loadMine = useCallback(() => {
    return fetch(`/api/reviews?author_id=${encodeURIComponent(owner)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((body) => setReviews(body.reviews || []));
  }, [owner]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadPending(), loadMine()]);
    } finally {
      setLoading(false);
    }
  }, [loadPending, loadMine]);

  useEffect(() => {
    if (!ownerReady && !auth?.userId) return;
    void reload();
  }, [owner, ownerReady, auth?.userId, reload]);

  const submitReview = async (item: PendingReviewRow, rating: number, body: string) => {
    const res = await fetch('/api/reviews/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: item.product_id,
        merchant_id: item.merchant_id,
        author_id: owner,
        order_id: item.order_id,
        rating,
        title: rating >= 4 ? 'ประทับใจ' : 'พอใช้ได้',
        body: body || 'สั่งผ่าน AQOND Marketplace',
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'ส่งรีวิวไม่สำเร็จ');
    const coins = data.coins_awarded || item.coin_bonus;
    const balance = data.wallet?.balance ?? (wallet?.balance || 0) + coins;
    setCoinPopup({ amount: coins, balance });
    setTimeout(() => setCoinPopup(null), 3500);
    await reload();
  };

  const balance = wallet?.balance ?? stats?.coins_balance ?? 0;
  const tokens = wallet?.video_tokens_available ?? stats?.video_tokens_available ?? 0;
  const tokenRate = wallet?.video_token_rate ?? 10;

  return (
    <div className="tt-rating-hub">
      <header className="tt-rating-hub-header">
        <Link href="/m/orders" className="tt-rating-hub-back" aria-label="กลับ">
          ‹
        </Link>
        <h1>เรตติ้งของฉัน</h1>
        <Link href="/m/home" className="tt-rating-hub-home" aria-label="หน้าหลัก">
          หน้าหลัก
        </Link>
      </header>

      <div className="tt-coin-wallet-hero">
        <div className="tt-coin-wallet-top">
          <div>
            <p className="tt-coin-wallet-label">AQOND Coins</p>
            <p className="tt-coin-wallet-balance">
              <span aria-hidden>🪙</span> {balance.toLocaleString('th-TH')}
            </p>
          </div>
          <div className="tt-coin-wallet-tokens">
            <span className="tt-coin-wallet-tokens-label">Video Token</span>
            <strong>{tokens}</strong>
            <span className="tt-coin-wallet-tokens-hint">{tokenRate} Coins = 1 Token</span>
          </div>
        </div>
        <p className="tt-coin-wallet-note">
          รีวิวสินค้าเพื่อรับ Coins สะสมแลกสร้างวิดีโอ AI ในอนาคต
        </p>
      </div>

      <div className="tt-rating-stats">
        <div>
          <strong>{stats?.review_count ?? 0}</strong>
          <span>รีวิว</span>
        </div>
        <div>
          <strong>{stats?.coins_earned ?? 0}</strong>
          <span>Coins สะสม</span>
        </div>
        <div>
          <strong>{stats?.likes ?? 0}</strong>
          <span>ถูกใจ</span>
        </div>
        <div>
          <strong>{stats?.views ?? 0}</strong>
          <span>การมองเห็น</span>
        </div>
      </div>

      <div className="tt-rating-tabs">
        <button
          type="button"
          className={tab === 'pending' ? 'active' : ''}
          onClick={() => setTab('pending')}
        >
          ยังไม่ได้ให้คะแนน
          {(stats?.pending_count || 0) > 0 && (
            <em className="tt-rating-tab-badge">{stats?.pending_count}</em>
          )}
        </button>
        <button
          type="button"
          className={tab === 'mine' ? 'active' : ''}
          onClick={() => setTab('mine')}
        >
          คะแนนของฉัน
        </button>
      </div>

      {tab === 'pending' && (stats?.max_coins_pending || 0) > 0 && (
        <div className="tt-rating-coin-banner">
          <span className="tt-rating-coin-banner-icon" aria-hidden>🪙</span>
          <p>
            เขียนรีวิวสินค้าทั้งหมด รับสูงสุด{' '}
            <strong>{stats?.max_coins_pending} Coins</strong>
          </p>
        </div>
      )}

      {loading && <p className="tt-loading tt-rating-loading">กำลังโหลด…</p>}

      {tab === 'pending' && !loading && pending.length === 0 && (
        <div className="tt-rating-empty">
          <div className="tt-rating-empty-icon">⭐</div>
          <h2>ไม่มีสินค้ารอให้คะแนน</h2>
          <p>เมื่อได้รับสินค้าแล้ว รายการจะแสดงที่นี่</p>
          <Link href="/m/orders?tab=completed" className="tt-btn-primary">
            ดูออเดอร์สำเร็จ
          </Link>
        </div>
      )}

      {tab === 'pending' && !loading && (
        <div className="tt-rating-list">
          {pending.map((item) => (
            <TtRatingPendingCard
              key={`${item.order_id}:${item.product_id}`}
              item={item}
              onSubmit={(rating, body) => submitReview(item, rating, body)}
            />
          ))}
        </div>
      )}

      {tab === 'mine' && !loading && reviews.length === 0 && (
        <div className="tt-rating-empty">
          <div className="tt-rating-empty-icon">💬</div>
          <h2>ยังไม่มีรีวิว</h2>
          <p>รีวิวสินค้าที่ซื้อแล้วจะแสดงที่นี่</p>
        </div>
      )}

      {tab === 'mine' && !loading && reviews.length > 0 && (
        <div className="tt-rating-mine-list">
          {reviews.map((r) => (
            <article key={r.id} className="tt-rate-mine-card">
              <div className="tt-rate-mine-head">
                <div className="tt-rate-mine-stars">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</div>
                {r.coins_earned ? (
                  <span className="tt-rate-mine-coins">+{r.coins_earned} 🪙</span>
                ) : null}
              </div>
              <h3>{r.title || 'รีวิวสินค้า'}</h3>
              <p>{r.body}</p>
              <div className="tt-rate-mine-meta">
                {r.created_at && <span>{formatDate(r.created_at)}</span>}
                {r.product_id && (
                  <Link href={`/m/product/${r.product_id}`} className="tt-link">
                    ดูสินค้า ›
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {tab === 'mine' && wallet?.recent_ledger && wallet.recent_ledger.length > 0 && (
        <section className="tt-coin-ledger">
          <h2 className="tt-coin-ledger-title">ประวัติ Coins</h2>
          <ul className="tt-coin-ledger-list">
            {wallet.recent_ledger.map((row) => (
              <li key={row.id} className="tt-coin-ledger-row">
                <div>
                  <p>{row.label_th}</p>
                  <span>{formatDate(row.created_at)}</span>
                </div>
                <strong className={row.amount >= 0 ? 'plus' : 'minus'}>
                  {row.amount >= 0 ? '+' : ''}
                  {row.amount}
                </strong>
              </li>
            ))}
          </ul>
        </section>
      )}

      {coinPopup && (
        <div className="tt-coin-popup" role="status">
          <div className="tt-coin-popup-card">
            <span className="tt-coin-popup-icon">🪙</span>
            <h3>ได้รับ +{coinPopup.amount} Coins!</h3>
            <p>ยอดสะสม {coinPopup.balance.toLocaleString('th-TH')} Coins</p>
            <p className="tt-coin-popup-sub">
              แลก {tokenRate} Coins = 1 Video Token (เร็วๆ นี้)
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
