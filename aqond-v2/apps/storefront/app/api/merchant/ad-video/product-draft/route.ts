import { NextRequest, NextResponse } from 'next/server';
import { generateAdProductDraft } from '@/lib/server/merchantAdProductDraft';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const productTitle = String(body.product_title || body.productTitle || '').trim();
  const visualNotes = String(body.visual_notes || body.visualNotes || '').trim();
  const categoryStyle = String(body.category_style || body.categoryStyle || 'general');
  const isFood = Boolean(body.is_food ?? body.isFood);
  const foodStyle = String(body.food_style || body.foodStyle || 'fresh');
  const imageUrl = String(body.image_url || body.imageUrl || '').trim() || undefined;

  const draft = await generateAdProductDraft({
    productTitle: productTitle || undefined,
    visualNotes: visualNotes || undefined,
    categoryStyle,
    isFood,
    foodStyle,
    imageUrl,
  });

  return NextResponse.json({ ok: true, draft });
}
