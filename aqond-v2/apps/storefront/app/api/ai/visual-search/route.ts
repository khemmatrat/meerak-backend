import { NextRequest, NextResponse } from 'next/server';
import { aiCoreApi, aiCoreKey, catalogApi } from '@/lib/server-env';
import { buildProductEmbedding } from '@/lib/server/productEmbedding';
import { hydrateCatalogProducts, queryRecsysProducts } from '@/lib/server/catalogIndex';

export const maxDuration = 300;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,./|]+/)
    .filter((t) => t.length > 1)
    .slice(0, 12);
}

function scoreProduct(p: any, tokens: string[]): number {
  const hay = `${p.title || ''} ${p.category || ''}`.toLowerCase();
  let score = 0;
  for (const t of tokens) {
    if (hay.includes(t)) score += 2;
  }
  return score;
}

async function loadCatalog(category?: string) {
  try {
    const q = category ? `&category=${encodeURIComponent(category)}` : '';
    const catRes = await fetch(catalogApi(`/v1/products?status=published&limit=100${q}`), {
      next: { revalidate: 0 },
    });
    const cat = await catRes.json();
    return cat.products || [];
  } catch {
    return [];
  }
}

function rankProductsText(catalogProducts: any[], tokens: string[], category?: string) {
  let pool = catalogProducts;
  if (category) {
    const filtered = pool.filter((p) => p.category === category);
    if (filtered.length > 0) pool = filtered;
  }

  const ranked = pool
    .map((p) => ({ ...p, _score: scoreProduct(p, tokens) }))
    .filter((p) => p._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 12);

  if (ranked.length === 0 && tokens.length > 0) {
    ranked.push(
      ...pool
        .filter((p) => tokens.some((t) => (p.title || '').toLowerCase().includes(t.slice(0, 4))))
        .slice(0, 8),
    );
  }

  if (ranked.length === 0) {
    ranked.push(...pool.slice(0, 8));
  }

  return ranked.map(({ _score, ...p }) => p);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.image_base64) {
    return NextResponse.json({ error: 'image_base64 required' }, { status: 400 });
  }

  const imageB64 = body.image_base64.startsWith('data:')
    ? body.image_base64
    : `data:image/jpeg;base64,${body.image_base64}`;

  const key = aiCoreKey();
  const aiHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) aiHeaders['X-AI-Core-Api-Key'] = key;

  let vision = '';
  let latencyMs = 0;
  let fallback = false;
  let fallbackReason = '';
  let mode: 'recsys' | 'text' = 'recsys';

  try {
    const aiRes = await fetch(aiCoreApi('/v1/vision/describe'), {
      method: 'POST',
      headers: aiHeaders,
      body: JSON.stringify({
        image_base64: imageB64.replace(/^data:image\/\w+;base64,/, ''),
        merchant_hint: body.hint || body.category || 'identify product for shopping search in Thai marketplace',
      }),
      signal: AbortSignal.timeout(180000),
    });
    const ai = await aiRes.json().catch(() => ({}));
    if (!aiRes.ok) {
      throw new Error(ai.detail || ai.error || 'vision_failed');
    }
    vision = ai.vision_description || '';
    latencyMs = ai.latency_ms || 0;
  } catch (e: any) {
    fallback = true;
    fallbackReason = e.message || 'ai_unreachable';
    vision = 'โหมดสำรอง — Ollama ไม่พร้อม แสดงสินค้าจากหมวดที่เลือก';
  }

  const queryVector = buildProductEmbedding({
    vision,
    title: body.hint,
    category: body.category,
    imageBase64: imageB64,
  });

  const candidates = await queryRecsysProducts(queryVector, 12);
  let products: any[] = [];

  if (candidates.length > 0) {
    const ids = candidates.map((c) => c.item_id);
    const hydrated = await hydrateCatalogProducts(ids);
    const scoreMap = new Map(candidates.map((c) => [c.item_id, c.score]));
    products = ids
      .map((id) => {
        const p = hydrated.find((h) => h.id === id);
        if (!p) return null;
        return { ...p, _recsys_score: scoreMap.get(id) || 0 };
      })
      .filter(Boolean) as any[];
  }

  if (products.length === 0) {
    mode = 'text';
    const tokens = tokenize(`${vision} ${body.hint || ''} ${body.category || ''}`);
    const catalogProducts = await loadCatalog(body.category);
    products = rankProductsText(catalogProducts, tokens, body.category);
    if (fallback) {
      fallbackReason = `${fallbackReason}; recsys_empty`;
    }
  }

  const tokens = tokenize(`${vision} ${body.hint || ''} ${body.category || ''}`);

  return NextResponse.json({
    ok: true,
    mode,
    fallback,
    fallback_reason: fallback ? fallbackReason : undefined,
    query: tokens.slice(0, 3).join(' ') || body.category || 'แนะนำ',
    vision_description: vision,
    products,
    latency_ms: latencyMs,
  });
}
