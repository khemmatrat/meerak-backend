import Link from 'next/link';
import { Suspense } from 'react';
import { bffGet } from '@/lib/bff';
import { catalogApi } from '@/lib/server-env';
import { getProductImageUrl } from '@/lib/server/listingMediaStore';
import { resolveStorefrontProduct } from '@/lib/server/resolveStorefrontProduct';
import { pickImageUrl } from '@/lib/productVisual';
import { MobileProductClient } from '@/components/mobile/MobileProductClient';

async function fetchCatalogDirect(id: string) {
  try {
    const res = await fetch(catalogApi(`/v1/products/${id}`), { cache: 'no-store' });
    if (res.ok) return res.json();
  } catch {
    /* ignore */
  }
  return null;
}

async function loadProduct(id: string) {
  let data: any = null;
  try {
    data = await bffGet<any>(`/v1/product?id=${encodeURIComponent(id)}`);
  } catch {
    data = null;
  }

  let prod = data?.product || {};
  let title = data?.i18n?.title || prod.title || prod.name || '';
  let priceMicro = data?.price?.price_micro || prod.price_micro || 0;
  let category = prod.category || 'general';
  let merchantId = prod.merchant_id || prod.store_id;
  let imageUrl = pickImageUrl(prod);
  const reviews = data?.reviews || undefined;
  const description = data?.i18n?.description || prod.description;

  if (!imageUrl || !title || !priceMicro) {
    const direct = await fetchCatalogDirect(id);
    if (direct) {
      title = title || direct.title || '';
      imageUrl = imageUrl || pickImageUrl(direct);
      prod = { ...prod, ...direct };
    }
  }

  if (!title || !priceMicro) {
    try {
      const home = await bffGet<any>('/v1/home');
      const hit = (home.products?.products || []).find((p: any) => p.id === id);
      if (hit) {
        title = title || hit.title || hit.name;
        priceMicro = priceMicro || hit.price_micro || 0;
        category = hit.category || category;
        merchantId = merchantId || hit.merchant_id || hit.store_id;
        imageUrl = imageUrl || pickImageUrl(hit);
        prod = { ...prod, ...hit };
      }
    } catch {
      /* ignore */
    }
  }

  if (!imageUrl) {
    imageUrl = await getProductImageUrl(id);
  }

  if (!title || !priceMicro) {
    const local = await resolveStorefrontProduct(id);
    if (local) {
      title = title || local.title;
      priceMicro = priceMicro || local.price_micro || 0;
      category = category || local.category || category;
      merchantId = merchantId || local.merchant_id;
      imageUrl = imageUrl || ('image_url' in local ? local.image_url : undefined);
    }
  }

  if (!title) return null;

  return { title, priceMicro, category, merchantId, reviews, description, imageUrl };
}

export default async function MobileProductPage({ params }: { params: { id: string } }) {
  const loaded = await loadProduct(params.id);

  if (!loaded) {
    return (
      <>
        <header className="tt-header">
          <div className="tt-header-row">
            <Link href="/m/home" className="tt-back">‹</Link>
            <span style={{ flex: 1, fontWeight: 700 }}>สินค้า</span>
          </div>
        </header>
        <p className="tt-loading">ไม่พบสินค้า — ลองกลับหน้าแรก</p>
        <Link href="/m/home" className="tt-btn-primary" style={{ display: 'block', margin: '16px auto', maxWidth: 200, textAlign: 'center' }}>
          หน้าแรก
        </Link>
      </>
    );
  }

  return (
    <Suspense fallback={<p className="tt-loading">กำลังโหลดสินค้า...</p>}>
      <MobileProductClient
        id={params.id}
        title={loaded.title}
        priceMicro={loaded.priceMicro}
        category={loaded.category}
        merchantId={loaded.merchantId}
        imageUrl={loaded.imageUrl}
      />
    </Suspense>
  );
}
