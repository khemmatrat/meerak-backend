import { listNearbyRestaurants, type FoodRestaurant } from '@/lib/server/localFood';
import { restaurantCoverUrl } from '@/lib/foodVisual';

export type FoodHomeBanner = {
  id: string;
  title: string;
  subtitle?: string;
  image_url: string;
  href?: string;
  badge?: string;
};

export type FoodHomeCategory = {
  id: string;
  label: string;
  emoji: string;
  filter: string;
};

export type FoodHomeBrand = {
  id: string;
  name: string;
  logo_emoji: string;
  merchant_id: string;
  cover_url?: string;
};

export type FoodHomeSection = {
  id: string;
  title: string;
  subtitle?: string;
  icon?: string;
  restaurant_ids: string[];
};

export type FoodHomeFeed = {
  location_label: string;
  banners: FoodHomeBanner[];
  categories: FoodHomeCategory[];
  brands: FoodHomeBrand[];
  sections: FoodHomeSection[];
  promo_strip: { title: string; subtitle: string; code?: string };
  restaurants: FoodRestaurant[];
};

const CATEGORIES: FoodHomeCategory[] = [
  { id: 'thai', label: 'อาหารไทย', emoji: '🍛', filter: 'อาหารไทย' },
  { id: 'noodle', label: 'ก๋วยเตี๋ยว', emoji: '🍜', filter: 'ก๋วยเตี๋ยว' },
  { id: 'japanese', label: 'ญี่ปุ่น', emoji: '🍣', filter: 'ญี่ปุ่น' },
  { id: 'cafe', label: 'คาเฟ่', emoji: '☕', filter: 'คาเฟ่' },
  { id: 'pizza', label: 'พิซซ่า', emoji: '🍕', filter: 'อิตาเลียน' },
  { id: 'dessert', label: 'ของหวาน', emoji: '🍰', filter: 'เบเกอรี่' },
  { id: 'healthy', label: 'เพื่อสุขภาพ', emoji: '🥗', filter: 'สุขภาพ' },
  { id: 'street', label: 'สตรีทฟู้ด', emoji: '🥡', filter: 'สตรีท' },
];

function bannerForRestaurants(restaurants: FoodRestaurant[]): FoodHomeBanner[] {
  const cover = restaurants[0] ? restaurantCoverUrl(restaurants[0].id) : undefined;
  return [
    {
      id: 'thai-help',
      title: 'รวมร้าน ไทยช่วยไทย 60/40',
      subtitle: 'สั่งเลยวันนี้ · ค่าส่งเริ่ม ฿0',
      image_url: cover || 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&h=320&fit=crop',
      badge: 'โปรเดือด',
    },
    {
      id: 'free-delivery',
      title: 'ส่งฟรีร้านใกล้คุณ',
      subtitle: 'เลือกโหมดประหยัด · รวมออเดอร์หลายร้าน',
      image_url: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&h=320&fit=crop',
    },
    {
      id: 'matcha',
      title: 'Matcha & คาเฟ่',
      subtitle: 'เมนูยอดนิยม · ส่งด่วน 15 นาที',
      image_url: restaurantCoverUrl('food-cafe-1') || 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&h=320&fit=crop',
    },
  ];
}

function buildBrands(restaurants: FoodRestaurant[]): FoodHomeBrand[] {
  return restaurants.slice(0, 8).map((r) => ({
    id: `brand-${r.id}`,
    name: r.name.split(' ')[0],
    logo_emoji: r.emoji,
    merchant_id: r.id,
    cover_url: restaurantCoverUrl(r.id),
  }));
}

function buildSections(restaurants: FoodRestaurant[]): FoodHomeSection[] {
  const open = restaurants.filter((r) => r.open);
  const byRating = [...open].sort((a, b) => b.rating - a.rating);
  const freeDelivery = open.filter((r) => r.delivery_fee_micro <= 2000);
  const near = [...open].sort((a, b) => a.distance_km - b.distance_km);

  return [
    {
      id: 'popular',
      title: 'ร้านยอดนิยม',
      subtitle: 'รีบใช้สิทธิก่อนถูกตัดรอบ สั่งเลย!',
      icon: '🔥',
      restaurant_ids: byRating.slice(0, 6).map((r) => r.id),
    },
    {
      id: 'free-ship',
      title: 'ค่าส่งถูก · ส่งเร็ว',
      subtitle: 'ค่าส่งเริ่ม ฿0–฿20',
      icon: '🛵',
      restaurant_ids: freeDelivery.slice(0, 6).map((r) => r.id),
    },
    {
      id: 'near-you',
      title: 'ใกล้คุณที่สุด',
      subtitle: 'ถึงเร็ว · อุ่นๆ จากครัว',
      icon: '📍',
      restaurant_ids: near.slice(0, 6).map((r) => r.id),
    },
    {
      id: 'top-rated',
      title: 'ที่สุดของร้านอร่อยรีวิวดี',
      subtitle: "ใส่โค้ด 'AQFOOD50' ลดสูงสุด ฿50*",
      icon: '⭐',
      restaurant_ids: byRating.filter((r) => r.rating >= 4.5).slice(0, 6).map((r) => r.id),
    },
  ].filter((s) => s.restaurant_ids.length > 0);
}

export async function buildFoodHomeFeed(opts?: { sort?: 'distance' | 'rating' }): Promise<FoodHomeFeed> {
  const restaurants = await listNearbyRestaurants({ sort: opts?.sort || 'distance' });
  const enriched = restaurants.map((r) => ({
    ...r,
    cover_url: restaurantCoverUrl(r.id),
  }));

  return {
    location_label: 'อาคารพาณิชย์ · กรุงเทพฯ',
    banners: bannerForRestaurants(enriched),
    categories: CATEGORIES,
    brands: buildBrands(enriched),
    sections: buildSections(enriched),
    promo_strip: {
      title: 'โค้ดลด ฿70 + เมนูลด 40%',
      subtitle: 'ค่าส่งเริ่ม ฿0 สั่งด่วน!',
      code: 'AQFOOD70',
    },
    restaurants: enriched,
  };
}
