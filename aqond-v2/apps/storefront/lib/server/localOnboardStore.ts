import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const DEV_CATALOG = path.join(process.cwd(), '.data', 'dev', 'catalog.json');

type LocalCatalogFile = {
  products: Array<Record<string, unknown>>;
};

async function readDevCatalog(): Promise<LocalCatalogFile> {
  try {
    return JSON.parse(await fs.readFile(DEV_CATALOG, 'utf8')) as LocalCatalogFile;
  } catch {
    return { products: [] };
  }
}

/** App-only dev fallback when Kong/catalog-svc write is unavailable. */
export async function createLocalOnboardProduct(input: {
  merchantId: string;
  storeName: string;
  title: string;
  description: string;
  category: string;
  priceMicro: number;
  inventory: number;
  seoTags: string[];
  imageUrl?: string | null;
  metadata: Record<string, unknown>;
}) {
  const id = `prod-${crypto.randomUUID().slice(0, 12)}`;
  const storeId = `store-${input.merchantId.replace(/[^a-z0-9]/gi, '').slice(0, 16) || 'local'}`;
  const product = {
    id,
    store_id: storeId,
    merchant_id: input.merchantId,
    title: input.title,
    description: input.description,
    category: input.category,
    price_micro: input.priceMicro,
    inventory: input.inventory,
    seo_tags: input.seoTags,
    status: 'published',
    image_url: input.imageUrl || undefined,
    metadata: input.metadata,
    source: 'local-dev',
    created_at: new Date().toISOString(),
  };

  const catalog = await readDevCatalog();
  catalog.products.push(product);
  await fs.mkdir(path.dirname(DEV_CATALOG), { recursive: true });
  await fs.writeFile(DEV_CATALOG, JSON.stringify(catalog, null, 2));

  return {
    product,
    store_id: storeId,
    variant: null,
  };
}
