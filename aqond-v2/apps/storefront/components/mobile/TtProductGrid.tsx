import { TtProductCard } from './TtProductCard';

export type TtProduct = {
  id: string;
  title?: string;
  name?: string;
  price_micro?: number;
  price_thb?: number;
  category?: string;
  image_url?: string;
};

export function TtProductGrid({ products }: { products: TtProduct[] }) {
  if (!products.length) {
    return <p className="tt-loading">ยังไม่มีสินค้าในหมวดนี้</p>;
  }
  return (
    <div className="tt-grid">
      {products.map((p) => (
        <TtProductCard
          key={p.id}
          id={p.id}
          title={p.title || p.name || 'สินค้า'}
          priceMicro={p.price_micro}
          priceThb={p.price_thb}
          category={p.category}
          imageUrl={p.image_url}
        />
      ))}
    </div>
  );
}
