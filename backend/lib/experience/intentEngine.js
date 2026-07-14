/**
 * Intent Engine — Primary / Secondary / Hidden intent resolution (Sprint 30a stub)
 *
 * Example: "เปิดร้านอาหาร" → merchant → food → delivery → wallet → ads → analytics → ai
 */

export const INTENT_SURFACES = [
  'market',
  'food',
  'merchant',
  'rider',
  'jobs',
  'booking',
  'talent',
  'wallet',
  'pay',
  'brain',
  'courses',
  'feed',
  'ads',
  'analytics',
  'ai',
];

/** Static expansion map — real rules in Sprint 30b+ */
const INTENT_EXPANSION = {
  food_merchant: ['merchant', 'food', 'delivery', 'wallet', 'ads', 'analytics', 'ai'],
  marketplace_seller: ['merchant', 'market', 'wallet', 'ads', 'analytics', 'ai'],
  rider: ['rider', 'wallet', 'analytics'],
  talent: ['talent', 'booking', 'jobs', 'feed'],
  customer: ['market', 'food', 'wallet', 'recommendation'],
};

export function createIntentEngine(_deps = {}) {
  return {
    /**
     * @param {object} ctx — { selections?: string[], referralSource?: string }
     */
    async resolveIntents(ctx = {}) {
      const selections = Array.isArray(ctx.selections) ? ctx.selections : [];
      const primary = selections[0] || ctx.primarySelection || null;

      let secondary = [];
      let hidden = [];

      if (primary) {
        const key = mapSelectionToIntentKey(primary);
        hidden = INTENT_EXPANSION[key] || [];
        secondary = selections.slice(1);
      }

      return {
        stub: true,
        primary,
        secondary,
        hidden,
        surfaces: hidden.length ? hidden : INTENT_SURFACES.slice(0, 3),
        moduleOrder: buildModuleOrder(hidden),
      };
    },
  };
}

function mapSelectionToIntentKey(selection) {
  const s = String(selection || '').toLowerCase();
  if (s.includes('food') && (s.includes('merchant') || s.includes('store'))) return 'food_merchant';
  if (s.includes('rider')) return 'rider';
  if (s.includes('talent')) return 'talent';
  if (s.includes('hire') || s.includes('services')) return 'services';
  if (s.includes('video') || s.includes('feed')) return 'videos';
  if (s.includes('course')) return 'courses';
  if (s.includes('ai') && s.includes('ad')) return 'ai_ads';
  if (s.includes('image') || s.includes('studio')) return 'product_images';
  if (s.includes('resume')) return 'resume';
  if (s.includes('store') || s.includes('merchant') || s.includes('sell')) return 'marketplace_seller';
  if (s.includes('food') || s.includes('order')) return 'food_order';
  if (s.includes('market')) return 'marketplace';
  return 'customer';
}

function buildModuleOrder(hiddenSurfaces) {
  const priority = hiddenSurfaces.length ? hiddenSurfaces : ['market', 'food', 'feed'];
  return priority.map((id, i) => ({ id, rank: i + 1 }));
}
