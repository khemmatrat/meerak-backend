import { formatCatalogPrice } from '@/lib/format';
import { TtProductThumb } from './TtProductThumb';

type Props = {
  title: string;
  qty: number;
  unitPriceMicro: number;
  imageUrl?: string;
  category?: string;
  description?: string;
  variant?: string;
};

export function TtCheckoutItemLine({
  title,
  qty,
  unitPriceMicro,
  imageUrl,
  category = 'food',
  description,
  variant,
}: Props) {
  const lineMicro = unitPriceMicro * qty;
  return (
    <div className="tt-checkout-item">
      <TtProductThumb category={category} title={title} imageUrl={imageUrl} className="tt-checkout-item-thumb" />
      <div className="tt-checkout-item-body">
        <p className="tt-checkout-item-title">{title}</p>
        {description && <p className="tt-checkout-item-desc">{description}</p>}
        {variant && <p className="tt-checkout-item-variant">{variant}</p>}
        <p className="tt-checkout-item-meta">
          {formatCatalogPrice(unitPriceMicro)} × {qty}
        </p>
      </div>
      <span className="tt-checkout-item-price">{formatCatalogPrice(lineMicro)}</span>
    </div>
  );
}
