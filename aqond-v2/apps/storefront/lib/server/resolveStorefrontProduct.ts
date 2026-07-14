import { loadHomeProducts, type HomeProduct } from '@/lib/server/homeProducts';
import { findCatalogProductById, type MerchantCatalogProduct } from '@/lib/server/merchantCatalog';

/** Same resolution order as home listing — catalog, affiliate, then merged home feed. */
export async function resolveStorefrontProduct(
  productId: string,
): Promise<MerchantCatalogProduct | HomeProduct | null> {
  const fromCatalog = await findCatalogProductById(productId);
  if (fromCatalog?.title) return fromCatalog;

  const homeHit = (await loadHomeProducts()).find((p) => String(p.id) === productId);
  if (homeHit?.title || homeHit?.name) {
    return {
      id: homeHit.id,
      title: String(homeHit.title || homeHit.name || homeHit.id),
      price_micro: Number(homeHit.price_micro) || 19900,
      merchant_id: String(homeHit.merchant_hint || homeHit.merchant_id || 'demo-merchant'),
      category: homeHit.category ? String(homeHit.category) : undefined,
      image_url: homeHit.image_url ? String(homeHit.image_url) : undefined,
      source: homeHit.source ? String(homeHit.source) : undefined,
    };
  }

  return null;
}
