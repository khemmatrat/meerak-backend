import type { JarvisFeedContext } from '@/lib/server/localJarvis';
import { getRestaurantById, getRestaurantMenu } from './localFood';

/** Map catalog/feed products → food delivery merchant. */
const PRODUCT_MERCHANT: Record<string, string> = {
  'prod-matcha': 'food-cafe-1',
  'prod-snack': 'food-street-1',
};

function guessMerchantFromText(text: string): string | undefined {
  const t = text.toLowerCase();
  if (/matcha|มัทฉะ|ชาเขียว|latte/.test(t)) return 'food-cafe-1';
  if (/ขนม|snack|กรอบ/.test(t)) return 'food-street-1';
  if (/ก๋วยเตี๋ยว|เส้น|หมูตุ๋น/.test(t)) return 'food-street-1';
  if (/ซูชิ|ญี่ปุ่น|sushi/.test(t)) return 'food-jp-1';
  if (/พิซซ่า|pizza/.test(t)) return 'food-pizza-1';
  if (/ผัดไทย|ต้มยำ|อาหารไทย/.test(t)) return 'food-thai-1';
  return undefined;
}

export function resolveFoodMerchantId(ctx: JarvisFeedContext): string | undefined {
  if (ctx.food_merchant_id) return ctx.food_merchant_id;
  if (ctx.product_id && PRODUCT_MERCHANT[ctx.product_id]) {
    return PRODUCT_MERCHANT[ctx.product_id];
  }
  const hay = `${ctx.product_title || ''} ${ctx.caption || ''}`;
  const guessed = guessMerchantFromText(hay);
  if (guessed) return guessed;
  if (ctx.category === 'food') return 'food-thai-1';
  return undefined;
}

export async function enrichFeedContextForFood(ctx: JarvisFeedContext): Promise<JarvisFeedContext> {
  const merchantId = resolveFoodMerchantId(ctx);
  if (!merchantId) return ctx;

  const restaurant = await getRestaurantById(merchantId);
  if (!restaurant) return { ...ctx, is_food: true, food_merchant_id: merchantId };

  return {
    ...ctx,
    is_food: true,
    food_merchant_id: merchantId,
    food_merchant_name: restaurant.name,
    category: ctx.category || 'food',
  };
}

export async function feedFoodMenuForContext(ctx: JarvisFeedContext) {
  const merchantId = resolveFoodMerchantId(ctx);
  if (!merchantId) return null;
  return getRestaurantMenu(merchantId);
}
