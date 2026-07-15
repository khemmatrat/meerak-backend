/**
 * Service / technician matching for OS chat (ช่างแอร์, รปภ., ความปลอดภัย, ฯลฯ)
 */

const BACKEND_BASE = () =>
  (process.env.BACKEND_PUBLIC_URL || process.env.PUBLIC_API_URL || 'http://127.0.0.1:3001').replace(
    /\/$/,
    '',
  );

/** Skill packs: keywords → category label + deep link in mobile app */
const SERVICE_PACKS = [
  {
    id: 'ac',
    label: 'ช่างแอร์ / ล้างแอร์',
    category: 'ac_cleaning',
    route: '/cleaning-specialist',
    keywords: [
      'แอร์',
      'aircon',
      'air-con',
      'ac',
      'conditioner',
      'ล้างแอร์',
      'ซ่อมแอร์',
      'ช่างแอร์',
      'น้ำยาแอร์',
    ],
  },
  {
    id: 'security',
    label: 'รปภ. / ยาม / คุ้มครองความปลอดภัย',
    category: 'security',
    route: '/jobs',
    keywords: [
      'รปภ',
      'ยาม',
      'security',
      'bodyguard',
      'คุ้มครอง',
      'ปกป้อง',
      'ความปลอดภัย',
      'รักษาความปลอดภัย',
      'guard',
      'ปลอดภัย',
    ],
  },
  {
    id: 'electrician',
    label: 'ช่างไฟฟ้า',
    category: 'repair',
    route: '/jobs',
    keywords: ['ไฟฟ้า', 'electrician', 'ไฟตก', 'สายไฟ', 'ช่างไฟ'],
  },
  {
    id: 'plumber',
    label: 'ช่างประปา',
    category: 'repair',
    route: '/jobs',
    keywords: ['ประปา', 'plumber', 'ท่อน้ำ', 'น้ำรั่ว', 'ช่างประปา'],
  },
  {
    id: 'cleaning',
    label: 'แม่บ้าน / ทำความสะอาด',
    category: 'cleaning',
    route: '/cleaning-specialist',
    keywords: ['แม่บ้าน', 'ทำความสะอาด', 'cleaning', 'big cleaning', 'คอนโดสะอาด'],
  },
  {
    id: 'beauty',
    label: 'ความงาม / นวด / สปา',
    category: 'beauty',
    route: '/talents',
    keywords: ['นวด', 'สปา', 'แต่งหน้า', 'ทำเล็บ', 'beauty', 'wellness'],
  },
  {
    id: 'tech',
    label: 'ช่างทั่วไป / ซ่อม',
    category: 'repair',
    route: '/jobs',
    keywords: ['ช่าง', 'ซ่อม', 'repair', 'technician', 'บริการ'],
  },
];

const DEMO_PROVIDERS = [
  {
    id: 'demo-ac-01',
    name: 'คุณเอก — ช่างแอร์มืออาชีพ',
    skills: ['ช่างแอร์', 'ล้างแอร์', 'ซ่อมแอร์'],
    rating: 4.9,
    location: 'Bangkok',
    signature_service: 'ตรวจระบบ + ล้างแอร์ ไม่เย็นคืนเงินส่วนงาน',
    pack_id: 'ac',
    price_hint: 'เริ่ม ฿450/เครื่อง',
  },
  {
    id: 'demo-ac-02',
    name: 'ทีม CoolFix 24ชม.',
    skills: ['ช่างแอร์', 'ติดตั้งแอร์'],
    rating: 4.7,
    location: 'Nonthaburi',
    signature_service: 'ซ่อมด่วนนอกเวลา รับงานกลางคืน',
    pack_id: 'ac',
    price_hint: 'เริ่ม ฿690',
  },
  {
    id: 'demo-sec-01',
    name: 'SecureGuard Pro',
    skills: ['รปภ.', 'ยาม', 'คุ้มครอง'],
    rating: 4.8,
    location: 'Bangkok',
    signature_service: 'ยามอาคาร / อีเวนต์ / คุ้มครองส่วนตัว',
    pack_id: 'security',
    price_hint: 'เริ่ม ฿1,200/กะ',
  },
  {
    id: 'demo-sec-02',
    name: 'พี่สมชาย — รปภ.ผ่านอบรม',
    skills: ['รปภ.', 'ความปลอดภัย', 'ปกป้อง'],
    rating: 4.6,
    location: 'Samut Prakan',
    signature_service: 'ดูแลความปลอดภัยที่พักอาศัยและคลังสินค้า',
    pack_id: 'security',
    price_hint: 'เริ่ม ฿900/กะ',
  },
  {
    id: 'demo-elec-01',
    name: 'ช่างไฟ บ้าน&ออฟฟิศ',
    skills: ['ช่างไฟฟ้า', 'เดินสาย'],
    rating: 4.7,
    location: 'Bangkok',
    signature_service: 'แก้ไฟตก ตัดต่อเบรกเกอร์',
    pack_id: 'electrician',
    price_hint: 'เริ่ม ฿500',
  },
  {
    id: 'demo-plumb-01',
    name: 'ประปาเร็วทันใจ',
    skills: ['ช่างประปา', 'ท่อน้ำ'],
    rating: 4.5,
    location: 'Bangkok',
    signature_service: 'แก้ท่อรั่ว เปลี่ยนก๊อก',
    pack_id: 'plumber',
    price_hint: 'เริ่ม ฿400',
  },
  {
    id: 'demo-clean-01',
    name: 'CleanHome Daily',
    skills: ['แม่บ้าน', 'ทำความสะอาด'],
    rating: 4.8,
    location: 'Bangkok',
    signature_service: 'แม่บ้านรายวัน / Big Cleaning',
    pack_id: 'cleaning',
    price_hint: 'เริ่ม ฿800/4ชม.',
  },
];

export function isServiceIntentMessage(message) {
  const t = String(message || '').toLowerCase();
  if (/หาสินค้า|ซื้อสินค้า|marketplace|นาฬิกา|คีย์บอร์ด|หูฟัง|เสื้อ(?!.*(ช่าง|แอร์))/.test(t) && !/ช่าง|บริการ|รปภ|ยาม|คุ้มครอง|แอร์|ซ่อม|แม่บ้าน/.test(t)) {
    return false;
  }
  return SERVICE_PACKS.some((p) => p.keywords.some((k) => t.includes(k.toLowerCase())));
}

export function resolveServicePack(message) {
  const t = String(message || '').toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const pack of SERVICE_PACKS) {
    let score = 0;
    for (const k of pack.keywords) {
      if (t.includes(k.toLowerCase())) score += k.length > 4 ? 3 : 2;
    }
    if (score > bestScore) {
      bestScore = score;
      best = pack;
    }
  }
  return bestScore > 0 ? best : null;
}

export function extractServiceQuery(message) {
  return String(message || '')
    .replace(/^(หา|ค้น|ค้นหา|อยากได้|ต้องการ|ขอ|จ้าง|ติดต่อ)\s*/i, '')
    .replace(/\s*(ให้หน่อย|หน่อย|ครับ|ค่ะ|นะ)\s*$/i, '')
    .trim();
}

function scoreProvider(p, tokens, pack) {
  const hay = `${p.name || ''} ${(p.skills || []).join(' ')} ${p.signature_service || ''} ${p.expert_category || ''}`.toLowerCase();
  let score = 0;
  for (const tok of tokens) {
    const bare = tok.replace(/\p{M}/gu, '');
    if (bare.length < 3) continue;
    if (hay.includes(tok.toLowerCase())) score += bare.length > 3 ? 3 : 2;
  }
  if (pack) {
    for (const k of pack.keywords) {
      if (hay.includes(k.toLowerCase())) score += 3;
    }
    if (p.pack_id === pack.id) score += 8;
    if (p.expert_category && pack.category && String(p.expert_category).includes(pack.category)) {
      score += 4;
    }
  }
  return score;
}

async function fetchProvidersFromApi(pack) {
  const base = BACKEND_BASE();
  const q = new URLSearchParams();
  if (pack?.category && !['ac_cleaning', 'security', 'repair', 'cleaning'].includes(pack.category)) {
    q.set('category', pack.category);
  }
  const url = `${base}/api/providers${q.toString() ? `?${q}` : ''}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(Number(process.env.OS_SERVICE_SEARCH_TIMEOUT_MS || 8000)),
  });
  if (!res.ok) throw new Error(`providers ${res.status}`);
  const data = await res.json();
  const rows = Array.isArray(data) ? data : data.providers || data.data || [];
  return rows.map((p) => ({
    id: String(p.id),
    name: p.name || p.full_name || 'Provider',
    skills: Array.isArray(p.skills) ? p.skills : [],
    rating: Number(p.rating) || 0,
    location: typeof p.location === 'string' ? p.location : p.location?.city || 'Thailand',
    signature_service: p.signature_service || '',
    expert_category: p.expert_category || null,
    avatar_url: p.avatar_url || '',
    // Do NOT stamp pack.id on every live row — that falsely ranks unrelated providers
    pack_id: null,
    open_path: `/talents/${p.id}`,
  }));
}

/**
 * @returns {Promise<{ query: string, pack: object|null, providers: object[], source: string }>}
 */
export async function searchServicesForChat(message, { limit = 5 } = {}) {
  const query = extractServiceQuery(message);
  const pack = resolveServicePack(message);
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1);

  let live = [];
  try {
    live = await fetchProvidersFromApi(pack);
  } catch (e) {
    console.warn('[osServiceSearch] providers api:', e?.message || e);
  }

  const scoredLive = live
    .map((p) => ({ p, score: scoreProvider(p, tokens, pack) }))
    .filter((x) => x.score >= 3)
    .sort((a, b) => b.score - a.score || b.p.rating - a.p.rating)
    .map((x) => x.p);

  if (scoredLive.length) {
    return {
      query,
      pack,
      providers: scoredLive.slice(0, limit).map((p) => ({
        ...p,
        open_path: p.open_path || `/talents/${p.id}`,
      })),
      source: 'providers_api',
    };
  }

  // Prefer skill-matched demos over unfiltered live list
  const demo = DEMO_PROVIDERS.map((p) => ({
    p: {
      ...p,
      open_path:
        pack?.id === 'ac' || p.pack_id === 'ac'
          ? '/cleaning-specialist'
          : pack?.id === 'security' || p.pack_id === 'security'
            ? '/jobs'
            : `/talents`,
    },
    score: scoreProvider(p, tokens, pack),
  }))
    .filter((x) => (pack ? x.p.pack_id === pack.id : x.score >= 3))
    .sort((a, b) => b.score - a.score || b.p.rating - a.p.rating)
    .map((x) => x.p);

  const fallbackPack =
    pack && !demo.length
      ? DEMO_PROVIDERS.filter((p) => p.pack_id === pack.id).map((p) => ({
          ...p,
          open_path: pack.route || '/jobs',
        }))
      : demo;

  return {
    query,
    pack,
    providers: fallbackPack.slice(0, limit),
    source: fallbackPack.length ? 'demo_providers' : 'empty',
  };
}

export function formatServiceSearchThai(query, providers, pack, source) {
  if (!providers?.length) {
    return `ยังไม่พบช่าง/บริการที่ตรงกับ “${query}” ชัดเจนครับ — ลองระบุทักษะสั้นๆ เช่น “ช่างแอร์” “รปภ.” หรือเปิด Job Board / Cleaning จาก Sidebar ได้เลยครับ`;
  }
  const label = pack?.label ? ` (${pack.label})` : '';
  const lines = providers.slice(0, 5).map((p, i) => {
    const rate = p.rating ? ` ★${p.rating}` : '';
    const price = p.price_hint ? ` — ${p.price_hint}` : '';
    return `${i + 1}. ${p.name}${rate}${price}\n   ${p.signature_service || (p.skills || []).slice(0, 3).join(', ')}`;
  });
  const note =
    source === 'demo_providers'
      ? '\n(แสดงตัวอย่างช่างเมื่อฐานข้อมูลผู้ให้บริการว่าง/ยังเชื่อมไม่ครบ)'
      : '';
  return `พบผู้ให้บริการที่ตรงทักษะ“${query}”${label} ${providers.length} รายการครับ:\n${lines.join('\n')}\n\nแตะการ์ดเพื่อเปิดโปรไฟล์/จอง หรือให้ช่วยคัดใกล้คุณเพิ่มได้ครับ${note}`;
}

export function providersToActionCards(providers, pack) {
  return (providers || []).slice(0, 3).map((p) => ({
    type: 'service_card',
    data: {
      id: p.id,
      title: p.name,
      description: p.signature_service || (p.skills || []).slice(0, 4).join(' · '),
      rating: p.rating,
      price: p.price_hint,
      location: p.location,
      open_path: p.open_path || pack?.route || '/jobs',
      image: p.avatar_url,
    },
  }));
}
