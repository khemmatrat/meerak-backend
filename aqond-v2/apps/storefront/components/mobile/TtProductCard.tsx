'use client';

import Link from 'next/link';
import { formatCatalogPrice, catalogPriceThb } from '@/lib/format';
import { CAT_EMOJI, guessCategory } from '@/lib/productVisual';
import { IntentDwellTracker } from '@/components/growth/IntentDwellTracker';

type Props = {
  id: string;
  title: string;
  priceMicro?: number;
  priceThb?: number;
  category?: string;
  sold?: number;
  showDiscount?: boolean;
  imageUrl?: string;
};

export function TtProductCard({
  id,
  title,
  priceMicro = 0,
  priceThb,
  category = 'general',
  sold,
  showDiscount = true,
  imageUrl,
}: Props) {
  const thb = catalogPriceThb(priceMicro, priceThb);
  const discountPct = showDiscount ? 10 + (id.charCodeAt(id.length - 1) % 25) : 0;
  const oldThb = discountPct > 0 ? Math.round(thb * (100 + discountPct) / 100) : thb;
  const emoji = CAT_EMOJI[category] || CAT_EMOJI[guessCategory(title)] || CAT_EMOJI.general;
  const soldLabel = sold ?? (5 + (id.charCodeAt(0) % 500));

  return (
    <IntentDwellTracker entityType="product" entityId={id} surface="storefront_home">
      <Link href={`/m/product/${id}`} className="tt-card">
      <div className="tt-card-img">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="tt-card-photo" />
        ) : (
          <span aria-hidden>{emoji}</span>
        )}
        {discountPct > 0 && <span className="tt-badge-discount">-{discountPct}%</span>}
        <span className="tt-badge-ship">ส่งฟรี</span>
      </div>
      <div className="tt-card-body">
        <p className="tt-card-title">{title}</p>
        <div className="tt-price-row">
          <p className="tt-price">{formatCatalogPrice(priceMicro, 'THB')}</p>
          {discountPct > 0 && oldThb > thb && (
            <p className="tt-price-old">{formatCatalogPrice(oldThb * 100, 'THB')}</p>
          )}
        </div>
        <div className="tt-card-meta">
          <span className="tt-tag-free">ส่งฟรี</span>
          <span>·</span>
          <span>ขายได้ {soldLabel} ชิ้น</span>
        </div>
      </div>
    </Link>
    </IntentDwellTracker>
  );
}
