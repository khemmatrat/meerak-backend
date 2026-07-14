'use client';

import { useEffect, useState } from 'react';
import { bffGet, bffPost } from '@/lib/bff';
import { useAuth } from '@/lib/auth';

type Review = {
  id?: string;
  author_id?: string;
  rating?: number;
  title?: string;
  body?: string;
  verified_purchase?: boolean;
  created_at?: string;
};

type Props = {
  productId: string;
  merchantId?: string;
  summary?: { avg_rating?: number; count?: number };
};

export function TtReviews({ productId, merchantId, summary }: Props) {
  const { auth } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    bffGet<any>(`/v1/reviews?product_id=${encodeURIComponent(productId)}`)
      .then((data) => setReviews(data.reviews || []))
      .catch(() => setReviews([]))
      .finally(() => setLoading(false));
  }, [productId]);

  const submit = async () => {
    if (!body.trim()) {
      setError('กรุณาเขียนรีวิว');
      return;
    }
    setSubmitting(true);
    setError('');
    setOk('');
    try {
      await bffPost('/v1/reviews', {
        product_id: productId,
        merchant_id: merchantId || 'demo-merchant',
        author_id: auth?.userId || 'guest',
        rating,
        title: body.slice(0, 60),
        body: body.trim(),
      }, auth);
      setOk('ส่งรีวิวแล้ว ✓');
      setBody('');
      const data = await bffGet<any>(`/v1/reviews?product_id=${encodeURIComponent(productId)}`);
      setReviews(data.reviews || []);
    } catch (e: any) {
      setError(e.message || 'ส่งรีวิวไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  const avg = summary?.avg_rating;
  const count = summary?.count ?? reviews.length;

  return (
    <section className="tt-reviews">
      <h2 className="tt-section-title" style={{ paddingLeft: 0 }}>
        รีวิว & ความน่าเชื่อถือ
      </h2>
      {avg != null && (
        <p className="tt-pdp-meta">★ {Number(avg).toFixed(1)} · {count} รีวิว · verified purchase ได้รับการยืนยัน</p>
      )}

      <div className="tt-trust-badges">
        <span className="tt-tag-free">✓ ร้านผ่าน trust</span>
        <span className="tt-tag-free">✓ ปลอดภัย</span>
      </div>

      {loading && <p className="tt-hint">กำลังโหลดรีวิว...</p>}

      {!loading && reviews.length === 0 && (
        <p className="tt-hint">ยังไม่มีรีวิว — เป็นคนแรกที่รีวิวสินค้านี้</p>
      )}

      <div className="tt-review-list">
        {reviews.slice(0, 8).map((r, i) => (
          <div key={r.id || i} className="tt-review-card">
            <div className="tt-review-head">
              <strong>{'★'.repeat(r.rating || 5)}</strong>
              {r.verified_purchase && <span className="tt-tag-free">ซื้อแล้ว</span>}
            </div>
            <p>{r.body || r.title}</p>
          </div>
        ))}
      </div>

      <div className="tt-review-form">
        <label className="tt-label" htmlFor="review-rating">คะแนน</label>
        <select id="review-rating" className="tt-input" value={rating} onChange={(e) => setRating(Number(e.target.value))}>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>{n} ดาว</option>
          ))}
        </select>
        <label className="tt-label" htmlFor="review-body">รีวิวของคุณ</label>
        <textarea
          id="review-body"
          className="tt-input"
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="สินค้าดีไหม จัดส่งเร็วแค่ไหน..."
        />
        <button type="button" className="tt-btn-sm" disabled={submitting} onClick={submit}>
          {submitting ? 'กำลังส่ง...' : 'ส่งรีวิว'}
        </button>
        {error && <p className="tt-error">{error}</p>}
        {ok && <p className="tt-warn">{ok}</p>}
      </div>
    </section>
  );
}
