'use client';

import { useState } from 'react';
import { IconLuxAqondStore } from '@/components/mobile/TtLuxuryIcons';

export type PendingReviewRow = {
  order_id: string;
  product_id: string;
  merchant_id: string;
  merchant_name: string;
  title: string;
  image_url: string;
  qty: number;
  unit_price_micro: number;
  review_within_days: number;
  coin_bonus: number;
};

type Props = {
  item: PendingReviewRow;
  onSubmit: (rating: number, body: string) => Promise<void>;
};

export function TtRatingPendingCard({ item, onSubmit }: Props) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [body, setBody] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const active = hover || rating;

  const openCompose = (stars?: number) => {
    setOpen(true);
    if (stars) setRating(stars);
    else if (!rating) setRating(5);
  };

  const submit = async () => {
    if (rating < 1) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit(rating, body);
      setOpen(false);
      setRating(0);
      setBody('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'ส่งรีวิวไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <article className="tt-rate-card">
        <div className="tt-rate-card-shop">
          <span className="tt-rate-shop-icon" aria-hidden>
          <IconLuxAqondStore size={16} />
        </span>
          <span className="tt-rate-shop-name">{item.merchant_name}</span>
        </div>

        <div className="tt-rate-card-body">
          <div className="tt-rate-thumb">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.image_url} alt="" />
          </div>
          <div className="tt-rate-info">
            <p className="tt-rate-title">{item.title}</p>
            <p className="tt-rate-deadline">รีวิวภายใน {item.review_within_days} วัน</p>
          </div>
          <button type="button" className="tt-rate-bonus-btn" onClick={() => openCompose(5)}>
            <span className="tt-rate-bonus-tag">โบนัส</span>
            <span className="tt-rate-bonus-inner">
              <span aria-hidden>🪙</span> รีวิว +{item.coin_bonus}
            </span>
          </button>
        </div>

        <div className="tt-rate-stars-row">
          <span>ให้คะแนนสินค้านี้</span>
          <div className="tt-rate-stars" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={`tt-rate-star${n <= active ? ' on' : ''}`}
                onMouseEnter={() => setHover(n)}
                onClick={() => openCompose(n)}
                aria-label={`${n} ดาว`}
              >
                ★
              </button>
            ))}
          </div>
        </div>
      </article>

      {open && (
        <div className="tt-rate-modal-backdrop" onClick={() => !busy && setOpen(false)}>
          <div
            className="tt-rate-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="rate-modal-title"
          >
            <div className="tt-rate-modal-head">
              <div className="tt-rate-modal-product">
                <div className="tt-rate-thumb sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.image_url} alt="" />
                </div>
                <div>
                  <p id="rate-modal-title" className="tt-rate-title">
                    {item.title}
                  </p>
                  <p className="tt-rate-deadline">{item.merchant_name}</p>
                </div>
              </div>
              <button
                type="button"
                className="tt-rate-modal-close"
                onClick={() => setOpen(false)}
                disabled={busy}
                aria-label="ปิด"
              >
                ×
              </button>
            </div>

            <div className="tt-rate-compose-stars">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`tt-rate-star lg${n <= (hover || rating) ? ' on' : ''}`}
                  onMouseEnter={() => setHover(n)}
                  onMouseLeave={() => setHover(0)}
                  onClick={() => setRating(n)}
                >
                  ★
                </button>
              ))}
            </div>

            <textarea
              className="tt-rate-textarea"
              placeholder="แชร์ประสบการณ์ของคุณ (ไม่บังคับ)"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
            />
            {error && <p className="tt-error-inline">{error}</p>}
            <button
              type="button"
              className="tt-rate-submit-btn full"
              disabled={busy || rating < 1}
              onClick={() => void submit()}
            >
              {busy ? 'กำลังส่ง…' : `ส่งรีวิว รับ +${item.coin_bonus} Coins`}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
