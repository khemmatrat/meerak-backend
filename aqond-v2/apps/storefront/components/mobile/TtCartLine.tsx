import Link from 'next/link';
import { formatCatalogPrice } from '@/lib/format';
import { TtProductThumb } from './TtProductThumb';

type Props = {
  item: {
    product_id?: string;
    title?: string;
    qty?: number;
    line_micro?: number;
    unit_price_micro?: number;
    image_url?: string;
    category?: string;
    merchant_name?: string;
    description?: string;
  };
  priceLabel: string;
  linkProduct?: boolean;
  showUnitPrice?: boolean;
  editable?: boolean;
  busy?: boolean;
  onQtyChange?: (nextQty: number) => void;
};

export function TtCartLine({
  item,
  priceLabel,
  linkProduct = true,
  showUnitPrice = false,
  editable = false,
  busy,
  onQtyChange,
}: Props) {
  const qty = item.qty || 1;
  const unitMicro = item.unit_price_micro || 0;
  const lineMicro = item.line_micro ?? unitMicro * qty;

  const body = (
    <>
      <TtProductThumb category={item.category} title={item.title} imageUrl={item.image_url} />
      <div className="tt-cart-line-info">
        {item.merchant_name && <p className="tt-cart-line-shop">{item.merchant_name}</p>}
        <p className="tt-cart-line-title">{item.title || 'สินค้า'}</p>
        {item.description && <p className="tt-cart-line-desc">{item.description}</p>}
        {editable && onQtyChange ? (
          <div className="tt-cart-line-qty-row">
            <div className="tt-food-qty-stepper" data-testid="cart-qty-stepper">
              <button
                type="button"
                className="tt-food-qty-btn"
                disabled={busy}
                aria-label="ลดจำนวน"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onQtyChange(qty - 1);
                }}
              >
                −
              </button>
              <span className="tt-food-qty-num" aria-live="polite">
                {qty}
              </span>
              <button
                type="button"
                className="tt-food-qty-btn"
                disabled={busy}
                aria-label="เพิ่มจำนวน"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onQtyChange(qty + 1);
                }}
              >
                +
              </button>
            </div>
            {qty <= 1 ? (
              <button
                type="button"
                className="tt-cart-line-remove"
                disabled={busy}
                data-testid="cart-remove-item"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onQtyChange(0);
                }}
              >
                ลบ
              </button>
            ) : null}
          </div>
        ) : (
          <p className="tt-cart-line-qty">
            × {qty}
            {showUnitPrice && unitMicro > 0 && (
              <span className="tt-cart-line-unit"> · {formatCatalogPrice(unitMicro)}/ชิ้น</span>
            )}
          </p>
        )}
      </div>
      <span className="tt-cart-line-price">{editable ? formatCatalogPrice(lineMicro) : priceLabel}</span>
    </>
  );

  if (linkProduct && item.product_id && !editable) {
    return (
      <Link href={`/m/product/${item.product_id}`} className="tt-cart-line" data-testid="cart-line-item">
        {body}
      </Link>
    );
  }

  return (
    <div className="tt-cart-line" data-testid="cart-line-item">
      {body}
    </div>
  );
}
