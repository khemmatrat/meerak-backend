import { api } from "./api";

/** ผ่าน backend → Nominatim (หลบ CORS และทำให้ได้ User-Agent ตามแนวทาง OSM) */
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<string | undefined> {
  try {
    const { data } = await api.get<{ address?: string }>("/geo/reverse", {
      params: { lat, lon: lng },
      timeout: 15000,
    });
    const addr = typeof data?.address === "string" ? data.address.trim() : "";
    return addr || undefined;
  } catch {
    return undefined;
  }
}
