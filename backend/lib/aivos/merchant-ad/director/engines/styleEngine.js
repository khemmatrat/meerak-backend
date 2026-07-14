/**
 * Style Engine — Phase 1 stub with stable resolution API.
 * Full preset library loads in Phase 2 (UGC_STYLE_LIBRARY).
 */

const STYLE_DEFAULTS = Object.freeze({
  friendly_seller: {
    id: 'friendly_seller',
    label_th: 'คนขายเป็นกันเอง',
    default_format: 'ugc_lipsync',
  },
  tiktok_creator: {
    id: 'tiktok_creator',
    label_th: 'TikTok Creator',
    default_format: 'ugc_lipsync',
  },
  luxury_brand: {
    id: 'luxury_brand',
    label_th: 'แบรนด์พรีเมียม',
    default_format: 'tvc_multi_shot',
  },
  restaurant_owner: {
    id: 'restaurant_owner',
    label_th: 'เจ้าของร้านอาหาร',
    default_format: 'ugc_lipsync',
  },
  beauty_influencer: {
    id: 'beauty_influencer',
    label_th: 'Beauty Influencer',
    default_format: 'ugc_lipsync',
  },
  professional_consultant: {
    id: 'professional_consultant',
    label_th: 'ที่ปรึกษามืออาชีพ',
    default_format: 'ugc_lipsync',
  },
});

/**
 * @param {{ style_id: string, format: string }} input
 */
export function resolveStyle(input) {
  const preset = STYLE_DEFAULTS[input.style_id] || STYLE_DEFAULTS.friendly_seller;
  return {
    ...preset,
    format_hint: preset.default_format,
    source: 'style_engine_v1',
  };
}

export function listStylePresets() {
  return Object.values(STYLE_DEFAULTS);
}
