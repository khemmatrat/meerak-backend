import { bffGet } from '@/lib/bff';
import { ProductCard } from '@/components/ProductCard';
import Link from 'next/link';

export const revalidate = 30;

export default async function HomePage() {
  let data: any = { products: { products: [] }, categories: [], recommendations: {} };
  try {
    data = await bffGet('/v1/home');
  } catch {
    /* degrade gracefully */
  }
  const products = data.products?.products || data.products || [];

  return (
    <div>
      <h1 className="page-title">Discover</h1>
      <p style={{ color: 'var(--aq-color-muted)' }}>Personalized shop home — region {data.region || 'TH'}</p>
      <section style={{ marginBottom: '2rem' }}>
        <h2>Categories</h2>
        <div className="grid">
          {(data.categories || []).map((c: any) => (
            <Link key={c.id} href={`/shop?cat=${c.id}`} className="aq-card">{c.name}</Link>
          ))}
        </div>
      </section>
      <section>
        <h2>Trending products</h2>
        <div className="grid">
          {(Array.isArray(products) ? products : []).slice(0, 12).map((p: any) => (
            <ProductCard
              key={p.id || p.product_id}
              id={p.id || p.product_id}
              title={p.title || p.name || 'Product'}
              priceMicro={p.price_micro || 0}
            />
          ))}
        </div>
        {(!products || products.length === 0) && (
          <p className="empty">No products yet — seed catalog-svc or browse <Link href="/shop">Shop</Link></p>
        )}
      </section>
    </div>
  );
}
