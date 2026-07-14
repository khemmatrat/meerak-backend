import { formatCatalogPrice } from '@/lib/format';

type Props = {
  emoji?: string;
  name: string;
  subtitle?: string;
  meta?: string;
  deliveryFeeMicro?: number;
  itemCount?: number;
};

export function TtCheckoutMerchantHeader({
  emoji = '🏪',
  name,
  subtitle,
  meta,
  deliveryFeeMicro,
  itemCount,
}: Props) {
  return (
    <div className="tt-checkout-merchant">
      <span className="tt-checkout-merchant-emoji" aria-hidden>{emoji}</span>
      <div className="tt-checkout-merchant-body">
        <strong className="tt-checkout-merchant-name">{name}</strong>
        {subtitle && <p className="tt-checkout-merchant-sub">{subtitle}</p>}
        {meta && <p className="tt-checkout-merchant-meta">{meta}</p>}
      </div>
      <div className="tt-checkout-merchant-side">
        {itemCount != null && <span className="tt-checkout-merchant-count">{itemCount} รายการ</span>}
        {deliveryFeeMicro != null && (
          <span className="tt-checkout-merchant-fee">ส่ง {formatCatalogPrice(deliveryFeeMicro)}</span>
        )}
      </div>
    </div>
  );
}
