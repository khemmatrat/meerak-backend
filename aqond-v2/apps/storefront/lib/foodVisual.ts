/** Curated food item images for checkout/cart (Unsplash, demo). */
const DISH_IMAGES: Record<string, string> = {
  'dish-padthai': 'https://images.unsplash.com/photo-1559314809-0d155014e29e?w=240&h=240&fit=crop',
  'dish-tomyum': 'https://images.unsplash.com/photo-1548943487-a2e4e43b4853?w=240&h=240&fit=crop',
  'dish-basil': 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=240&h=240&fit=crop',
  'dish-mango': 'https://images.unsplash.com/photo-1596798138739-111bbac0c2d0?w=240&h=240&fit=crop',
  'dish-sushi-set': 'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=240&h=240&fit=crop',
  'dish-salmon': 'https://images.unsplash.com/photo-1563612112375-1d51b09f574f?w=240&h=240&fit=crop',
  'dish-ramen': 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=240&h=240&fit=crop',
  'dish-matcha-latte': 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=240&h=240&fit=crop',
  'dish-croissant': 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=240&h=240&fit=crop',
  'dish-cake': 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=240&h=240&fit=crop',
  'dish-noodle-pork': 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=240&h=240&fit=crop',
  'dish-noodle-dry': 'https://images.unsplash.com/photo-1617093727343-374698b1b08d?w=240&h=240&fit=crop',
  'dish-wonton': 'https://images.unsplash.com/photo-1525755662778-989d0520907e?w=240&h=240&fit=crop',
  'dish-pizza-m': 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=240&h=240&fit=crop',
  'dish-pizza-pep': 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=240&h=240&fit=crop',
};

const RESTAURANT_COVERS: Record<string, string> = {
  'food-cafe-1': 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&h=360&fit=crop',
  'food-thai-1': 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&h=360&fit=crop',
  'food-jp-1': 'https://images.unsplash.com/photo-1579027989536-b7b3f875ceea?w=800&h=360&fit=crop',
  'food-street-1': 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=800&h=360&fit=crop',
  'food-pizza-1': 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&h=360&fit=crop',
};

export function restaurantCoverUrl(merchantId?: string): string | undefined {
  if (merchantId && RESTAURANT_COVERS[merchantId]) return RESTAURANT_COVERS[merchantId];
  return undefined;
}

export function foodItemImageUrl(itemId?: string, title?: string): string | undefined {
  if (itemId && DISH_IMAGES[itemId]) return DISH_IMAGES[itemId];
  const t = (title || '').toLowerCase();
  if (/matcha|latte|กาแฟ/.test(t)) return DISH_IMAGES['dish-matcha-latte'];
  if (/ซูชิ|sushi|แซลมอน/.test(t)) return DISH_IMAGES['dish-sushi-set'];
  if (/พิซซ่า|pizza/.test(t)) return DISH_IMAGES['dish-pizza-m'];
  if (/ก๋วยเตี๋ยว|บะหมี่|noodle|ramen/.test(t)) return DISH_IMAGES['dish-noodle-pork'];
  if (/ผัดไทย|pad thai/.test(t)) return DISH_IMAGES['dish-padthai'];
  if (/ต้มยำ/.test(t)) return DISH_IMAGES['dish-tomyum'];
  if (/กะเพรา|basil/.test(t)) return DISH_IMAGES['dish-basil'];
  if (/เค้ก|cake/.test(t)) return DISH_IMAGES['dish-cake'];
  return undefined;
}

export function enrichFoodMenuItem<T extends { id: string; title: string; image_url?: string }>(item: T) {
  return {
    ...item,
    image_url: item.image_url || foodItemImageUrl(item.id, item.title),
  };
}

export function enrichFoodCartItem<T extends { item_id: string; title: string; image_url?: string }>(item: T) {
  return {
    ...item,
    image_url: item.image_url || foodItemImageUrl(item.item_id, item.title),
  };
}
