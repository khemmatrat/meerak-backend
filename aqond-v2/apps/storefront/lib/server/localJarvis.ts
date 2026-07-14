import { buildLocalHomePayload } from './localCatalog';
import { captionText } from '@/lib/feed';
import { feedFoodMenuForContext } from './foodFeedBridge';

export type JarvisFeedContext = {
  post_id?: string;
  media_id?: string;
  caption?: string;
  product_id?: string;
  product_title?: string;
  price_micro?: number;
  category?: string;
  author_id?: string;
  is_food?: boolean;
  food_merchant_id?: string;
  food_merchant_name?: string;
};

export type JarvisBrain = {
  reply_th: string;
  action:
    | 'search'
    | 'compare'
    | 'select_variant'
    | 'place_order'
    | 'feed_recommend'
    | 'feed_similar'
    | 'feed_food_menu'
    | 'feed_food_add'
    | 'feed_food_order'
    | 'track_order'
    | 'none';
  search_query?: string;
  sort_by?: string;
  selected_product_id?: string;
  selected_food_item_id?: string;
  food_merchant_id?: string;
  selected_variant_value?: string;
  should_place_order?: boolean;
  should_add_food?: boolean;
  should_food_order?: boolean;
  track_order_id?: string;
  qty?: number;
  source?: string;
};

export type JarvisSession = {
  last_search?: Array<{
    id: string;
    title?: string;
    name?: string;
    price_micro?: number;
    category?: string;
    merchant_hint?: string;
  }>;
  last_food?: Array<{
    id: string;
    title: string;
    price_micro: number;
    merchant_id?: string;
    popular?: boolean;
  }>;
  selected_product_id?: string;
  selected_food_item_id?: string;
  food_merchant_id?: string;
  selected_variant_value?: string;
  feed_context?: JarvisFeedContext;
  active_orders?: Array<{
    order_id: string;
    status: string;
    status_label?: string;
    merchant_name?: string;
    track_href?: string;
  }>;
  track_order_id?: string;
  jarvis_locale?: string;
  language_profile?: Record<string, unknown>;
  memory_summary?: string;
  jarvis_persona?: {
    enabled: boolean;
    product: string;
    product_name: string;
    regional: string;
    locale: string;
    honorific: string;
    tone: string;
    formality: string;
    prompt_section: string;
  };
  turns?: Array<{ role: 'user' | 'jarvis'; text: string; at: string }>;
};

type CatalogItem = {
  id: string;
  title?: string;
  name?: string;
  price_micro?: number;
  category?: string;
  merchant_hint?: string;
};

const SYNONYMS: Record<string, string[]> = {
  matcha: ['matcha', 'มัทฉะ', 'ชาเขียว'],
  ชา: ['ชา', 'tea', 'matcha', 'มัทฉะ'],
  กาแฟ: ['กาแฟ', 'coffee', 'คาเฟอิน'],
  ขนม: ['ขนม', 'snack', 'กรอบ'],
  เสื้อ: ['เสื้อ', 'tee', 'oversize', 'แฟชั่น'],
  หูฟัง: ['หูฟัง', 'earbuds', 'bluetooth', 'audio'],
  ของขวัญ: ['ของขวัญ', 'gift', 'แนะนำ'],
  อาหาร: ['อาหาร', 'food', 'กิน', 'ขนม'],
};

function expandQuery(query: string): string[] {
  const q = query.toLowerCase().trim();
  const tokens = new Set<string>(q.split(/\s+/).filter((t) => t.length > 1));
  tokens.add(q);
  for (const [key, words] of Object.entries(SYNONYMS)) {
    if (words.some((w) => q.includes(w) || tokens.has(w))) {
      words.forEach((w) => tokens.add(w));
      tokens.add(key);
    }
  }
  return [...tokens];
}

function isFoodIntent(msg: string) {
  return /อาหาร|หิว|ส่งอาหาร|เมนู|สั่งกิน|กินอะไร|delivery|food/.test(msg);
}

function isFeedIntent(msg: string) {
  return /วิดีโอ|คลิป|นี้|อันนี้|ในฟีด|ในคลิป|ที่กำลังดู|จากวิดีโอ|สินค้านี้|คลิปนี้|ฟีด/.test(msg);
}

function priceBaht(micro?: number) {
  return ((micro || 0) / 100).toFixed(0);
}

function toProduct(p: CatalogItem) {
  return {
    id: p.id,
    title: p.title || p.name,
    name: p.name,
    price_micro: p.price_micro,
    category: p.category,
    merchant_hint: p.merchant_hint,
  };
}

function ruleBrain(
  userMessage: string,
  session: JarvisSession,
  feedContext?: JarvisFeedContext | null,
): JarvisBrain {
  const msg = userMessage.toLowerCase();
  const orders = session.active_orders || [];

  if (/ออเดอร์|ส่งถึง|อยู่ไหน|ติดตาม|track|พัสดุ/.test(msg) && orders.length) {
    const hit = orders[0];
    return {
      reply_th: `ออเดอร์ #${hit.order_id.slice(-8)} จาก ${hit.merchant_name || 'ร้านค้า'} — ${hit.status_label || hit.status} ครับเจ้านาย กดลิงก์ติดตามได้เลย`,
      action: 'track_order',
      track_order_id: hit.order_id,
      source: 'local-rules',
    };
  }

  if (feedContext?.is_food && feedContext.food_merchant_id) {
    if (
      isFeedIntent(msg)
      && /สั่งเลย|จัดมา|ส่งมา|ได้เลย|เอาเลย/.test(msg)
      && /สั่ง|เอา|หิว|อาหาร/.test(msg)
    ) {
      return {
        reply_th: 'รับทราบครับเจ้านาย กำลังสั่งอาหารจากคลิปที่ดูอยู่ให้ครับ',
        action: 'feed_food_order',
        food_merchant_id: feedContext.food_merchant_id,
        selected_food_item_id: session.selected_food_item_id,
        should_food_order: true,
        qty: 1,
        source: 'local-feed-food',
      };
    }

    if (
      isFeedIntent(msg)
      && /สั่ง|เอา|ใส่รถเข็น|เพิ่ม/.test(msg)
      && !/สินค้า/.test(msg)
    ) {
      return {
        reply_th: 'ใส่เมนูแนะนำจากร้านในคลิปลงรถเข็นอาหารให้ครับเจ้านาย',
        action: 'feed_food_add',
        food_merchant_id: feedContext.food_merchant_id,
        selected_food_item_id: session.selected_food_item_id,
        should_add_food: true,
        source: 'local-feed-food',
      };
    }

    if (
      /เมนู|อาหารในคลิป|อาหารในวิดีโอ|สินค้าในวิดีโอ|หิว/.test(msg)
      || (isFoodIntent(msg) && isFeedIntent(msg))
      || (isFoodIntent(msg) && /แนะนำ|ช่วย|มีอะไร/.test(msg))
    ) {
      const shop = feedContext.food_merchant_name || 'ร้านในคลิป';
      return {
        reply_th: `กำลังดูเมนูจาก ${shop} ในคลิปที่เจ้านายดูอยู่ครับ`,
        action: 'feed_food_menu',
        food_merchant_id: feedContext.food_merchant_id,
        source: 'local-feed-food',
      };
    }
  }

  if (feedContext?.product_id && /ซื้อ|สั่ง|เอา|ใส่รถเข็น|ได้เลย|สั่งเลย/.test(msg)) {
    if (isFeedIntent(msg) || !session.selected_product_id) {
      const title = feedContext.product_title || 'สินค้าในวิดีโอ';
      return {
        reply_th: `รับทราบครับเจ้านาย กำลังใส่ "${title}" จากวิดีโอที่ดูอยู่ลงรถเข็นให้ครับ`,
        action: 'place_order',
        selected_product_id: feedContext.product_id,
        should_place_order: true,
        qty: 1,
        source: 'local-feed',
      };
    }
  }

  if (
    feedContext
    && (/แนะนำ|สินค้าในวิดีโอ|สินค้าในคลิป/.test(msg)
      || (isFeedIntent(msg) && /ราคา|อะไร|คืออะไร|มีอะไร|บอก|ช่วย/.test(msg)))
  ) {
    return {
      reply_th: 'กำลังดูสินค้าจากวิดีโอที่เจ้านายดูอยู่ครับ',
      action: 'feed_recommend',
      source: 'local-feed',
    };
  }

  if (feedContext?.category && /คล้าย|แบบเดียว|ตัวอื่น|อื่นๆ|ใกล้เคียง/.test(msg)) {
    return {
      reply_th: `หาสินค้าหมวด ${feedContext.category} ที่คล้ายกับในคลิปให้ครับเจ้านาย`,
      action: 'feed_similar',
      search_query: feedContext.category,
      source: 'local-feed',
    };
  }

  if (/ซื้อ|สั่ง|เอา|ใส่รถเข็น/.test(msg) && session.selected_product_id) {
    return {
      reply_th: 'รับทราบครับเจ้านาย กำลังใส่รถเข็นให้ครับ',
      action: 'place_order',
      selected_product_id: session.selected_product_id,
      should_place_order: true,
      qty: 1,
      source: 'local-rules',
    };
  }

  if (/ถูก|ราคา|compare|เปรียบ/.test(msg) && (session.last_search?.length || 0) > 0) {
    return {
      reply_th: 'รอสักครู่ครับเจ้านาย กำลังเปรียบเทียบราคาให้',
      action: 'compare',
      sort_by: 'price_asc',
      source: 'local-rules',
    };
  }

  if (/ร้าน|merchant|เจ้าของ/.test(msg)) {
    const shop = feedContext?.author_id ? `ร้าน @${feedContext.author_id}` : 'ร้านค้า';
    return {
      reply_th: `เจ้านายดูรายละเอียด${shop}ได้ที่หน้าสินค้า หรือถามเรื่องจัดส่งได้ครับ`,
      action: 'none',
      source: 'local-rules',
    };
  }

  if (/สี|ขนาด|variant/.test(msg)) {
    const color = msg.match(/(เหลือง|แดง|น้ำเงิน|เขียว|ขาว|ดำ)/)?.[1] || '';
    return {
      reply_th: color ? `เลือกตัวเลือกสี${color}ให้เจ้านายครับ` : 'เลือกตัวเลือกให้เจ้านายครับ',
      action: 'select_variant',
      selected_variant_value: color,
      source: 'local-rules',
    };
  }

  const query = userMessage.trim() || 'สินค้าแนะนำ';
  return {
    reply_th: 'รอสักครู่ครับเจ้านาย กำลังค้นหาสินค้าให้',
    action: 'search',
    search_query: query,
    sort_by: 'price_asc',
    source: 'local-rules',
  };
}

function scoreProduct(p: CatalogItem, tokens: string[]): number {
  const hay = `${p.title || ''} ${p.name || ''} ${p.category || ''}`.toLowerCase();
  let score = 0;
  for (const t of tokens) {
    if (t.length < 2) continue;
    if (hay.includes(t)) score += t.length > 4 ? 3 : 2;
  }
  return score;
}

async function loadCatalog(): Promise<CatalogItem[]> {
  const home = await buildLocalHomePayload();
  return home.products?.products || [];
}

function searchLocalProducts(query: string, catalog: CatalogItem[]) {
  const tokens = expandQuery(query);
  const ranked = catalog
    .map((p) => ({ p, score: scoreProduct(p, tokens) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (a.p.price_micro || 0) - (b.p.price_micro || 0))
    .map((x) => x.p);

  if (ranked.length > 0) return ranked.slice(0, 8);

  const q = query.toLowerCase().trim();
  if (!q) return catalog.slice(0, 8);
  return catalog
    .filter((p) => {
      const hay = `${p.title || ''} ${p.category || ''}`.toLowerCase();
      return hay.includes(q) || q.split(/\s+/).some((t) => t.length > 1 && hay.includes(t));
    })
    .slice(0, 8);
}

function feedRecommendProducts(feedContext: JarvisFeedContext, catalog: CatalogItem[]) {
  const out: CatalogItem[] = [];
  const seen = new Set<string>();

  const push = (p?: CatalogItem) => {
    if (!p || seen.has(p.id)) return;
    seen.add(p.id);
    out.push(p);
  };

  if (feedContext.product_id) {
    push(catalog.find((p) => p.id === feedContext.product_id));
  }

  const caption = captionText(feedContext.caption);
  const captionHits = searchLocalProducts(caption, catalog);
  captionHits.forEach(push);

  if (feedContext.category) {
    catalog
      .filter((p) => p.category === feedContext.category)
      .slice(0, 4)
      .forEach(push);
  }

  if (out.length < 3) {
    catalog.slice(0, 6).forEach(push);
  }

  return out.slice(0, 6).map(toProduct);
}

export async function runLocalJarvis(
  userMessage: string,
  session: JarvisSession = {},
  feedContext?: JarvisFeedContext | null,
) {
  const brain = ruleBrain(userMessage, session, feedContext);
  const catalog = await loadCatalog();

  const result: {
    ok: boolean;
    jarvis: JarvisBrain;
    products?: JarvisSession['last_search'];
    food_items?: JarvisSession['last_food'];
    food_merchant_id?: string;
    food_merchant_name?: string;
    food_eta_label?: string;
    compare?: JarvisSession['last_search'];
    cheapest?: NonNullable<JarvisSession['last_search']>[number];
    session_patch: Partial<JarvisSession>;
    feed_context?: JarvisFeedContext | null;
  } = {
    ok: true,
    jarvis: brain,
    session_patch: {},
    feed_context: feedContext || null,
  };

  if (feedContext) {
    result.session_patch.feed_context = feedContext;
  }

  if (feedContext) {
    result.session_patch.feed_context = feedContext;
  }

  if (brain.action === 'track_order' && brain.track_order_id) {
    const hit = (session.active_orders || []).find((o) => o.order_id === brain.track_order_id);
    if (hit) {
      result.session_patch.track_order_id = hit.order_id;
      brain.reply_th = `ออเดอร์ #${hit.order_id.slice(-8)} — ${hit.status_label || hit.status} ครับเจ้านาย`;
    }
  }

  if (brain.action === 'feed_food_menu' && feedContext) {
    const menuPack = await feedFoodMenuForContext(feedContext);
    if (menuPack?.menu.length) {
      result.food_items = menuPack.menu.map((m) => ({
        id: m.id,
        title: m.title,
        price_micro: m.price_micro,
        merchant_id: m.merchant_id,
        popular: m.popular,
      }));
      result.food_merchant_id = menuPack.restaurant.id;
      result.food_merchant_name = menuPack.restaurant.name;
      result.food_eta_label = menuPack.restaurant.eta.label;
      result.session_patch.last_food = result.food_items;
      result.session_patch.food_merchant_id = menuPack.restaurant.id;
      const popular = menuPack.menu.find((m) => m.popular) || menuPack.menu[0];
      result.session_patch.selected_food_item_id = popular.id;
      const clip = captionText(feedContext.caption);
      brain.reply_th = `จากคลิป "${clip}" — เมนูจาก ${menuPack.restaurant.name} ส่ง ${menuPack.restaurant.eta.label} ครับเจ้านาย`;
      brain.reply_th += ` แนะนำ "${popular.title}" ${priceBaht(popular.price_micro)} บาท — กดสั่งอาหารหรือพูดว่า "สั่งเลย"`;
    } else {
      brain.reply_th = 'ยังไม่พบเมนูอาหารจากคลิปนี้ครับเจ้านาย — ลองเปิด /m/food เลือกร้านได้เลย';
    }
  }

  if (brain.action === 'feed_food_add' && feedContext) {
    const menuPack = await feedFoodMenuForContext(feedContext);
    const merchantId = brain.food_merchant_id || feedContext.food_merchant_id;
    const pick = menuPack?.menu.find(
      (m) => m.id === brain.selected_food_item_id || m.id === session.selected_food_item_id,
    ) || menuPack?.menu.find((m) => m.popular) || menuPack?.menu[0];

    if (pick && merchantId) {
      result.food_items = [{
        id: pick.id,
        title: pick.title,
        price_micro: pick.price_micro,
        merchant_id: merchantId,
        popular: pick.popular,
      }];
      result.food_merchant_id = merchantId;
      result.food_merchant_name = menuPack?.restaurant.name;
      result.food_eta_label = menuPack?.restaurant.eta.label;
      brain.selected_food_item_id = pick.id;
      brain.should_add_food = true;
      result.session_patch.selected_food_item_id = pick.id;
      result.session_patch.food_merchant_id = merchantId;
      brain.reply_th = `ใส่ "${pick.title}" ลงรถเข็นอาหารแล้วครับเจ้านาย — ส่งประมาณ ${menuPack?.restaurant.eta.label || 'เร็วๆ นี้'}`;
    }
  }

  if (brain.action === 'feed_food_order' && feedContext) {
    const menuPack = await feedFoodMenuForContext(feedContext);
    const merchantId = brain.food_merchant_id || feedContext.food_merchant_id;
    const pick = menuPack?.menu.find(
      (m) => m.id === brain.selected_food_item_id || m.id === session.selected_food_item_id,
    ) || menuPack?.menu.find((m) => m.popular) || menuPack?.menu[0];

    if (pick && merchantId) {
      result.food_items = [{
        id: pick.id,
        title: pick.title,
        price_micro: pick.price_micro,
        merchant_id: merchantId,
        popular: pick.popular,
      }];
      result.food_merchant_id = merchantId;
      result.food_merchant_name = menuPack?.restaurant.name;
      result.food_eta_label = menuPack?.restaurant.eta.label;
      brain.selected_food_item_id = pick.id;
      brain.should_food_order = true;
      brain.should_add_food = true;
      result.session_patch.selected_food_item_id = pick.id;
      result.session_patch.food_merchant_id = merchantId;
      brain.reply_th = `สั่ง "${pick.title}" จาก ${menuPack?.restaurant.name} ให้แล้วครับเจ้านาย — ติดตามไรเดอร์ได้เลย`;
    }
  }

  if (brain.action === 'feed_recommend' && feedContext) {
    result.products = feedRecommendProducts(feedContext, catalog);
    result.session_patch.last_search = result.products;
    const main = result.products[0];
    const clip = captionText(feedContext.caption);
    if (main) {
      result.session_patch.selected_product_id = main.id;
      brain.reply_th = `จากวิดีโอ "${clip}" — แนะนำ "${main.title || main.name}" ราคา ${priceBaht(main.price_micro)} บาทครับเจ้านาย`;
      if (result.products.length > 1) {
        brain.reply_th += ` และมีอีก ${result.products.length - 1} ตัวเลือกใกล้เคียง`;
      }
      brain.reply_th += ' — กดใส่รถเข็นหรือพูดว่า "สั่งเลย" ได้ครับ';
    } else {
      brain.reply_th = 'วิดีโอนี้ยังไม่ผูกสินค้าชัดเจนครับเจ้านาย — ลองถามชื่อสินค้าที่สนใจได้เลย';
    }
  }

  if (brain.action === 'feed_similar' && feedContext) {
    const cat = feedContext.category || brain.search_query || '';
    const similar = catalog
      .filter((p) => p.category === cat && p.id !== feedContext.product_id)
      .slice(0, 6)
      .map(toProduct);
    result.products = similar.length ? similar : searchLocalProducts(cat, catalog).map(toProduct);
    result.session_patch.last_search = result.products;
    if (result.products.length) {
      brain.reply_th = `พบ ${result.products.length} สินค้าหมวดเดียวกับในคลิปครับเจ้านาย — เลือกได้เลย`;
    } else {
      brain.reply_th = 'ยังไม่พบสินค้าคล้ายกันมากนักครับ — ลองค้นหาชื่อสินค้าดูได้ครับ';
    }
  }

  if (brain.action === 'search' && brain.search_query) {
    result.products = searchLocalProducts(brain.search_query, catalog).map(toProduct);
    result.session_patch.last_search = result.products;
    if (result.products.length === 0) {
      brain.reply_th = 'ขออภัยครับเจ้านาย ยังไม่พบสินค้าที่ตรงคำค้น — ลองพิมพ์ชื่อสินค้าอื่นหรือพูดว่า "สินค้าในวิดีโอ" ตอนดู Feed ครับ';
    } else {
      const top = result.products[0];
      brain.reply_th = `พบ ${result.products.length} รายการครับเจ้านาย — ตัวแรก "${top.title || top.name}" ${priceBaht(top.price_micro)} บาท เลือกใส่รถเข็นได้เลย`;
      result.session_patch.selected_product_id = top.id;
    }
  }

  if (brain.action === 'compare') {
    const items = session.last_search || [];
    const sorted = [...items].sort((a, b) => (a.price_micro || 0) - (b.price_micro || 0));
    result.compare = sorted.slice(0, 5);
    result.cheapest = sorted[0] || null;
    if (result.cheapest) {
      brain.reply_th = `ราคาที่ถูกที่สุด ${priceBaht(result.cheapest.price_micro)} บาทครับเจ้านาย — "${result.cheapest.title || 'สินค้า'}"`;
      result.session_patch.selected_product_id = result.cheapest.id;
    }
  }

  if (brain.action === 'select_variant' && brain.selected_variant_value) {
    result.session_patch.selected_variant_value = brain.selected_variant_value;
  }

  if (brain.action === 'place_order' && brain.selected_product_id) {
    result.session_patch.selected_product_id = brain.selected_product_id;
  }

  return result;
}
