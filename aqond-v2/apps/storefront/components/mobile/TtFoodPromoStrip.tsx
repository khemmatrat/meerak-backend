'use client';

import { useState } from 'react';

type Props = {
  title: string;
  subtitle: string;
  code?: string;
};

export function TtFoodPromoStrip({ title, subtitle, code }: Props) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="tt-food-promo-strip" role="status">
      <span className="tt-food-promo-strip-icon" aria-hidden>%</span>
      <div className="tt-food-promo-strip-body">
        <strong>{title}</strong>
        <p>
          {subtitle}
          {code && <span className="tt-food-promo-code"> · {code}</span>}
        </p>
      </div>
      <button type="button" className="tt-food-promo-strip-close" onClick={() => setDismissed(true)} aria-label="ปิด">
        ×
      </button>
    </div>
  );
}
