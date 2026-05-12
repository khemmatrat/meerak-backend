import type { BannerPlacementSlug } from '../types';

export const ALL_BANNER_PLACEMENTS: BannerPlacementSlug[] = ['home', 'welcome', 'job_detail'];

export const BANNER_PLACEMENT_LABELS: Record<BannerPlacementSlug, string> = {
  home: 'หน้า Home (หลังล็อกอิน)',
  welcome: 'หน้า Welcome (ก่อนล็อกอิน)',
  job_detail: 'หน้ารายละเอียดงาน',
};

/** null/ว่างจาก API = แสดงทุกหน้า */
export function bannerPlacementsFromApi(
  placements: BannerPlacementSlug[] | null | undefined
): BannerPlacementSlug[] {
  if (!placements || placements.length === 0) return [...ALL_BANNER_PLACEMENTS];
  return ALL_BANNER_PLACEMENTS.filter((p) => placements.includes(p));
}

/** ส่งไป backend: เลือกครบทุกหน้า → null (เก็บใน DB เป็น NULL) */
export function bannerPlacementsToApiPayload(
  selected: BannerPlacementSlug[]
): BannerPlacementSlug[] | null {
  const set = new Set(selected.filter((p) => ALL_BANNER_PLACEMENTS.includes(p)));
  if (set.size >= ALL_BANNER_PLACEMENTS.length) return null;
  if (set.size === 0) return null;
  return ALL_BANNER_PLACEMENTS.filter((p) => set.has(p));
}
