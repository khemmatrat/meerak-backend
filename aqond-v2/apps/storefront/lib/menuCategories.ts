export const MENU_CATEGORIES = [
  { id: 'drinks', label: '🥤 เครื่องดื่ม' },
  { id: 'mains', label: '🍛 อาหารจานหลัก' },
  { id: 'dessert', label: '🍰 ของหวาน' },
  { id: 'other', label: '📦 อื่นๆ' },
] as const;

export type MenuCategoryId = (typeof MENU_CATEGORIES)[number]['id'];

const DRINK_KW = /latte|matcha|coffee|ชา|น้ำ|drink|กาแฟ|โซดา|smoothie|เครื่องดื่ม/i;
const DESSERT_KW = /เค้ก|cake|ข้าวเหนียว|ไอศ|ของหวาน|dessert|croissant|mango/i;

export function inferMenuCategory(title: string, explicit?: string): MenuCategoryId {
  if (explicit && MENU_CATEGORIES.some((c) => c.id === explicit)) return explicit as MenuCategoryId;
  if (DRINK_KW.test(title)) return 'drinks';
  if (DESSERT_KW.test(title)) return 'dessert';
  return 'mains';
}

export function itemIdsInCategory(
  items: { id: string; title: string; category?: string }[],
  categoryId: MenuCategoryId,
): string[] {
  return items
    .filter((it) => inferMenuCategory(it.title, it.category) === categoryId)
    .map((it) => it.id);
}
