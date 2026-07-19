import fs from 'fs/promises';
import path from 'path';
import { enrichFoodMenuItem } from '@/lib/foodVisual';
import { computeShopOpenState, getShopOps, getBusyExtraPrepMinutes, isItemSoldOut } from '@/lib/server/merchantShopOps';
import {
  activePromotionsForShop,
  listMerchantPromotions,
  menuDiscountPercent,
} from '@/lib/server/merchantPromotions';
import {
  svcAddMerchantMenuItem,
  svcGetRestaurantMenu,
  svcListNearbyRestaurants,
  svcRemoveMerchantMenuItem,
  shouldUseLocalFoodFallback,
} from '@/lib/server/foodSvcClient';

const FOOD_FILE = path.join(process.cwd(), '.data', 'dev', 'food.json');

export type FoodRestaurant = {
  id: string;
  name: string;
  cuisine: string;
  emoji: string;
  rating: number;
  review_count: number;
  distance_km: number;
  prep_min: number;
  delivery_fee_micro: number;
  min_order_micro: number;
  open: boolean;
  tags?: string[];
  zone_id?: string;
  lat?: number;
  lng?: number;
};

export type FoodMenuItem = {
  id: string;
  merchant_id: string;
  title: string;
  description?: string;
  price_micro: number;
  image_url?: string;
  spicy?: boolean;
  popular?: boolean;
  /** ตัวเลือกเสริม — ลูกค้าติ๊กตอนสั่ง */
  options?: import('@/lib/foodOptions').FoodMenuOption[];
  /** ราคาหลังโปร (ถ้ามี) */
  promo_price_micro?: number;
  discount_percent?: number;
  /** ของหมดชั่วคราว */
  sold_out?: boolean;
};
export type FoodEta = {
  prep_min: number;
  travel_min: number;
  eta_min: number;
  eta_max: number;
  label: string;
};

const DEFAULT_RESTAURANTS: FoodRestaurant[] = [
  {
    id: 'food-thai-1',
    name: 'ครัวบ้านสวน',
    cuisine: 'อาหารไทย',
    emoji: '🍛',
    rating: 4.7,
    review_count: 328,
    distance_km: 0.8,
    prep_min: 12,
    delivery_fee_micro: 2500,
    min_order_micro: 8000,
    open: true,
    tags: ['ผัดไทย', 'ต้มยำ'],
    zone_id: 'sathorn',
    lat: 13.724,
    lng: 100.534,
  },
  {
    id: 'food-jp-1',
    name: 'ซูชิโฮมุระ',
    cuisine: 'ญี่ปุ่น',
    emoji: '🍣',
    rating: 4.5,
    review_count: 192,
    distance_km: 1.2,
    prep_min: 18,
    delivery_fee_micro: 3500,
    min_order_micro: 12000,
    open: true,
    tags: ['ซูชิ', 'เซ็ต'],
    zone_id: 'sathorn',
    lat: 13.721,
    lng: 100.531,
  },
  {
    id: 'food-cafe-1',
    name: 'Matcha House',
    cuisine: 'คาเฟ่',
    emoji: '☕',
    rating: 4.8,
    review_count: 510,
    distance_km: 0.5,
    prep_min: 8,
    delivery_fee_micro: 2000,
    min_order_micro: 6000,
    open: true,
    tags: ['matcha', 'เบเกอรี่'],
    zone_id: 'sathorn',
    lat: 13.726,
    lng: 100.536,
  },
  {
    id: 'food-street-1',
    name: 'ก๋วยเตี๋ยวลุงแดง',
    cuisine: 'เส้น · อาหารตามสั่ง',
    emoji: '🍜',
    rating: 4.4,
    review_count: 891,
    distance_km: 1.6,
    prep_min: 10,
    delivery_fee_micro: 2000,
    min_order_micro: 5000,
    open: true,
    tags: ['ก๋วยเตี๋ยว', 'หมูตุ๋น'],
    zone_id: 'sathorn',
    lat: 13.719,
    lng: 100.538,
  },
  {
    id: 'food-pizza-1',
    name: 'Pizza Corner',
    cuisine: 'อิตาเลียน',
    emoji: '🍕',
    rating: 4.3,
    review_count: 144,
    distance_km: 2.1,
    prep_min: 20,
    delivery_fee_micro: 4000,
    min_order_micro: 15000,
    open: false,
    tags: ['พิซซ่า', 'พาสต้า'],
    zone_id: 'rama9',
    lat: 13.758,
    lng: 100.565,
  },
];

const DEFAULT_MENUS: FoodMenuItem[] = [
  { id: 'dish-padthai', merchant_id: 'food-thai-1', title: 'ผัดไทยกุ้งสด', description: 'เส้นจันท์ กุ้งใหญ่ ถั่วงอก', price_micro: 8900, popular: true },
  { id: 'dish-tomyum', merchant_id: 'food-thai-1', title: 'ต้มยำกุ้ง', description: 'รสจัดจ้าน', price_micro: 12900, spicy: true, popular: true },
  { id: 'dish-basil', merchant_id: 'food-thai-1', title: 'ผัดกะเพราไก่ + ไข่ดาว', price_micro: 7900, spicy: true },
  { id: 'dish-mango', merchant_id: 'food-thai-1', title: 'ข้าวเหนียวมะม่วง', price_micro: 6900 },
  { id: 'dish-sushi-set', merchant_id: 'food-jp-1', title: 'เซ็ตซูชิ 12 ชิ้น', description: 'แซลมอน · ทูน่า · ปลาหมึก', price_micro: 24900, popular: true, options: [
    { id: 'opt-wasabi', label: 'เพิ่มวาซาบิ', price_micro: 0 },
    { id: 'opt-shoyu', label: 'ซอสโชยุพิเศษ', price_micro: 0 },
    { id: 'opt-extra-ginger', label: 'เพิ่มขิงดอง', price_micro: 0 },
    { id: 'opt-salmon2', label: 'เพิ่มแซลมอน 2 ชิ้น', price_micro: 4500 },
  ]},
  { id: 'dish-salmon', merchant_id: 'food-jp-1', title: 'ซาชิมิแซลมอน', price_micro: 18900 },
  { id: 'dish-ramen', merchant_id: 'food-jp-1', title: 'ราเมนโทนคอตสึ', price_micro: 15900 },
  { id: 'dish-matcha-latte', merchant_id: 'food-cafe-1', title: 'Matcha Latte', description: 'ใบชาเกรดพรีเมียม', price_micro: 8900, popular: true },
  { id: 'dish-croissant', merchant_id: 'food-cafe-1', title: 'ครัวซองต์เนยสด', price_micro: 6900 },
  { id: 'dish-cake', merchant_id: 'food-cafe-1', title: 'เค้กช็อกโกแลต', price_micro: 9900 },
  { id: 'dish-noodle-pork', merchant_id: 'food-street-1', title: 'ก๋วยเตี๋ยวหมูตุ๋น', price_micro: 5500, popular: true },
  { id: 'dish-noodle-dry', merchant_id: 'food-street-1', title: 'บะหมี่แห้งหมูแดง', price_micro: 5000 },
  { id: 'dish-wonton', merchant_id: 'food-street-1', title: 'เกี๊ยวน้ำ', price_micro: 5500 },
  { id: 'dish-pizza-m', merchant_id: 'food-pizza-1', title: 'พิซซ่ามาร์เกอริต้า M', price_micro: 19900, popular: true },
  { id: 'dish-pizza-pep', merchant_id: 'food-pizza-1', title: 'พิซซ่าเปปเปอร์โรนี M', price_micro: 22900 },
];

async function loadFoodData() {
  try {
    const raw = JSON.parse(await fs.readFile(FOOD_FILE, 'utf8'));
    return {
      restaurants: (raw.restaurants || DEFAULT_RESTAURANTS) as FoodRestaurant[],
      menu: (raw.menu || DEFAULT_MENUS) as FoodMenuItem[],
    };
  } catch {
    return { restaurants: DEFAULT_RESTAURANTS, menu: DEFAULT_MENUS };
  }
}

async function saveFoodData(data: { restaurants: FoodRestaurant[]; menu: FoodMenuItem[] }) {
  await fs.mkdir(path.dirname(FOOD_FILE), { recursive: true });
  await fs.writeFile(FOOD_FILE, JSON.stringify(data, null, 2), 'utf8');
}

export async function addMerchantMenuItem(input: {
  merchant_id: string;
  title: string;
  description?: string;
  price_micro: number;
  spicy?: boolean;
  popular?: boolean;
  options?: import('@/lib/foodOptions').FoodMenuOption[];
}, auth?: import('@/lib/server/upstreamAuth').UpstreamAuth) {
  const svc = await svcAddMerchantMenuItem(input, auth);
  if (svc?.item) return enrichFoodMenuItem(svc.item);

  if (!shouldUseLocalFoodFallback()) {
    throw new Error('food_svc_unavailable');
  }
  const data = await loadFoodData();
  const id = `dish-${Date.now().toString(36)}`;
  const item: FoodMenuItem = {
    id,
    merchant_id: input.merchant_id,
    title: input.title.trim(),
    description: input.description?.trim(),
    price_micro: input.price_micro,
    spicy: input.spicy,
    popular: input.popular,
    options: (input.options || []).filter((o) => o.label?.trim()),
  };
  data.menu.push(item);
  await saveFoodData(data);
  return enrichFoodMenuItem(item);
}

export async function removeMerchantMenuItem(merchantId: string, itemId: string, auth?: import('@/lib/server/upstreamAuth').UpstreamAuth) {
  const svc = await svcRemoveMerchantMenuItem(merchantId, itemId, auth);
  if (svc?.ok) return true;

  if (!shouldUseLocalFoodFallback()) return false;
  const data = await loadFoodData();
  const before = data.menu.length;
  data.menu = data.menu.filter((m) => !(m.merchant_id === merchantId && m.id === itemId));
  if (data.menu.length === before) return false;
  await saveFoodData(data);
  return true;
}

export function estimateFoodEta(restaurant: FoodRestaurant, extraPrepMin = 0): FoodEta {
  const travelMin = Math.max(5, Math.round(restaurant.distance_km * 5 + 4));
  const prepMin = restaurant.prep_min + Math.max(0, extraPrepMin);
  const etaMin = prepMin + travelMin;
  const etaMax = etaMin + 7;
  return {
    prep_min: prepMin,
    travel_min: travelMin,
    eta_min: etaMin,
    eta_max: etaMax,
    label: `${etaMin}–${etaMax} นาที`,
  };
}

export async function listNearbyRestaurants(opts?: { sort?: 'distance' | 'rating' }) {
  const svc = await svcListNearbyRestaurants(opts?.sort);
  const base = svc?.restaurants
    ?? (shouldUseLocalFoodFallback() ? (await loadFoodData()).restaurants : []);

  if (!base.length && !shouldUseLocalFoodFallback()) return [];

  const withOpen = await Promise.all(
    base.map(async (r) => {
      const ops = await getShopOps(r.id);
      const { effective_open } = computeShopOpenState(ops);
      const busyExtra = getBusyExtraPrepMinutes(ops);
      return { ...r, open: effective_open, eta: estimateFoodEta(r, busyExtra), busy_extra_min: busyExtra };
    }),
  );
  const openFirst = [...withOpen].sort((a, b) => {
    if (a.open !== b.open) return a.open ? -1 : 1;
    if (opts?.sort === 'rating') return b.rating - a.rating;
    return a.distance_km - b.distance_km;
  });
  return openFirst.map((r) => ({
    ...r,
    eta: r.eta || estimateFoodEta(r, r.busy_extra_min || 0),
  }));
}

export async function getRestaurantMenu(merchantId: string) {
  const svc = await svcGetRestaurantMenu(merchantId);
  let restaurant: FoodRestaurant | undefined;
  let menu: FoodMenuItem[] = [];

  if (svc?.restaurant) {
    restaurant = svc.restaurant;
    menu = svc.menu || [];
  } else if (shouldUseLocalFoodFallback()) {
    const data = await loadFoodData();
    restaurant = data.restaurants.find((r) => r.id === merchantId);
    menu = data.menu.filter((m) => m.merchant_id === merchantId);
  }
  if (!restaurant) return null;

  const ops = await getShopOps(merchantId);
  const openState = computeShopOpenState(ops);
  const busyExtra = getBusyExtraPrepMinutes(ops);
  const eta = estimateFoodEta(restaurant, busyExtra);
  const promos = await listMerchantPromotions(merchantId);
  const activePromos = activePromotionsForShop(promos);
  return {
    restaurant: {
      ...restaurant,
      open: openState.effective_open,
      open_label: openState.label,
      eta,
      busy_extra_min: busyExtra,
    },
    promotions: activePromos,
    menu: menu
      .filter((m) => m.merchant_id === merchantId)
      .map((item) => {
        const pct = menuDiscountPercent(promos, item.id);
        const promoPrice = pct ? Math.round((item.price_micro * (100 - pct)) / 100) : undefined;
        return enrichFoodMenuItem({
          ...item,
          promo_price_micro: promoPrice,
          discount_percent: pct || undefined,
          sold_out: isItemSoldOut(ops, item.id),
        });
      }),
  };
}

export async function getRestaurantById(merchantId: string) {
  const svc = await svcGetRestaurantMenu(merchantId);
  let restaurant: FoodRestaurant | undefined = svc?.restaurant;
  if (!restaurant && shouldUseLocalFoodFallback()) {
    const { restaurants } = await loadFoodData();
    restaurant = restaurants.find((r) => r.id === merchantId);
  }
  if (!restaurant) return null;
  const ops = await getShopOps(merchantId);
  const openState = computeShopOpenState(ops);
  const busyExtra = getBusyExtraPrepMinutes(ops);
  return {
    ...restaurant,
    open: openState.effective_open,
    open_label: openState.label,
    eta: estimateFoodEta(restaurant, busyExtra),
    busy_extra_min: busyExtra,
  };
}

export async function getFoodItemBySku(sku: string) {
  const id = String(sku || '').trim();
  if (!id) return null;

  for (const r of await listNearbyRestaurants()) {
    const menu = await getRestaurantMenu(r.id);
    const item = menu?.menu.find((m) => m.id === id);
    if (item && menu?.restaurant) {
      return { item, merchant_id: r.id, restaurant: menu.restaurant };
    }
  }

  if (shouldUseLocalFoodFallback()) {
    const data = await loadFoodData();
    const item = data.menu.find((m) => m.id === id);
    if (!item) return null;
    const restaurant = data.restaurants.find((r) => r.id === item.merchant_id);
    if (!restaurant) return null;
    return { item, merchant_id: item.merchant_id, restaurant };
  }

  return null;
}

export async function buildFoodSeedPayload() {
  const data = await loadFoodData();
  return {
    region: 'TH',
    source: 'local-dev',
    restaurants: data.restaurants.map((r) => ({ ...r, eta: estimateFoodEta(r) })),
    menu_count: data.menu.length,
  };
}
