import { bffGet } from '@/lib/bff';
import { ProductCard } from '@/components/ProductCard';

export default async function ShopPage() {
  let products: any[] = [];
  try {
    const data = await bffGet<any>('/v1/home');
    products = data.products?.products || [];
  } catch { /* empty */ }

  return (
    <div>
      <h1 className="page-title">Shop</h1>
      <div className="grid">
        {products.map((p: any) => (
          <ProductCard key={p.id} id={p.id} title={p.title || p.name} priceMicro={p.price_micro} />
        ))}
      </div>
      {products.length === 0 && <p className="empty">Catalog empty in dev-lite — add products via catalog-svc</p>}
    </div>
  );
}
