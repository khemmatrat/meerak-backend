import Link from 'next/link';
import { Badge, StatusChip } from '@aqond/ui';
import type { FoodRestaurantView } from '@/lib/food';
import { etaShort } from '@/lib/food';
import { formatCatalogPrice } from '@/lib/format';
import { restaurantCoverUrl } from '@/lib/foodVisual';

type Props = {
  restaurant: FoodRestaurantView;
  variant?: 'list' | 'rail';
  showAd?: boolean;
};

export function TtFoodRestaurantCard({ restaurant: r, variant = 'list', showAd }: Props) {
  const cover = (r as FoodRestaurantView & { cover_url?: string }).cover_url || restaurantCoverUrl(r.id);
  const deliveryWas = r.delivery_fee_micro > 0 ? Math.round(r.delivery_fee_micro * 1.2) : 0;
  const freeShip = r.delivery_fee_micro <= 2000;

  if (variant === 'rail') {
    return (
      <Link
        href={r.open ? `/m/food/${r.id}` : '#'}
        className={`tt-food-card-rail${r.open ? '' : ' closed'}`}
        aria-disabled={!r.open}
        onClick={(e) => { if (!r.open) e.preventDefault(); }}
      >
        <div className="tt-food-card-rail-thumb">
          {cover ? <img src={cover} alt="" loading="lazy" /> : <span>{r.emoji}</span>}
          {showAd && <Badge tone="info" className="tt-food-ad-badge">Ad</Badge>}
        </div>
        <div className="tt-food-card-rail-body">
          <h3>{r.name}</h3>
          <p className="tt-food-meta">
            <span>⭐ {r.rating.toFixed(1)}</span>
            <span>· {r.distance_km.toFixed(1)} กม.</span>
          </p>
          <p className="tt-food-fee">
            {freeShip ? (
              <>
                <strong className="tt-fee-free">฿0</strong>
                {deliveryWas > 0 && <s>฿{(deliveryWas / 100).toFixed(0)}</s>}
              </>
            ) : (
              formatCatalogPrice(r.delivery_fee_micro)
            )}
            <span> · {etaShort(r.eta)}</span>
          </p>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={r.open ? `/m/food/${r.id}` : '#'}
      className={`tt-food-card tt-food-card--pro${r.open ? '' : ' closed'}`}
      aria-disabled={!r.open}
      onClick={(e) => { if (!r.open) e.preventDefault(); }}
    >
      <div className="tt-food-card-cover">
        {cover ? <img src={cover} alt="" loading="lazy" /> : <span className="tt-food-card-emoji" aria-hidden>{r.emoji}</span>}
        <span className="tt-food-eta">{etaShort(r.eta)}</span>
      </div>
      <div className="tt-food-card-body">
        <div className="tt-food-card-top">
          <h3>{r.name}</h3>
        </div>
        <p className="tt-food-meta">
          <span>⭐ {r.rating.toFixed(1)} ({r.review_count})</span>
          <span>·</span>
          <span>{r.cuisine}</span>
          <span>·</span>
          <span>{r.distance_km.toFixed(1)} กม.</span>
        </p>
        {r.tags && r.tags.length > 0 && (
          <div className="tt-food-tags">
            {r.tags.slice(0, 2).map((t) => (
              <span key={t} className="tt-food-tag">{t}</span>
            ))}
          </div>
        )}
        <p className="tt-food-fee">
          {freeShip ? (
            <>
              <strong className="tt-fee-free">ส่ง ฿0</strong>
              {deliveryWas > 0 && <s>{formatCatalogPrice(deliveryWas)}</s>}
            </>
          ) : (
            <>ค่าส่ง {formatCatalogPrice(r.delivery_fee_micro)}</>
          )}
          {r.min_order_micro > 0 && (
            <> · ขั้นต่ำ {formatCatalogPrice(r.min_order_micro)}</>
          )}
        </p>
      </div>
      {!r.open && (
        <StatusChip tone="offline" className="tt-food-closed">
          ปิด
        </StatusChip>
      )}
    </Link>
  );
}
