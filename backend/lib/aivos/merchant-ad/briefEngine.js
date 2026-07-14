const SHOT_ROLES = [
  'hero',
  'macro_cap',
  'macro_label',
  'water_burst',
  'texture',
  'lifestyle',
  'top_down',
  'environment',
  'detail',
  'finale',
];

export function ruleBasedBrief(ctx) {
  const title = ctx.product_title || 'สินค้า';
  const mood = ctx.mood || 'premium';
  const ingredient = ctx.category_style === 'food' ? 'steam and fresh ingredients' : 'glossy liquid swirl accent';
  const shots = SHOT_ROLES.map((role, i) => {
    const base = `${title}, ${mood} TVC still, shot ${i + 1}, 9:16 vertical, cinematic studio`;
    const variants = {
      hero: `${base}, low-angle telephoto, ${ingredient} spiraling around product`,
      macro_cap: `${base}, extreme macro on cap/lid, shallow DOF`,
      macro_label: `${base}, macro embossed label, cool side light`,
      water_burst: `${base}, centered product, water explosion behind`,
      texture: `${base}, macro texture, ${ingredient}`,
      lifestyle: `${base}, person using product naturally`,
      top_down: `${base}, bird's eye in shallow water, ripple rings`,
      environment: `${base}, premium counter environment, soft bokeh`,
      detail: `${base}, hero feature detail, minimal background`,
      finale: `${base}, pure black background, falling water droplet`,
    };
    return {
      shot: i + 1,
      role,
      image_prompt: variants[role] || base,
      video_prompt: `Cinematic motion, ${role}, 2.5s`,
      duration_sec: i === 9 ? 3 : 2.5,
    };
  });
  return {
    title: `${title} — ${ctx.hook || 'โฆษณา'}`,
    tagline_th: ctx.hook === 'discount' ? 'ดีลพิเศษวันนี้' : 'คุณภาพที่คุณไว้ใจ',
    shots,
    source: 'rules',
  };
}

export async function fetchBriefFromAiCore(ctx) {
  const base =
    process.env.AI_CORE_DIRECT_URL ||
    process.env.AI_CORE_URL ||
    'http://127.0.0.1:8100';
  const key = process.env.AI_CORE_API_KEY || '';
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers['X-AI-Core-Api-Key'] = key;
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/v1/merchant/ad-brief`, {
      method: 'POST',
      headers,
      body: JSON.stringify(ctx),
      signal: AbortSignal.timeout(60000),
    });
    const data = await res.json();
    if (data?.brief?.shots?.length >= 8) return { ...data.brief, source: data.brief.source || 'hermes' };
  } catch {
    /* fallback */
  }
  return ruleBasedBrief(ctx);
}
