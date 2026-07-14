import { THAI_PROVINCES } from "../constants/workTaxonomy";
import { matchTransportRegionFromAddressText } from "./transportProvinceBinding";
import type { TransportRegionId } from "./transportRegions";
export {
  suggestCategoryFromHistory,
  scoreAdvanceSmartMatchJobs,
} from "./jobBoardSmartMatchScoring.js";

/** แมป transport hub → ชื่อจังหวัดที่ใช้ใน advance_jobs.target_province */
const TRANSPORT_REGION_TO_PROVINCE: Partial<Record<TransportRegionId, string>> = {
  bangkok: "กรุงเทพมหานคร",
  chiang_mai: "เชียงใหม่",
  phuket: "ภูเก็ต",
  chonburi: "ชลบุรี",
  ratchaburi: "ราชบุรี",
  khon_kaen: "ขอนแก่น",
  korat: "นครราชสีมา",
  hat_yai: "สงขลา",
  buriram: "บุรีรัมย์",
  udon_thani: "อุดรธานี",
  pattaya: "ชลบุรี",
};

function matchProvinceFromAddressText(address: string | null | undefined): string | null {
  const raw = `${address || ""}`.trim();
  if (!raw) return null;
  const sorted = [...THAI_PROVINCES].sort((a, b) => b.length - a.length);
  for (const p of sorted) {
    if (raw.includes(p)) return p;
  }
  const region = matchTransportRegionFromAddressText(raw);
  if (region && TRANSPORT_REGION_TO_PROVINCE[region]) {
    return TRANSPORT_REGION_TO_PROVINCE[region]!;
  }
  return null;
}

/** จังหวัดที่น่าจะเหมาะกับ user จากโปรไฟล์ + config remote */
export function getUserPreferredProvinces(
  user: {
    location?: { transport_region?: string };
    residential_address?: string | null;
  } | null | undefined,
  configProvinces?: string[] | null,
): string[] {
  const out = new Set<string>();

  for (const p of configProvinces || []) {
    const t = String(p || "").trim();
    if (t) out.add(t);
  }

  if (user) {
    const tr = user.location?.transport_region as TransportRegionId | undefined;
    if (tr && TRANSPORT_REGION_TO_PROVINCE[tr]) {
      out.add(TRANSPORT_REGION_TO_PROVINCE[tr]!);
    }
    const fromAddr = matchProvinceFromAddressText(user.residential_address);
    if (fromAddr) out.add(fromAddr);
  }

  return [...out];
}

/** หมวดที่ routing config ชี้ว่าเหมาะกับ Job Board */
export function getRoutingPreferredCategories(
  overrides?: Record<
    string,
    Partial<Record<"booking" | "match_job" | "jobboard" | "videofeed", number>>
  > | null,
): string[] {
  if (!overrides || typeof overrides !== "object") return [];
  return Object.entries(overrides)
    .filter(([, weights]) => {
      if (!weights || typeof weights !== "object") return false;
      const jb = Number(weights.jobboard ?? 0);
      const others = Math.max(
        Number(weights.booking ?? 0),
        Number(weights.match_job ?? 0),
        Number(weights.videofeed ?? 0),
      );
      return jb > 0 && jb >= others;
    })
    .map(([cat]) => cat);
}

export type SmartMatchJobInput = {
  id: string | number;
  category?: string | null;
  status?: string | null;
  max_budget?: number | null;
  target_province?: string | null;
};

export type SmartMatchScoredJob<T extends SmartMatchJobInput> = {
  job: T;
  score: number;
  reasons: string[];
};
