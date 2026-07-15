/**
 * Marketplace product search for OS chat.
 * Never dumps unrelated demo items when query doesn't match.
 * Storefront often 502 locally — demo catalog covers common Thai shopping intents.
 */

const STOREFRONT_BASE = () =>
  (
    process.env.STOREFRONT_INTERNAL_URL ||
    process.env.STOREFRONT_URL ||
    process.env.VITE_MARKETPLACE_URL ||
    'http://127.0.0.1:3003'
  ).replace(/\/$/, '');

const DEMO_CATALOG = [
  {
    id: 'demo-watch-01',
    title: 'นาฬิกา Chronos Smart Watch',
    aliases: ['นาฬิกา', 'watch', 'chronos', 'smartwatch', 'ข้อมือ'],
    price_micro: 2990000000,
    category: 'electronics',
    merchant_name: 'AQOND Gadgets',
    image_url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400',
  },
  {
    id: 'demo-watch-02',
    title: 'นาฬิกาหนังแท้ Classic Automatic',
    aliases: ['นาฬิกา', 'watch', 'หนัง', 'classic'],
    price_micro: 4590000000,
    category: 'fashion',
    merchant_name: 'AQOND Leather',
    image_url: 'https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=400',
  },
  {
    id: 'demo-sport-01',
    title: 'ชุดกีฬา Dry-Fit Unisex ระบายอากาศ',
    aliases: [
      'ชุดกีฬา',
      'กีฬา',
      'sport',
      'sportswear',
      'เสื้อกีฬา',
      'กางเกงกีฬา',
      'ออกกำลัง',
      'ฟิตเนส',
      'running',
    ],
    price_micro: 790000000,
    category: 'sports',
    merchant_name: 'AQOND Active',
    image_url: 'https://images.unsplash.com/photo-1517466787929-bc90951d0974?w=400',
  },
  {
    id: 'demo-sport-02',
    title: 'กางเกงวิ่งขาจั๊ม Compression Pro',
    aliases: ['ชุดกีฬา', 'กีฬา', 'กางเกงวิ่ง', 'วิ่ง', 'sport', 'ออกกำลัง'],
    price_micro: 590000000,
    category: 'sports',
    merchant_name: 'AQOND Active',
    image_url: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400',
  },
  {
    id: 'demo-sport-03',
    title: 'รองเท้าวิ่งโคมไฟ Night Runner',
    aliases: ['รองเท้า', 'รองเท้าวิ่ง', 'กีฬา', 'sport', 'running', 'shoes'],
    price_micro: 2490000000,
    category: 'sports',
    merchant_name: 'AQOND Active',
    image_url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400',
  },
  {
    id: 'demo-yoga-01',
    title: 'ชุดโยคะ Premium SoftStretch',
    aliases: ['โยคะ', 'yoga', 'ชุดกีฬา', 'กีฬา', 'ออกกำลัง'],
    price_micro: 1290000000,
    category: 'sports',
    merchant_name: 'AQOND Wellness Wear',
    image_url: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400',
  },
  {
    id: 'demo-chef-coat-01',
    title: 'เสื้อเชฟขาว คอตั้ง แขนยาว Premium',
    aliases: ['เสื้อเชฟ', 'เชฟ', 'chef', 'เสื้อ'],
    price_micro: 590000000,
    category: 'fashion',
    merchant_name: 'AQOND Kitchen Wear',
    image_url: 'https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?w=400',
  },
  {
    id: 'demo-chef-coat-02',
    title: 'เสื้อเชฟดำ Unisex ผ้าเย็นระบายอากาศ',
    aliases: ['เสื้อเชฟ', 'เชฟ', 'chef', 'เสื้อ'],
    price_micro: 490000000,
    category: 'fashion',
    merchant_name: 'Pro Chef TH',
    image_url: 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=400',
  },
  {
    id: 'demo-chef-hat-01',
    title: 'หมวกเชฟตาข่ายขาว',
    aliases: ['หมวกเชฟ', 'เชฟ', 'chef', 'หมวก'],
    price_micro: 189000000,
    category: 'fashion',
    merchant_name: 'AQOND Kitchen Wear',
    image_url: 'https://images.unsplash.com/photo-1577219491135-ce391730fb2c?w=400',
  },
  {
    id: 'demo-apron-01',
    title: 'ผ้ากันเปื้อนเชฟหนังแท้',
    aliases: ['กันเปื้อน', 'เชฟ', 'chef', 'apron'],
    price_micro: 890000000,
    category: 'fashion',
    merchant_name: 'Pro Chef TH',
  },
  {
    id: 'demo-kb-01',
    title: 'คีย์บอร์ดกลไกอลูมิเนียม RGB',
    aliases: ['คีย์บอร์ด', 'keyboard', 'mechanical'],
    price_micro: 3290000000,
    category: 'electronics',
    merchant_name: 'AQOND Gadgets',
    image_url: 'https://images.unsplash.com/photo-1511467687858-23d96c302422?w=400',
  },
  {
    id: 'demo-mouse-01',
    title: 'เมาส์เกมมิ่งไร้สาย Pro X',
    aliases: ['เมาส์', 'mouse', 'gaming', 'คอม'],
    price_micro: 1490000000,
    category: 'electronics',
    merchant_name: 'AQOND Gadgets',
    image_url: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=400',
  },
  {
    id: 'demo-phone-01',
    title: 'เคสโทรศัพท์ MagSafe Clear',
    aliases: ['เคส', 'โทรศัพท์', 'มือถือ', 'phone', 'iphone'],
    price_micro: 490000000,
    category: 'electronics',
    merchant_name: 'AQOND Gadgets',
    image_url: 'https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=400',
  },
  {
    id: 'demo-bag-01',
    title: 'กระเป๋าเป้ท่องเที่ยว 30L',
    aliases: ['กระเป๋า', 'เป้', 'backpack', 'ท่องเที่ยว', 'bag'],
    price_micro: 1890000000,
    category: 'fashion',
    merchant_name: 'AQOND Travel',
    image_url: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400',
  },
  {
    id: 'demo-wallet-01',
    title: 'กระเป๋าสตางค์หนังวัวแท้',
    aliases: ['กระเป๋า', 'wallet', 'หนัง', 'สตางค์'],
    price_micro: 1290000000,
    category: 'fashion',
    merchant_name: 'AQOND Leather',
    image_url: 'https://images.unsplash.com/photo-1627123424574-724758594e93?w=400',
  },
  {
    id: 'demo-shirt-01',
    title: 'เสื้อโปโลผ้าเย็นสำนักงาน',
    aliases: ['เสื้อ', 'โปโล', 'polo', 'เสื้อผ้า', 'แฟชั่น'],
    price_micro: 690000000,
    category: 'fashion',
    merchant_name: 'AQOND Apparel',
    image_url: 'https://images.unsplash.com/photo-1586363104862-3a5e2ab60d99?w=400',
  },
  {
    id: 'demo-shoes-01',
    title: 'รองเท้าหนัง Formal Oxford',
    aliases: ['รองเท้า', 'หนัง', 'shoes', 'ทางการ'],
    price_micro: 2890000000,
    category: 'fashion',
    merchant_name: 'AQOND Leather',
    image_url: 'https://images.unsplash.com/photo-1614252234978-ca27d0dbfd09?w=400',
  },
  {
    id: 'demo-beauty-01',
    title: 'เซรั่มวิตามินซี Skin Glow',
    aliases: ['เซรั่ม', 'skincare', 'ความงาม', 'ครีม', 'ผิว'],
    price_micro: 890000000,
    category: 'beauty',
    merchant_name: 'AQOND Beauty',
    image_url: 'https://images.unsplash.com/photo-1620916563405-15f4cbe8944f?w=400',
  },
  {
    id: 'demo-wagyu-01',
    title: 'เนื้อวากิว A5 สไลซ์ 200g',
    aliases: ['วากิว', 'wagyu', 'เนื้อ', 'อาหาร'],
    price_micro: 1590000000,
    category: 'food',
    merchant_name: 'Food Merchant Elite',
    image_url: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=400',
  },
  {
    id: 'demo-coffee-01',
    title: 'กาแฟคั่วสด Single Origin 250g',
    aliases: ['กาแฟ', 'coffee', 'อาหาร', 'เครื่องดื่ม'],
    price_micro: 420000000,
    category: 'food',
    merchant_name: 'Food Merchant Elite',
    image_url: 'https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=400',
  },
  {
    id: 'demo-earbud-01',
    title: 'หูฟังไร้สาย ANC Pro',
    aliases: ['หูฟัง', 'earbud', 'earphone', 'หัวฟัง'],
    price_micro: 1990000000,
    category: 'electronics',
    merchant_name: 'AQOND Gadgets',
    image_url: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=400',
  },
  {
    id: 'demo-lamp-01',
    title: 'โคมไฟตั้งโต๊ะ LED ปรับแสง',
    aliases: ['โคมไฟ', 'ไฟ', 'lamp', 'ของใช้', 'บ้าน'],
    price_micro: 790000000,
    category: 'home',
    merchant_name: 'AQOND Home',
    image_url: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=400',
  },
  {
    id: 'demo-cup-01',
    title: 'แก้วน้ำเก็บอุณหภูมิ 500ml',
    aliases: ['แก้ว', 'แก้วน้ำ', 'ขวดน้ำ', 'tumbler', 'bottle', 'น้ำ'],
    price_micro: 450000000,
    category: 'home',
    merchant_name: 'AQOND Home',
    image_url: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=400',
  },
];

/** Synonym expansion when user types category-like Thai phrases */
const QUERY_SYNONYMS = [
  {
    test: /ชุดกีฬา|เสื้อกีฬา|กางเกงกีฬา|sportswear|sport\s*wear|ออกกำลัง|ฟิตเนส|fitness/i,
    tokens: ['ชุดกีฬา', 'กีฬา', 'sport', 'sportswear', 'ออกกำลัง'],
  },
  {
    test: /โยคะ|yoga/i,
    tokens: ['โยคะ', 'yoga', 'ชุดกีฬา'],
  },
  {
    test: /รองเท้าวิ่ง|วิ่ง|running\s*shoe/i,
    tokens: ['รองเท้าวิ่ง', 'วิ่ง', 'รองเท้า', 'sport'],
  },
  {
    test: /นาฬิกา|watch|smartwatch/i,
    tokens: ['นาฬิกา', 'watch', 'chronos', 'smartwatch'],
  },
  {
    test: /เสื้อเชฟ|chef\s*coat/i,
    tokens: ['เสื้อเชฟ', 'เชฟ', 'chef'],
  },
  {
    test: /คีย์บอร์ด|keyboard/i,
    tokens: ['คีย์บอร์ด', 'keyboard'],
  },
  {
    test: /หูฟัง|earbud|earphone|หัวฟัง/i,
    tokens: ['หูฟัง', 'earbud'],
  },
  {
    test: /วากิว|wagyu/i,
    tokens: ['วากิว', 'wagyu'],
  },
  {
    test: /กระเป๋าสตางค์|wallet/i,
    tokens: ['กระเป๋า', 'wallet', 'สตางค์'],
  },
  {
    test: /กระเป๋าเป้|เป้|backpack/i,
    tokens: ['เป้', 'backpack', 'กระเป๋า'],
  },
  {
    test: /เมาส์|mouse/i,
    tokens: ['เมาส์', 'mouse'],
  },
  {
    test: /กาแฟ|coffee/i,
    tokens: ['กาแฟ', 'coffee'],
  },
  {
    test: /เซรั่ม|skincare|ครีมหน้า/i,
    tokens: ['เซรั่ม', 'skincare', 'ความงาม'],
  },
  {
    test: /โคมไฟ|lamp/i,
    tokens: ['โคมไฟ', 'lamp'],
  },
  {
    test: /แก้วน้ำ|แก้ว|ขวดน้ำ|tumbler|bottle/i,
    tokens: ['แก้วน้ำ', 'แก้ว', 'ขวดน้ำ', 'tumbler'],
  },
  {
    test: /เคส|มือถือ|โทรศัพท์|iphone/i,
    tokens: ['เคส', 'โทรศัพท์', 'มือถือ', 'phone'],
  },
];

/** Broad “looking for a product” detector (chat intent) */
export function isProductSearchIntentMessage(message) {
  const t = String(message || '').toLowerCase();
  if (!t.trim()) return false;
  if (/ช่างแอร์|รปภ|ยาม|คุ้มครอง|แม่บ้าน|ช่างไฟ|ช่างประปา/.test(t)) return false;
  if (
    /ซื้อ|สินค้า|marketplace|shopping|หาของ|สั่งซื้อ|ของใช้|แฟชั่น|electronics/i.test(
      t,
    )
  ) {
    return true;
  }
  // "หา…" product-ish without the word สินค้า
  if (
    /^(หา|ค้น|ค้นหา|อยากได้|ต้องการ|ขอ|ซื้อ|ดู)\s*/.test(t) &&
    /ชุด|เสื้อ|กางเกง|รองเท้า|นาฬิกา|หูฟัง|คีย์บอร์ด|กระเป๋า|เคส|กาแฟ|วากิว|เนื้อ|เมาส์|โคมไฟ|เซรั่ม|โยคะ|กีฬา|แก้ว|ขวด|sport|watch|bag|shoe|phone/i.test(
      t,
    )
  ) {
    return true;
  }
  if (QUERY_SYNONYMS.some((s) => s.test.test(t))) return true;
  return false;
}

export function extractProductQuery(message) {
  let q = String(message || '').trim();
  q = q
    .replace(
      /^(หา|ค้น|ค้นหา|อยากได้|ต้องการ|ขอ|ซื้อ|ดู|มีไหม|มีมั้ย)\s*(สินค้า|ของ|)?\s*/i,
      '',
    )
    .replace(/\s*(ให้หน่อย|หน่อย|ครับ|ค่ะ|นะ|ไหม|มั้ย)\s*$/i, '')
    .trim();
  return q || String(message || '').trim();
}

function tokenize(query) {
  const q = String(query || '').toLowerCase();
  const cleaned = q.replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ');
  const parts = cleaned
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.replace(/\p{M}/gu, '').length > 1);
  const extras = [];
  for (const syn of QUERY_SYNONYMS) {
    if (syn.test.test(q)) extras.push(...syn.tokens);
  }
  if (/(เสื้อเชฟ|chef\s*coat)/i.test(q)) extras.push('เสื้อเชฟ', 'เชฟ', 'chef');
  else if (q.includes('เสื้อ') && !/บริการ|ช่าง|กีฬา/.test(q)) extras.push('เสื้อ');
  if (q.includes('เชฟ') || /\bchef\b/i.test(q)) extras.push('เชฟ', 'chef');
  if (q.includes('รองเท้า') && !extras.includes('รองเท้า')) extras.push('รองเท้า');
  if (q.includes('กระเป๋า') && !extras.includes('กระเป๋า')) extras.push('กระเป๋า');
  return [...new Set([...parts, ...extras])];
}

function normalizeProduct(p) {
  const id = String(p.id || p.entity_id || '');
  if (!id) return null;
  const priceMicro = Number(
    p.price_micro != null ? p.price_micro : (Number(p.price) || 0) * 1e6,
  );
  const priceBaht =
    p.price != null ? Number(p.price) : Math.round(priceMicro / 1e6);
  return {
    id,
    title: String(p.title || p.name || id),
    price: priceBaht,
    price_micro: priceMicro,
    category: p.category ? String(p.category) : undefined,
    merchant_name: String(p.merchant_name || p.merchant_hint || 'AQOND Marketplace'),
    image_url: p.image_url || p.imageUrl || p.image || undefined,
    aliases: Array.isArray(p.aliases) ? p.aliases : [],
    url_path: `/m/product/${encodeURIComponent(id)}`,
    search_path: `/m/search?q=${encodeURIComponent(String(p.title || p.name || id))}`,
  };
}

function scoreProduct(p, tokens) {
  const hay = `${p.title} ${p.category || ''} ${p.merchant_name || ''} ${(p.aliases || []).join(' ')}`.toLowerCase();
  let score = 0;
  for (const t of tokens) {
    if (t.replace(/\p{M}/gu, '').length < 3 && !/^watch|chef|ac|bag$/i.test(t)) continue;
    if (hay.includes(t)) score += t.length > 3 ? 4 : 2;
  }
  return score;
}

function searchDemoCatalog(query, limit = 5) {
  const tokens = tokenize(query);
  if (!tokens.length) return [];

  const ranked = DEMO_CATALOG.map((raw) => {
    const p = normalizeProduct(raw);
    return { p, score: scoreProduct(p, tokens) };
  })
    .filter((x) => x.p && x.score > 0)
    .sort((a, b) => b.score - a.score || a.p.price - b.p.price);

  return ranked.slice(0, limit).map((x) => x.p);
}

async function fetchStorefrontProducts(query, limit = 8) {
  const base = STOREFRONT_BASE();
  const url = `${base}/api/search/products?q=${encodeURIComponent(query)}&limit=${limit}`;
  const timeoutMs = Number(process.env.OS_MARKET_SEARCH_TIMEOUT_MS || 2500);
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`storefront search ${res.status}`);
  const data = await res.json();
  const rows = Array.isArray(data.products) ? data.products : [];
  const tokens = tokenize(query);
  return rows
    .map(normalizeProduct)
    .filter(Boolean)
    .map((p) => ({ p, score: scoreProduct(p, tokens) }))
    .filter((x) => tokens.length === 0 || x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p);
}

/**
 * @param {string} message
 * @param {{ limit?: number, sort?: 'relevance'|'price_asc'|'price_desc', queryOverride?: string }} [opts]
 */
export async function searchMarketplaceForChat(message, { limit = 5, sort = 'relevance', queryOverride } = {}) {
  const query = String(queryOverride || extractProductQuery(message) || '').trim();
  if (!query) {
    return { query: '', products: [], source: 'empty', sort };
  }

  let products = [];
  let source = 'empty';
  try {
    products = await fetchStorefrontProducts(query, Math.max(limit, 8));
    if (products.length) source = 'storefront';
  } catch (e) {
    console.warn('[osMarketplaceSearch] storefront:', e?.message || e);
  }

  if (!products.length) {
    products = searchDemoCatalog(query, Math.max(limit, 8));
    source = products.length ? 'demo_catalog' : 'empty';
  }

  if (sort === 'price_asc') {
    products = [...products].sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
  } else if (sort === 'price_desc') {
    products = [...products].sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
  }

  return { query, products: products.slice(0, limit), source, sort };
}

export function formatProductSearchThai(query, products, source, { sort, refine } = {}) {
  if (!products?.length) {
    return `ยังไม่พบสินค้าที่ตรงกับ “${query}” ในแคตตาล็อกตอนนี้ครับ — ลองคำอื่น เช่น นาฬิกา ชุดกีฬา หูฟัง คีย์บอร์ด หรือเปิด Marketplace ค้นเองได้เลยครับ`;
  }
  const lines = products
    .slice(0, 5)
    .map(
      (p, i) =>
        `${i + 1}. ${p.title} — ฿${Number(p.price || 0).toLocaleString('th-TH')}`,
    );
  const note =
    source === 'demo_catalog'
      ? '\n(แสดงจากแคตตาล็อกตัวอย่างเมื่อระบบค้นหาออนไลน์ยังไม่พร้อม)'
      : '';
  if (refine === 'cheapest' || sort === 'price_asc') {
    return `เรียงราคาถูกสุดจากผลค้นหา “${query}” ให้แล้วครับ (ถูกสุดอยู่ลำดับแรก):\n${lines.join('\n')}\n\nอยากให้เปิดดูใน Marketplace หรือหาสินค้าอื่นต่อไหมครับ?${note}`;
  }
  if (refine === 'priciest' || sort === 'price_desc') {
    return `เรียงราคาแพงสุดจากผลค้นหา “${query}” ให้แล้วครับ:\n${lines.join('\n')}\n\nอยากให้คัดถูกสุด หรือเปิด Marketplace ต่อไหมครับ?${note}`;
  }
  return `พบสินค้าที่เกี่ยวกับ “${query}” ${products.length} รายการครับ:\n${lines.join('\n')}\n\nอยากให้ช่วยคัดราคาถูกสุด หรือเปิดดูใน Marketplace ต่อไหมครับ?${note}`;
}

export function productsToActionCards(products, query) {
  return (products || []).slice(0, 3).map((p) => ({
    type: 'product_card',
    data: {
      id: p.id,
      title: p.title,
      description: p.merchant_name,
      price: p.price,
      image: p.image_url,
      imageUrl: p.image_url,
      url_path: p.url_path || `/m/product/${encodeURIComponent(p.id)}`,
      search_path: `/m/search?q=${encodeURIComponent(query || p.title || '')}`,
      open_path: `/storefront?p=${encodeURIComponent(p.url_path || `/m/product/${p.id}`)}`,
    },
  }));
}
