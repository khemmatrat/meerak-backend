import { enrichProductsWithImages } from '@/lib/server/listingMediaStore';
import {
  loadHomeProductsWithStatus,
  splitHomeProducts,
  type HomeProduct,
} from '@/lib/server/homeProducts';
import { AxsHomeProductsClient } from './AxsHomeProductsClient';

function syntheticProducts(count: number): HomeProduct[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `pv-synthetic-${i}`,
    title: `สินค้าทดสอบ #${i + 1}`,
    price_micro: 19900 + (i % 50) * 1000,
    category: 'general',
    merchant_hint: 'pv-test',
    source: 'pv-synthetic',
  }));
}

type AxsHomeProductsSectionProps = {
  catFilter?: string;
  pvTest?: string;
};

export async function AxsHomeProductsSection({ catFilter = '', pvTest }: AxsHomeProductsSectionProps) {
  const forceEmpty = process.env.NODE_ENV === 'development' && pvTest === 'empty';
  if (process.env.NODE_ENV === 'development' && pvTest === 'slow') {
    await new Promise((r) => setTimeout(r, 1200));
  }
  const load = await loadHomeProductsWithStatus({ forceEmpty });
  const split = splitHomeProducts(load.products);

  let freshProducts: HomeProduct[] = split.fresh;
  let restProducts: HomeProduct[] = split.rest;

  const filter = catFilter && catFilter !== 'all' ? catFilter : '';
  if (filter) {
    freshProducts = freshProducts.filter((p) => p.category === filter);
    restProducts = restProducts.filter((p) => p.category === filter);
  }

  let products: HomeProduct[] = [];

  if (process.env.NODE_ENV === 'development' && pvTest?.startsWith('massive')) {
    const n = Number.parseInt(pvTest.split('=')[1] || '100', 10) || 100;
    const synthetic = syntheticProducts(n);
    products = synthetic;
    freshProducts = synthetic.slice(0, Math.min(10, n));
    restProducts = synthetic.slice(Math.min(10, n));
  } else {
    freshProducts = await enrichProductsWithImages(freshProducts);
    restProducts = await enrichProductsWithImages(restProducts);
    products = [...freshProducts, ...restProducts];
  }

  return (
    <AxsHomeProductsClient
      freshProducts={freshProducts}
      restProducts={restProducts}
      products={products}
      promos={[]}
      connectionStatus={load.status}
    />
  );
}
