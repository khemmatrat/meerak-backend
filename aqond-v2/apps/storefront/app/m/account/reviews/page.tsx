'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';

export default function ReviewsHubPage() {
  const { auth } = useAuth();
  const userId = auth?.userId || '';
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    fetch(`/api/reviews?author_id=${encodeURIComponent(userId)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setReviews(d.reviews || []))
      .catch(() => setReviews([]))
      .finally(() => setLoading(false));
  }, [userId]);

  return (
    <>
      <header className="tt-header">
        <div className="tt-header-row">
          <Link href="/m/account" className="tt-back" aria-label="กลับ">‹</Link>
          <span style={{ flex: 1, fontWeight: 700 }}>รีวิวของฉัน</span>
        </div>
      </header>

      {loading && <p className="tt-loading">กำลังโหลด…</p>}
      {!userId && <p className="tt-hint">เข้าสู่ระบบเพื่อดูรีวิว</p>}

      {!loading && reviews.length === 0 && userId && (
        <div className="tt-empty-cart">
          <p>ยังไม่มีรีวิว</p>
          <Link href="/m/orders" className="tt-btn-primary">ไปรีวิวจากคำสั่งซื้อ</Link>
        </div>
      )}

      <div className="tt-review-list">
        {reviews.map((r) => (
          <article key={r.id} className="tt-review-card">
            <div className="tt-review-stars">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</div>
            <h3>{r.title || 'รีวิวสินค้า'}</h3>
            <p>{r.body}</p>
            {r.product_id && (
              <Link href={`/m/product/${r.product_id}`} className="tt-link">
                ดูสินค้า
              </Link>
            )}
            {r.created_at && <p className="tt-hint">{formatDate(r.created_at)}</p>}
          </article>
        ))}
      </div>
    </>
  );
}
