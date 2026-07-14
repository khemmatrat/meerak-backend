'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Top10MerchantsResponse } from '@/lib/growth';

export function Top10MerchantsCarousel() {
  const [data, setData] = useState<Top10MerchantsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch('/api/growth/merchants-top10', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {
        if (alive) setData(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const merchants = data?.merchants || [];
  if (loading || merchants.length === 0) return null;

  return (
    <section className="tt-top10-section" aria-label="Top 10 ร้านค้า">
      <div className="tt-top10-head">
        <div>
          <p className="tt-top10-kicker">อันดับประจำสัปดาห์</p>
          <h2 className="tt-top10-title">🔥 Top 10 ร้านค้ายอดนิยม</h2>
        </div>
        <span className="tt-top10-week">{data?.weekStart}</span>
      </div>
      <div className="tt-top10-scroll">
        {merchants.map((m) => (
          <Link key={m.shopId} href={m.href} className="tt-top10-card">
            <span className={`tt-top10-rank rank-${m.rank}`}>#{m.rank}</span>
            <p className="tt-top10-name">{m.merchantName}</p>
            <p className="tt-top10-score">คะแนน {Math.round(m.score).toLocaleString('th-TH')}</p>
            <span className="tt-top10-cta">ดูร้าน ›</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
