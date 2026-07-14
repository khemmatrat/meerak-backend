/** Map experience intent module ids → home section ids (Sprint 30d) */

export type HomeSectionId =
  | 'banner'
  | 'wallet'
  | 'mystery'
  | 'pass'
  | 'merchants'
  | 'food'
  | 'feed'
  | 'discover'
  | 'products';

const INTENT_SECTIONS: Record<string, HomeSectionId[]> = {
  discover: ['discover'],
  market: ['merchants', 'products'],
  marketplace: ['merchants', 'products'],
  food: ['food', 'products'],
  feed: ['feed'],
  merchant: ['merchants'],
  wallet: ['wallet'],
  rider: ['food'],
  talent: ['feed'],
  services: ['banner'],
  courses: ['pass'],
};

const DEFAULT_SECTION_ORDER: HomeSectionId[] = [
  'banner',
  'discover',
  'wallet',
  'mystery',
  'pass',
  'merchants',
  'food',
  'feed',
  'products',
];

export function resolveHomeSectionOrder(
  modules?: { id: string; rank: number }[],
): HomeSectionId[] {
  const ranked = [...(modules || [])].sort((a, b) => a.rank - b.rank);
  const out: HomeSectionId[] = [];

  for (const mod of ranked) {
    const key = String(mod.id || '').toLowerCase();
    const sections = INTENT_SECTIONS[key] || [key as HomeSectionId];
    for (const s of sections) {
      if (DEFAULT_SECTION_ORDER.includes(s) && !out.includes(s)) out.push(s);
    }
  }

  for (const s of DEFAULT_SECTION_ORDER) {
    if (!out.includes(s)) out.push(s);
  }

  return out;
}
