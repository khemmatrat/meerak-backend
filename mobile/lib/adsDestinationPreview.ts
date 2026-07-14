export type AdsDestinationKind =
  | "profile"
  | "talent_profile"
  | "talent_booking"
  | "booking_transport"
  | "advance_job"
  | "job_detail"
  | "talents_list"
  | "job_board"
  | "external"
  | "unknown";

export interface AdsDestinationPreviewModel {
  kind: AdsDestinationKind;
  raw: string;
  routePath: string;
  title: string;
  subtitle: string;
  talentId?: string;
  jobId?: string;
  tab?: string;
  isValid: boolean;
  hint?: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function stripQueryHash(path: string): { path: string; tab?: string } {
  const noHash = path.replace(/^#/, "");
  const [base, query] = noHash.split("?");
  const tab = query
    ?.split("&")
    .map((p) => p.split("="))
    .find(([k]) => k === "tab")?.[1];
  return { path: base || "/", tab: tab ? decodeURIComponent(tab) : undefined };
}

/** Normalize user input to an in-app route path or external URL. */
export function normalizeAdsDestinationInput(raw: string): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "/profile";

  if (trimmed.startsWith("#/")) return trimmed.slice(1);
  if (trimmed.startsWith("#")) return `/${trimmed.slice(1)}`;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      if (typeof window !== "undefined" && u.origin === window.location.origin && u.hash.startsWith("#/")) {
        return u.hash.slice(1);
      }
      return trimmed;
    } catch {
      return trimmed;
    }
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function normalizeInternalAliases(path: string): string {
  let p = path.replace(/\/+/g, "/");
  p = p.replace(/^\/advance-jobs?\//i, "/job-board/");
  p = p.replace(/^\/advancejob\//i, "/job-board/");
  return p;
}

export function parseAdsDestination(raw: string): AdsDestinationPreviewModel {
  const normalized = normalizeAdsDestinationInput(raw);
  const external = /^https?:\/\//i.test(normalized);

  if (external) {
    let host = normalized;
    try {
      host = new URL(normalized).hostname;
    } catch {
      /* keep raw */
    }
    return {
      kind: "external",
      raw,
      routePath: normalized,
      title: "เว็บภายนอก",
      subtitle: host,
      isValid: true,
      hint: "เปิดในแท็บใหม่เมื่อผู้ใช้กดโฆษณา",
    };
  }

  const { path, tab } = stripQueryHash(normalizeInternalAliases(normalized));
  const segments = path.split("/").filter(Boolean);

  if (path === "/profile" || (segments[0] === "profile" && segments.length === 1)) {
    const tabLabel =
      tab === "wallet"
        ? "แท็บ Wallet"
        : tab === "portfolio"
          ? "แท็บ Portfolio"
          : tab
            ? `แท็บ ${tab}`
            : "หน้าโปรไฟล์หลัก";
    return {
      kind: "profile",
      raw,
      routePath: path + (tab ? `?tab=${tab}` : ""),
      title: "โปรไฟล์ของฉัน",
      subtitle: tabLabel,
      tab,
      isValid: true,
      hint: "ลูกค้าเห็นโปรไฟล์ ผลงาน และช่องทางติดต่อของคุณ",
    };
  }

  if (path === "/talents" || path === "/talents/") {
    return {
      kind: "talents_list",
      raw,
      routePath: "/talents",
      title: "รายชื่อ Talents",
      subtitle: "ค้นหา Expert / ผู้ให้บริการ",
      isValid: true,
      hint: "เหมาะกับโฆษณาแบรนด์หรือ marketplace ทั่วไป",
    };
  }

  if (segments[0] === "talents" && segments[1] && UUID_RE.test(segments[1])) {
    const talentId = segments[1];
    if (segments[2] === "beauty-booking") {
      return {
        kind: "talent_booking",
        raw,
        routePath: `/talents/${talentId}/beauty-booking`,
        title: "จองคิว Expert",
        subtitle: "เลือกวัน–เวลา → ชำระมัดจำ → ยืนยันการจอง",
        talentId,
        isValid: true,
        hint: "ลูกค้ากดโฆษณาแล้วเข้าหน้าจองคิวทันที — เหมาะโปรโมตบริการ Beauty / ช่าง",
      };
    }
    return {
      kind: "talent_profile",
      raw,
      routePath: `/talents/${talentId}`,
      title: "หน้า Expert / Talent",
      subtitle: "ดูรีวิว · ผลงาน · ปุ่ม Book Now",
      talentId,
      isValid: true,
      hint: "ลูกค้าเห็นโปรไฟล์ Expert แล้วกด Book Now หรือเลือกเวลาได้",
    };
  }

  if (path === "/booking" || path === "/transport") {
    return {
      kind: "booking_transport",
      raw,
      routePath: path === "/transport" ? "/transport" : "/booking",
      title: "จองบริการ / ขนส่ง",
      subtitle: "เลือกจุดรับ–ส่ง · ดูราคา · ยืนยันการจอง",
      isValid: true,
      hint: "ใช้กับโฆษณาบริการรถรับส่ง / Transport",
    };
  }

  if (segments[0] === "job-board" && segments[1]) {
    return {
      kind: "advance_job",
      raw,
      routePath: `/job-board/${segments[1]}`,
      title: "งาน Advance Job",
      subtitle: "ดูรายละเอียดงาน · สมัคร / จ้าง Talent",
      jobId: segments[1],
      isValid: true,
      hint: "ลูกค้าเข้าหน้ารายละเอียดงานเพื่อสมัครหรือจ้าง",
    };
  }

  if (path === "/job-board") {
    return {
      kind: "job_board",
      raw,
      routePath: "/job-board",
      title: "Job Board",
      subtitle: "รายการงาน Advance / Freelance",
      isValid: true,
    };
  }

  if (segments[0] === "jobs" && segments[1]) {
    return {
      kind: "job_detail",
      raw,
      routePath: `/jobs/${segments[1]}`,
      title: "รายละเอียดงาน",
      subtitle: "ดูงาน · สมัคร / รับงาน",
      jobId: segments[1],
      isValid: true,
    };
  }

  return {
    kind: "unknown",
    raw,
    routePath: path,
    title: "เส้นทางกำหนดเอง",
    subtitle: path,
    isValid: path.startsWith("/"),
    hint: path.startsWith("/")
      ? "ตรวจว่า route นี้มีในแอป AQOND จริง"
      : "ใช้ path ขึ้นต้นด้วย / เช่น /profile หรือ /talents/{id}",
  };
}

export function buildAdsDestinationPresets(userId?: string | null) {
  const uid = userId?.trim();
  return [
    { label: "โปรไฟล์ฉัน", path: "/profile", desc: "หน้าโปรไฟล์หลัก" },
    ...(uid
      ? [
          { label: "โปรไฟล์ Expert", path: `/talents/${uid}`, desc: "Book Now + รีวิว" },
          { label: "จองคิว", path: `/talents/${uid}/beauty-booking`, desc: "เลือกเวลา → จอง" },
        ]
      : []),
    { label: "Job Board", path: "/job-board", desc: "รายการงาน Advance" },
  ];
}
