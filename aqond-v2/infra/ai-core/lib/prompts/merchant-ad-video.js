/** Merchant product ad — 10-shot TVC-style brief (Shopee/Luma/Krea quality bar). */

const SHOT_TYPES = [
  { shot: 1, role: 'hero', label: 'Hero product + liquid/motion accent' },
  { shot: 2, role: 'macro_cap', label: 'Macro close-up cap/lid' },
  { shot: 3, role: 'macro_label', label: 'Macro embossed label + side light' },
  { shot: 4, role: 'water_burst', label: 'Product centered, water explosion behind' },
  { shot: 5, role: 'texture', label: 'Product texture / ingredient swirl' },
  { shot: 6, role: 'lifestyle', label: 'Human using product (hands/face)' },
  { shot: 7, role: 'top_down', label: "Bird's eye in water with ripple rings" },
  { shot: 8, role: 'environment', label: 'Product in premium environment' },
  { shot: 9, role: 'detail', label: 'Detail feature callout' },
  { shot: 10, role: 'finale', label: 'Finale — pure background + droplet' },
];

export function merchantAdBriefPrompt(ctx) {
  const shots = SHOT_TYPES.map((s) => `Shot ${s.shot} (${s.role}): ${s.label}`).join('\n');
  return `You are AQOND Merchant Ad Director. Create a 10-shot premium product TVC brief in JSON only.

Product: ${ctx.product_title || 'สินค้า'}
Category: ${ctx.category_style || 'general'}
Mood: ${ctx.mood || 'premium'}
Audience: ${ctx.audience || 'all'}
Hook: ${ctx.hook || 'quality'}
Merchant: ${ctx.merchant_name || 'ร้านค้า'}
Visual notes: ${ctx.visual_notes || ''}

Required shot structure:
${shots}

Return JSON:
{
  "title": "short ad title",
  "tagline_th": "Thai tagline max 40 chars",
  "shots": [
    {
      "shot": 1,
      "role": "hero",
      "image_prompt": "detailed still image prompt, cinematic, 9:16, product centered...",
      "video_prompt": "motion description for 2-3s clip, camera move...",
      "duration_sec": 2.5
    }
  ]
}
Exactly 10 shots. image_prompt must mention product shape/colors from context. Professional lighting, no text overlay in image.`;
}

export function ruleBasedAdBrief(ctx) {
  const title = ctx.product_title || 'สินค้า';
  const mood = ctx.mood || 'premium';
  const ingredient = ctx.category_style === 'food' ? 'steam and fresh ingredients' : 'glossy liquid swirl accent';

  const shots = SHOT_TYPES.map((t, i) => {
    const base = `${title}, ${mood} commercial, 9:16 vertical, studio lighting`;
    const prompts = {
      hero: `${base}, low-angle telephoto, ${ingredient} spiraling around product, light grey background`,
      macro_cap: `${base}, extreme macro on cap/lid, shallow depth of field, cool side light`,
      macro_label: `${base}, macro embossed label, razor sharp typography area, cinematic side light`,
      water_burst: `${base}, centered product, water explosion behind, frozen droplets`,
      texture: `${base}, macro product texture, rich ${ingredient}`,
      lifestyle: `${base}, ${ctx.audience === 'men' ? 'man' : ctx.audience === 'women' ? 'woman' : 'person'} applying/using product naturally`,
      top_down: `${base}, bird's eye straight down, product in shallow water, expanding ripple rings`,
      environment: `${base}, premium bathroom/kitchen counter environment, soft bokeh`,
      detail: `${base}, hero feature detail callout, minimal background`,
      finale: `${base}, pure black background, single falling water droplet above product`,
    };
    return {
      shot: t.shot,
      role: t.role,
      image_prompt: prompts[t.role] || base,
      video_prompt: `Slow cinematic push-in, ${prompts[t.role] || base}, 2.5 seconds`,
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

export { SHOT_TYPES };
