import { NextRequest, NextResponse } from 'next/server';
import { allowLocalDev, catalogWriteApi } from '@/lib/server-env';
import { uploadListingImageWithFallback } from '@/lib/server/minioUpload';
import { bindProductImage } from '@/lib/server/listingMediaStore';
import { hermesOptimize, indexProductOnPublish } from '@/lib/server/catalogIndex';
import { createLocalOnboardProduct } from '@/lib/server/localOnboardStore';
import { rulesDraftFromHint, rulesDraftFromVision, tryVisionDescribe } from '@/lib/server/onboardDraft';
import { upstreamAuthFromRequest, upstreamAuthHeaders } from '@/lib/server/upstreamAuth';

export const maxDuration = 120;

type OnboardBody = {
  image_base64?: string;
  merchant_hint?: string;
  merchant_id?: string;
  store_name?: string;
  publish?: boolean;
  force_ai?: boolean;
  user_id?: string;
};

async function catalogPost(path: string, body: unknown, userId: string) {
  const headers = upstreamAuthHeaders({ userId });
  const res = await fetch(catalogWriteApi(path), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { error?: string }).error || res.statusText || 'catalog_failed';
    throw new Error(msg);
  }
  return data;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as OnboardBody;
  if (!body.image_base64) {
    return NextResponse.json({ error: 'image_base64 required' }, { status: 400 });
  }

  const auth = upstreamAuthFromRequest(req);
  const userId = auth.userId || body.user_id || body.merchant_id || 'guest-seller';

  const imageB64 = body.image_base64.startsWith('data:')
    ? body.image_base64
    : `data:image/jpeg;base64,${body.image_base64}`;
  const hint = body.merchant_hint || body.store_name || '';

  const uploaded = await uploadListingImageWithFallback(imageB64);

  let aiMode: 'vision' | 'rules' = 'rules';
  let vision = '';
  let latencyMs = 0;
  let aiNote = '';

  const visionResult = await tryVisionDescribe(imageB64, hint);
  if (visionResult) {
    aiMode = 'vision';
    vision = visionResult.vision;
    latencyMs = visionResult.latency_ms;
  } else {
    aiNote = 'AI ไม่พร้อม — ใช้ Hermes rules จากคำใบ้ (เร็วกว่า ไม่ต้องรอ Ollama)';
  }

  const draft = vision ? rulesDraftFromVision(vision, hint) : rulesDraftFromHint(hint || 'สินค้าใหม่');

  const merchantId = body.merchant_id || userId || `seller-${Date.now()}`;
  const storeName = body.store_name || draft.title.slice(0, 40) || 'ร้านของฉัน';

  const hermes = await hermesOptimize({
    merchantId,
    productId: 'draft',
    title: draft.title,
    description: draft.description,
    category: draft.category,
  });

  const title = hermes?.title || draft.title;
  const description = hermes?.description || draft.description;
  const category = draft.category;
  const seoTags = hermes?.seo_tags || draft.seo_tags || [];

  const priceMicro = Math.round(draft.price_thb * 100);
  const metadata: Record<string, unknown> = {
    vision_description: vision,
    hermes: hermes ? { source: hermes.source, score: hermes.score } : null,
    ai_mode: aiMode,
  };
  if (uploaded) {
    metadata.image_url = uploaded.url;
    metadata.images = [{ url: uploaded.url, primary: true, key: uploaded.key }];
  }

  let storeId = '';
  let created: { product?: Record<string, unknown>; variant?: unknown } | null = null;
  let catalogMode: 'catalog-svc' | 'local-dev' = 'catalog-svc';

  try {
    const store = await catalogPost('/v1/stores', {
      merchant_id: merchantId,
      slug: `shop-${merchantId.replace(/[^a-z0-9]/gi, '').slice(0, 12)}`,
      display_name: storeName,
      region: 'TH',
    }, userId);
    storeId = store.store?.id;

    created = await catalogPost('/v1/products', {
      store_id: storeId,
      merchant_id: merchantId,
      title,
      description,
      category,
      price_micro: priceMicro,
      inventory: draft.inventory,
      seo_tags: seoTags,
      metadata,
      status: 'draft',
    }, userId);
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : 'catalog_failed';
    if (!allowLocalDev()) {
      return NextResponse.json({ error: 'store_create_failed', detail }, { status: 502 });
    }
    catalogMode = 'local-dev';
    aiNote = aiNote
      ? `${aiNote} · บันทึก local (.data/dev/catalog.json) เพราะ catalog: ${detail}`
      : `บันทึก local (.data/dev/catalog.json) — catalog: ${detail}`;
    const local = await createLocalOnboardProduct({
      merchantId,
      storeName,
      title,
      description,
      category,
      priceMicro,
      inventory: draft.inventory,
      seoTags,
      imageUrl: uploaded?.url || null,
      metadata,
    });
    storeId = local.store_id;
    created = { product: local.product, variant: local.variant };
  }

  const productId = String(created?.product?.id || '');
  let boundImageUrl: string | null = null;
  if (productId) {
    boundImageUrl = await bindProductImage(productId, imageB64);
  }

  let published = catalogMode === 'local-dev';
  let indexed = { embedding: false, search: false };

  if (body.publish !== false && productId && catalogMode === 'catalog-svc') {
    const pub = await fetch(catalogWriteApi(`/v1/products/${productId}/publish`), {
      method: 'POST',
      headers: upstreamAuthHeaders({ userId }),
    });
    published = pub.ok;
    if (published) {
      indexed = await indexProductOnPublish({
        productId,
        merchantId,
        title,
        description,
        category,
        priceMicro,
        seoTags,
        vision,
        imageBase64: imageB64,
      });
    }
  }

  const imageUrl = boundImageUrl || uploaded?.url;

  return NextResponse.json({
    ok: true,
    catalog_mode: catalogMode,
    ai_mode: aiMode,
    ai_note: aiNote || undefined,
    ai: { vision_description: vision, latency_ms: latencyMs },
    hermes: hermes || undefined,
    media: uploaded
      ? { url: imageUrl || uploaded.url, storage: uploaded.storage }
      : boundImageUrl
        ? { url: boundImageUrl, storage: 'local' }
        : { storage: 'none', hint: 'upload failed' },
    product: {
      ...created?.product,
      image_url: imageUrl,
      metadata,
      title,
      price_thb: draft.price_thb,
    },
    variant: created?.variant,
    merchant_id: merchantId,
    store_id: storeId,
    published,
    indexed,
  });
}
