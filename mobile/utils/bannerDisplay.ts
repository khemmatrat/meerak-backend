import { getBackendBase } from "../services/api";

/** สัดส่วนสไลด์แบนเนอร์ — ตรงกับคอลัมน์ slide_height / remote.bannerCarousel */
export type BannerSlideHeight = "hero" | "strip" | "portrait";

export function parseBannerSlideHeight(v: unknown): BannerSlideHeight | null {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  if (s === "hero" || s === "strip" || s === "portrait") return s;
  return null;
}

export interface HomeBannerItem {
  id: string;
  title: string;
  imageUrl: string;
  /** Optional per-aspect image URLs (art-direction) */
  imageVariants?: Record<string, string> | null;
  actionUrl?: string;
  order: number;
  promoCode?: string;
  discountMaxBaht?: number;
  discountDescription?: string;
  discountMode?: "fixed_baht" | "percent";
  discountPercent?: number;
  minCumulativeTopupThb?: number;
  firstPaidJobOnly?: boolean;
  promoValidFrom?: string | null;
  promoValidUntil?: string | null;
  allowedJobCategories?: string[] | null;
  promoClaimsEnabled?: boolean;
  /** FROM API — ทับ default จาก remote / หน้าเมื่อมีค่า */
  slideHeight?: BannerSlideHeight | null;
  sheetOpens?: number;
  claims?: number;
  /** จาก API — null/ว่าง = ทุกหน้า */
  placements?: string[] | null;
}

export type BannerImageAspect = "1:1" | "2:1" | "9:16" | "16:9" | "4:3" | "3:4";

export function pickBannerImageByAspect(
  banner: HomeBannerItem,
  aspect: BannerImageAspect,
): string {
  const variants = banner?.imageVariants || null;
  const direct =
    variants && typeof variants === "object" ? variants[aspect] : "";
  const cleaned = String(direct || "").trim();
  if (cleaned) return cleaned;
  // fallback chain by similarity
  const fbOrder: BannerImageAspect[] =
    aspect === "9:16"
      ? ["3:4", "16:9", "4:3", "2:1", "1:1"]
      : aspect === "16:9"
        ? ["2:1", "4:3", "1:1", "3:4", "9:16"]
        : aspect === "2:1"
          ? ["16:9", "4:3", "1:1", "3:4", "9:16"]
          : aspect === "1:1"
            ? ["4:3", "3:4", "16:9", "2:1", "9:16"]
            : aspect === "4:3"
              ? ["1:1", "16:9", "3:4", "2:1", "9:16"]
              : ["9:16", "1:1", "4:3", "16:9", "2:1"];
  for (const a of fbOrder) {
    const u = String((variants && variants[a]) || "").trim();
    if (u) return u;
  }
  return banner.imageUrl;
}

function hasDirectVariant(
  banner: HomeBannerItem,
  aspect: BannerImageAspect,
): boolean {
  const variants = banner?.imageVariants;
  if (!variants || typeof variants !== "object") return false;
  return !!String(variants[aspect] || "").trim();
}

function firstAvailableAspect(
  banner: HomeBannerItem,
  order: BannerImageAspect[],
): BannerImageAspect | null {
  for (const a of order) {
    if (hasDirectVariant(banner, a)) return a;
  }
  return null;
}

/** เลือกสัดส่วน hero ตาม slideHeight + variant ที่อัปโหลดจริง (Method B) */
export function resolveBannerHeroAspect(
  banner: HomeBannerItem,
): BannerImageAspect {
  const slideHeight = parseBannerSlideHeight(banner.slideHeight);

  if (slideHeight === "portrait") {
    const found = firstAvailableAspect(banner, ["9:16", "3:4", "4:3", "16:9"]);
    if (found) return found;
  } else if (slideHeight === "strip") {
    const found = firstAvailableAspect(banner, ["2:1", "16:9"]);
    if (found) return found;
  } else if (slideHeight === "hero" || slideHeight === null) {
    const found = firstAvailableAspect(banner, ["16:9", "2:1", "4:3"]);
    if (found) return found;
  }

  const found = firstAvailableAspect(banner, [
    "16:9",
    "2:1",
    "4:3",
    "3:4",
    "9:16",
    "1:1",
  ]);
  if (found) return found;

  return "16:9";
}

export function aspectToCssRatio(aspect: BannerImageAspect): string {
  switch (aspect) {
    case "16:9":
      return "16 / 9";
    case "2:1":
      return "2 / 1";
    case "9:16":
      return "9 / 16";
    case "3:4":
      return "3 / 4";
    case "4:3":
      return "4 / 3";
    case "1:1":
      return "1 / 1";
  }
}

export function resolveBannerHeroImage(
  banner: HomeBannerItem,
  aspect: BannerImageAspect,
): ReturnType<typeof resolveBannerImageResponsive> {
  const picked = pickBannerImageByAspect(banner, aspect);
  const raw = String(picked ?? "").trim();
  if (!raw) return { src: null };
  const pipeline = convertGDriveUrl(raw) || raw;
  return resolveBannerImageResponsive(pipeline || raw, "carousel");
}

/** Thumbnail แถว list — 1:1 ถ้ามี variant ตรง, ไม่งั้น fallback 16:9 + contain */
export function resolveBannerListImage(banner: HomeBannerItem): {
  src: string | null;
  srcSet?: string;
  sizes?: string;
  useContain: boolean;
} {
  const hasSquare = hasDirectVariant(banner, "1:1");
  const aspect: BannerImageAspect = hasSquare ? "1:1" : "16:9";
  const picked = pickBannerImageByAspect(banner, aspect);
  const raw = String(picked ?? "").trim();
  if (!raw) return { src: null, useContain: !hasSquare };
  const pipeline = convertGDriveUrl(raw) || raw;
  const resolved = resolveBannerImageResponsive(pipeline || raw, "carousel");
  return { ...resolved, useContain: !hasSquare };
}

export function bannerHeroUsesDirectVariant(
  banner: HomeBannerItem,
  aspect: BannerImageAspect,
): boolean {
  return hasDirectVariant(banner, aspect);
}

/** รูปจาก Google Drive: `uc?export=view` / แชร์ธรรมดา มักคืนหน้า/login ใน <img> — ใช้ thumbnail API แทน */
function googleDriveBannerImageUrl(fileId: string): string {
  const id = encodeURIComponent(fileId.trim());
  return `https://drive.google.com/thumbnail?id=${id}&sz=w1920`;
}

/**
 * แยก file id จาก URL หรือจากข้อความที่แอดมิน paste แค่ id
 * รองรับ: /file/d/ID, /file/u/0/d/ID, open?id=, uc?id=, /thumbnail?id=
 */
function extractGoogleDriveFileIdFromUrl(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  const isDriveHost = host === "drive.google.com" || host === "docs.google.com";
  const isDriveUserContentHost =
    host === "drive.usercontent.google.com" ||
    host.endsWith(".drive.usercontent.google.com");
  const isGoogleUserContentHost =
    host === "drive.googleusercontent.com" ||
    host.endsWith(".drive.googleusercontent.com") ||
    host === "lh3.googleusercontent.com" ||
    host.endsWith(".lh3.googleusercontent.com");
  if (!isDriveHost && !isDriveUserContentHost && !isGoogleUserContentHost)
    return null;

  const filePath = url.pathname.match(
    /\/file\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/,
  );
  if (filePath) return filePath[1];

  // googleusercontent often exposes /d/<ID> as an image endpoint
  const gContentPath = url.pathname.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (gContentPath) return gContentPath[1];

  if (url.pathname.includes("/thumbnail")) {
    const id = url.searchParams.get("id");
    if (id && /^[a-zA-Z0-9_-]+$/.test(id)) return id;
  }
  if (url.pathname === "/open" || url.pathname.startsWith("/open")) {
    const id = url.searchParams.get("id");
    if (id && /^[a-zA-Z0-9_-]+$/.test(id)) return id;
  }
  if (url.pathname === "/uc" || url.pathname.startsWith("/uc")) {
    const id = url.searchParams.get("id");
    if (id && /^[a-zA-Z0-9_-]+$/.test(id)) return id;
  }
  // drive usercontent often uses /download?id=<ID> or /download?export=view&id=<ID>
  if (url.pathname.includes("/download")) {
    const id = url.searchParams.get("id");
    if (id && /^[a-zA-Z0-9_-]+$/.test(id)) return id;
  }
  // last chance: any host variant with ?id=<ID>
  const anyId = url.searchParams.get("id");
  if (anyId && /^[a-zA-Z0-9_-]+$/.test(anyId)) return anyId;
  return null;
}

function extractGoogleDriveFileIdFromString(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;

  // ไม่มี / : http ? # — เป็น Drive file id (แอดมิน paste เฉพาะ id)
  const bareLikelyDriveId =
    !/[\\/:.?#]/i.test(t) && /^[a-zA-Z0-9_-]{15,100}$/.test(t);
  if (bareLikelyDriveId) return t;

  try {
    let u: URL;
    if (/^https?:\/\//i.test(t)) {
      u = new URL(t);
    } else if (t.startsWith("//")) {
      u = new URL(`https:${t}`);
    } else if (
      /^drive\.google\.com\//i.test(t) ||
      /^docs\.google\.com\//i.test(t)
    ) {
      u = new URL(`https://${t}`);
    } else {
      return null;
    }
    return extractGoogleDriveFileIdFromUrl(u);
  } catch {
    return null;
  }
}

/** ได้ Drive thumbnail เมื่อรู้ว่าเป็น Drive; ถ้าไม่ใช่คืนค่าเดิม */
function googleDriveBannerUrlIfApplicable(input: string): string {
  const id = extractGoogleDriveFileIdFromString(input.trim());
  return id ? googleDriveBannerImageUrl(id) : input;
}

/** Google Drive / Docs share link → URL ที่ใช้ใน src ของ &lt;img&gt; ได้ (thumbnail API) */
export function convertGDriveUrl(url: string | null | undefined): string {
  if (url == null) return "";
  const s = String(url).trim();
  if (!s) return "";
  return googleDriveBannerUrlIfApplicable(s);
}

/**
 * URL รูปแบนเนอร์ให้โหลดได้บน HTTPS (แก้ path relative + อัปเกรด http→https + Google Drive share link)
 */
export function resolveBannerImageUrl(
  raw: string | undefined | null,
): string | null {
  let s = String(raw ?? "").trim();
  if (!s) return null;
  if (s.startsWith("data:") || s.startsWith("blob:")) return s;
  if (s.startsWith("//")) s = `https:${s}`;
  if (/^https?:\/\//i.test(s)) {
    s = googleDriveBannerUrlIfApplicable(s);
    if (
      typeof window !== "undefined" &&
      window.location.protocol === "https:" &&
      s.toLowerCase().startsWith("http://")
    ) {
      try {
        const u = new URL(s);
        return `https://${u.host}${u.pathname}${u.search}${u.hash}`;
      } catch {
        return s.replace(/^http:\/\//i, "https://");
      }
    }
    return s;
  }
  // ไม่ใช่ absolute URL: อาจเป็น path บน backend หรือ Drive file id ล้วน
  const driveIdOnly = extractGoogleDriveFileIdFromString(s);
  if (driveIdOnly && !/[\\/]/.test(s)) {
    return googleDriveBannerImageUrl(driveIdOnly);
  }
  const base = getBackendBase().replace(/\/$/, "");
  const path = s.startsWith("/") ? s : `/${s}`;
  return `${base}${path}`;
}

const CAROUSEL_IMG_SIZES =
  "(max-width: 480px) 96vw, (max-width: 1024px) 90vw, min(880px, 100vw)";
const SHEET_THUMB_IMG_SIZES = "(max-width: 480px) 92vw, 360px";
const GDRIVE_THUMB_WIDTHS = [480, 800, 1200, 1920] as const;

/**
 * Google Drive thumbnail: สร้าง srcset ตาม sz=w* เพื่อโหลดเบาบนมือถือ
 * URL อื่น: คืน src เดิม + sizes เพื่อให้ browser เลือกตาม viewport ได้ในอนาคต
 */
export function resolveBannerImageResponsive(
  raw: string | undefined | null,
  variant: "carousel" | "sheetThumb" = "carousel",
): {
  src: string | null;
  srcSet?: string;
  sizes?: string;
  /** โหลดก่อย (blur) — เฉพาะ Drive thumbnail */
  lowResSrc?: string;
} {
  const srcResolved = resolveBannerImageUrl(raw);
  if (!srcResolved) return { src: null };
  const sizes =
    variant === "sheetThumb" ? SHEET_THUMB_IMG_SIZES : CAROUSEL_IMG_SIZES;
  try {
    const u = new URL(srcResolved);
    const isGThumb =
      (u.hostname === "drive.google.com" || u.hostname === "docs.google.com") &&
      u.pathname.includes("/thumbnail") &&
      u.searchParams.get("id");
    if (isGThumb) {
      const srcSet = GDRIVE_THUMB_WIDTHS.map((w) => {
        const uu = new URL(u.toString());
        uu.searchParams.set("sz", `w${w}`);
        return `${uu.toString()} ${w}w`;
      }).join(", ");
      const uMain = new URL(u.toString());
      uMain.searchParams.set("sz", "w1200");
      const uLow = new URL(u.toString());
      uLow.searchParams.set("sz", "w480");
      return {
        src: uMain.toString(),
        srcSet,
        sizes,
        lowResSrc: uLow.toString(),
      };
    }
  } catch {
    /* ignore */
  }
  return { src: srcResolved, sizes };
}

/** ไม่แสดงคำอธิบายที่ซ้ำกับหัวข้อ */
export function bannerDiscountDescriptionDistinct(
  title: string,
  description: string | null | undefined,
): string | null {
  const t = String(title || "")
    .trim()
    .replace(/\s+/g, " ");
  const d = String(description || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!d) return null;
  if (d === t) return null;
  const dLower = d.toLowerCase();
  const tLower = t.toLowerCase();
  if (t && dLower.startsWith(tLower)) {
    const rest = d
      .slice(t.length)
      .trim()
      .replace(/^[·\-.:，,]\s*/, "");
    return rest || null;
  }
  return d;
}

export function isPromoClaimWindowActive(banner: HomeBannerItem): boolean {
  const now = Date.now();
  if (banner.promoValidFrom) {
    const t = new Date(banner.promoValidFrom).getTime();
    if (now < t) return false;
  }
  if (banner.promoValidUntil) {
    const t = new Date(banner.promoValidUntil).getTime();
    if (now > t) return false;
  }
  return true;
}

/** ปุ่มแบนเนอร์ใช้ React Router — ต้องเป็น path ขึ้นต้นด้วย / แอดมินมักใส่ app://… จึงแปลงให้ */
export function resolveBannerActionPath(actionUrl: string | undefined): string {
  const s = (actionUrl || "").trim();
  if (!s) return "/jobs";
  if (s.startsWith("/")) return s;
  if (/^app:\/\//i.test(s)) {
    const p = s.replace(/^app:\/\//i, "").replace(/^\/+/, "");
    const lower = p.toLowerCase();
    if (
      lower === "topup" ||
      lower === "wallet/topup" ||
      lower.startsWith("wallet/topup")
    ) {
      return "/wallet/topup";
    }
    if (lower === "prb" || lower.startsWith("prb/")) {
      return lower === "prb" ? "/prb" : `/${p}`;
    }
    if (lower === "jobs" || lower === "") return "/jobs";
    return p.includes("/") ? (p.startsWith("/") ? p : `/${p}`) : `/${p}`;
  }
  return "/jobs";
}

/** บนหน้ารายละเอียดงาน: โค้ดที่จำกัดหมวดให้แสดงเฉพาะเมื่อตรงกับงาน (หรือไม่จำกัดหมวด) */
export function bannerVisibleForJobCategory(
  banner: HomeBannerItem,
  jobCategory: string | undefined,
): boolean {
  const allowed = banner.allowedJobCategories;
  if (!allowed || !Array.isArray(allowed) || allowed.length === 0) return true;
  if (!jobCategory) return true;
  const jc = String(jobCategory).trim().toLowerCase();
  return allowed.some(
    (c) =>
      String(c || "")
        .trim()
        .toLowerCase() === jc,
  );
}

/**
 * หน้า Home — สอดคล้องกับ backend/lib/homeBanners.js filterBannersByPlacement(placement='home')
 * (รวม fallback โปรที่ลืมติ๊ก placement home)
 */
export function bannerVisibleForHomePlacement(banner: HomeBannerItem): boolean {
  const pl = banner.placements;
  if (pl == null || !Array.isArray(pl) || pl.length === 0) return true;
  if (pl.includes("home")) return true;
  const code = banner.promoCode != null && String(banner.promoCode).trim();
  const maxBaht =
    banner.discountMaxBaht != null &&
    !Number.isNaN(Number(banner.discountMaxBaht)) &&
    Number(banner.discountMaxBaht) > 0;
  const hasPromo = Boolean(code || maxBaht);
  if (hasPromo && pl.some((x) => x === "welcome" || x === "job_detail")) {
    return true;
  }
  return false;
}

/** หน้า Welcome — สอดคล้องกับ backend filterBannersByPlacement(placement='welcome') */
export function bannerVisibleForWelcomePlacement(
  banner: HomeBannerItem,
): boolean {
  const pl = banner.placements;
  if (pl == null || !Array.isArray(pl) || pl.length === 0) return true;
  if (pl.includes("welcome")) return true;
  const code = banner.promoCode != null && String(banner.promoCode).trim();
  const maxBaht =
    banner.discountMaxBaht != null &&
    !Number.isNaN(Number(banner.discountMaxBaht)) &&
    Number(banner.discountMaxBaht) > 0;
  const hasPromo = Boolean(code || maxBaht);
  if (hasPromo && pl.some((x) => x === "home" || x === "job_detail")) {
    return true;
  }
  return false;
}

/** หน้ารายละเอียดงาน — สอดคล้องกับ backend filterBannersByPlacement(placement='job_detail') */
export function bannerVisibleForJobDetailPlacement(
  banner: HomeBannerItem,
): boolean {
  const pl = banner.placements;
  if (pl == null || !Array.isArray(pl) || pl.length === 0) return true;
  if (pl.includes("job_detail")) return true;
  const code = banner.promoCode != null && String(banner.promoCode).trim();
  const maxBaht =
    banner.discountMaxBaht != null &&
    !Number.isNaN(Number(banner.discountMaxBaht)) &&
    Number(banner.discountMaxBaht) > 0;
  const hasPromo = Boolean(code || maxBaht);
  if (hasPromo && pl.some((x) => x === "home" || x === "welcome")) {
    return true;
  }
  return false;
}
