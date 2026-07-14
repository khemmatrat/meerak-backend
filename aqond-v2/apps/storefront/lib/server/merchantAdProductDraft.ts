import { FOOD_GEN_STYLES } from '@/lib/merchantAdProductConstants';
import { rulesDraftFromHint, rulesDraftFromVision, tryVisionDescribe } from '@/lib/server/onboardDraft';

export { FOOD_GEN_STYLES };

export type AdProductDraft = {
  title: string;
  benefits: string;
  description: string;
  size_guide?: string;
  price_thb: number;
  stock: number;
  category: string;
  food_style?: string;
  tags: string[];
  source: 'vision' | 'rules';
};

const FOOD_HOOKS: Record<string, { benefits: string; desc: string }> = {
  spicy: { benefits: 'รสจัดจ้าน กลมกล่อม ทานคู่ข้าวสวย', desc: 'เผ็ดร้อนกำลังดี หอมเครื่องเทศ ทำสดทุกออเดอร์' },
  fresh: { benefits: 'วัตถุดิบสด สะอาด ปลอดภัย', desc: 'คัดสรรของสด ทำใหม่ทุกวัน ไม่ใช้ของค้างคืน' },
  promo: { benefits: 'โปรพิเศษ คุ้มค่า สั่งง่าย', desc: 'ราคาพิเศษช่วงนี้ สั่งเลยก่อนหมดโปร' },
  homestyle: { benefits: 'รสชาติเหมือนทำเอง อบอุ่น', desc: 'สูตรครัวก๋ง ปรุงสด รสชาติใกล้เคียงทำที่บ้าน' },
  premium: { benefits: 'คุณภาพพรีเมียม น่าจัดจาน', desc: 'วัตถุดิบคัดพิเศษ เหมาะมื้อพิเศษและของขวัญ' },
};

function isFashionCategory(categoryStyle?: string, notes?: string, title?: string) {
  const t = `${categoryStyle || ''} ${notes || ''} ${title || ''}`;
  return /fashion|เสื้อ|ชุด|แฟชั่น|ไซ|กางเกง|กระโปรง|บิกินี่|ชุดว่าย/i.test(t);
}

function fashionSizeGuide(notes?: string) {
  if (/บิกินี่|ชุดว่าย|swim/i.test(notes || '')) {
    return 'ไซส์ S–XL (สาวไทย: S=32-34, M=36-38, L=40-42)';
  }
  return 'ไซส์ S–XL (แนะนำวัดรอบอก/เอวก่อนสั่ง)';
}

async function imageUrlToBase64(imageUrl: string): Promise<string | null> {
  try {
    const base = process.env.STOREFRONT_INTERNAL_URL || 'http://127.0.0.1:3003';
    const url = imageUrl.startsWith('http') ? imageUrl : `${base.replace(/\/$/, '')}${imageUrl}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get('content-type') || 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

export async function generateAdProductDraft(input: {
  productTitle?: string;
  visualNotes?: string;
  categoryStyle?: string;
  isFood?: boolean;
  foodStyle?: string;
  imageUrl?: string;
}): Promise<AdProductDraft> {
  const hint = [input.productTitle, input.visualNotes].filter(Boolean).join(' — ');
  const foodStyle = input.foodStyle || 'fresh';
  const fashion = isFashionCategory(input.categoryStyle, input.visualNotes, input.productTitle);

  let source: 'vision' | 'rules' = 'rules';
  let base = rulesDraftFromHint(hint || 'สินค้าใหม่');

  if (input.imageUrl) {
    const b64 = await imageUrlToBase64(input.imageUrl);
    if (b64) {
      const vision = await tryVisionDescribe(b64, hint, 30000);
      if (vision?.vision) {
        base = rulesDraftFromVision(vision.vision, hint);
        source = 'vision';
      }
    }
  }

  const title = (input.productTitle || base.title).slice(0, 120);
  let benefits = '';
  let description = base.description.slice(0, 500);

  if (input.isFood) {
    const hook = FOOD_HOOKS[foodStyle] || FOOD_HOOKS.fresh;
    benefits = hook.benefits;
    description = `${hook.desc} ${input.visualNotes || ''}`.trim().slice(0, 500);
  } else if (fashion) {
    benefits = 'ดีไซน์สวย ใส่สบาย ตัดเย็บเรียบร้อย';
    description = `${base.description} ${input.visualNotes || ''}`.trim().slice(0, 500);
  } else {
    benefits = 'คุณภาพดี ใช้งานได้จริง คุ้มค่า';
    description = `${base.description} ${input.visualNotes || ''}`.trim().slice(0, 500);
  }

  return {
    title,
    benefits,
    description,
    size_guide: fashion ? fashionSizeGuide(input.visualNotes) : undefined,
    price_thb: base.price_thb,
    stock: base.inventory,
    category: input.isFood ? 'food' : base.category,
    food_style: input.isFood ? foodStyle : undefined,
    tags: base.seo_tags || [],
    source,
  };
}
