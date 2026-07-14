'use client';

import Link from 'next/link';

type Brand = {
  id: string;
  name: string;
  logo_emoji: string;
  merchant_id: string;
  cover_url?: string;
};

type Props = {
  brands: Brand[];
  title?: string;
};

export function TtFoodBrandGrid({ brands, title = 'แบรนด์แนะนำ' }: Props) {
  if (!brands.length) return null;
  return (
    <section className="tt-food-brand-section">
      <div className="tt-food-section-head">
        <h2>{title}</h2>
      </div>
      <div className="tt-food-brand-grid">
        {brands.map((b) => (
          <Link key={b.id} href={`/m/food/${b.merchant_id}`} className="tt-food-brand-cell">
            {b.cover_url ? (
              <img src={b.cover_url} alt="" className="tt-food-brand-img" loading="lazy" />
            ) : (
              <span className="tt-food-brand-emoji" aria-hidden>{b.logo_emoji}</span>
            )}
            <span className="tt-food-brand-name">{b.name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
