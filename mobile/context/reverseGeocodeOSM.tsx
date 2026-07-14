export type ThaiAddress = {
  lat: number;
  lng: number;
  fullAddress: string;
  house?: string;
  road?: string;
  subdistrict?: string; // แขวง/ตำบล
  district?: string;    // เขต/อำเภอ
  province?: string;    // จังหวัด
};
export async function reverseGeocodeOSM(
  lat: number,
  lng: number
): Promise<ThaiAddress> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=th`
  );

  const data = await res.json();
  const a = data.address || {};

  return {
    lat,
    lng,
    fullAddress: data.display_name || "ไม่พบที่อยู่",
    house: a.house_number,
    road: a.road,
    subdistrict: a.suburb || a.neighbourhood || a.village,
    district: a.city_district || a.county,
    province: a.state,
  };
  
}
export function formatThaiAddress(addr: ThaiAddress) {
  const line1 = [addr.house, addr.road].filter(Boolean).join(" ");
  const line2 = [
    addr.subdistrict && `แขวง${addr.subdistrict}`,
    addr.district && `เขต${addr.district}`,
  ]
    .filter(Boolean)
    .join(" ");

  return [line1, line2, addr.province].filter(Boolean).join("\n");
}
