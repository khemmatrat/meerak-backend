/**
 * Infer default transport hub from profile address text when `location.transport_region` is unset.
 */

import type { TransportRegionId } from "./transportRegions";
import { TRANSPORT_REGIONS } from "./transportRegions";

type ProvinceRow = { match: string[]; region: TransportRegionId };

/** Longer / more specific phrases first (e.g. หาดใหญ่ before สงขลา). */
const PROVINCE_ROWS: ProvinceRow[] = [
  { match: ["หาดใหญ่", "hat yai", "hatyai"], region: "hat_yai" },
  { match: ["พัทยา", "pattaya", "บางละมุง"], region: "pattaya" },
  { match: ["กรุงเทพ", "bangkok", "กทม"], region: "bangkok" },
  { match: ["เชียงใหม่", "chiang mai"], region: "chiang_mai" },
  { match: ["ภูเก็ต", "phuket"], region: "phuket" },
  { match: ["ชลบุรี", "chonburi", "ศรีราชา"], region: "chonburi" },
  { match: ["ราชบุรี", "ratchaburi"], region: "ratchaburi" },
  { match: ["ขอนแก่น", "khon kaen", "khonkaen"], region: "khon_kaen" },
  { match: ["นครราชสีมา", "โคราช", "korat", "nakhon ratchasima"], region: "korat" },
  { match: ["สงขลา", "songkhla"], region: "hat_yai" },
  { match: ["บุรีรัมย์", "buriram"], region: "buriram" },
  { match: ["อุดรธานี", "udon thani", "udon"], region: "udon_thani" },
];

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Returns a region id when address text matches a known province/hub; otherwise null.
 * Does not read `location.transport_region` — caller decides whether to apply.
 */
export function matchTransportRegionFromAddressText(address: string | null | undefined): TransportRegionId | null {
  const raw = `${address || ""}`;
  const n = norm(raw);
  if (!n) return null;
  for (const row of PROVINCE_ROWS) {
    for (const m of row.match) {
      if (n.includes(norm(m))) return row.region;
    }
  }
  return null;
}

/**
 * When server has not set `transport_region`, suggest default from residential address.
 */
export function inferRegionFromResidentialAddress(user: {
  location?: { transport_region?: string };
  residential_address?: string | null;
} | null): TransportRegionId | null {
  if (!user) return null;
  const tr = user.location?.transport_region;
  if (tr && tr in TRANSPORT_REGIONS) return null;
  return matchTransportRegionFromAddressText(user.residential_address);
}
