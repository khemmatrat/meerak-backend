import { invalidateProfileCache } from "./mockApi";

/**
 * เมื่อได้รับ push เกี่ยวกับ Brand Adviser (เช่น เตือนก่อนพักสิทธิ์) ให้ล้างแคชโปรไฟล์
 * เพื่อให้แบนเนอร์ BA บน Profile/Settings ตรงกับเซิร์ฟเวอร์หลังกลับมาเปิดแอป
 */
export function registerBrandAdviserPushProfileRefresh(): void {
  if (typeof window === "undefined") return;

  import("firebase/messaging")
    .then(({ getMessaging, onMessage }) =>
      import("firebase/app").then(({ getApps }) => {
        const apps = getApps();
        if (!apps.length) return;
        const messaging = getMessaging(apps[0]);
        onMessage(messaging, (payload: { notification?: { title?: string }; data?: Record<string, string> }) => {
          const title = (payload.notification?.title || "").toLowerCase();
          const data = payload.data || {};
          const t = String(data.type || data.event || "").toLowerCase();
          const looksBa =
            t.includes("brand_adviser") ||
            t.includes("ba_warn") ||
            t.includes("adviser_suspend") ||
            title.includes("brand adviser") ||
            (title.includes("adviser") && title.includes("brand"));
          if (looksBa) invalidateProfileCache();
        });
      })
    )
    .catch(() => {
      /* firebase/messaging ไม่พร้อมในบิลด์นี้ — ข้าม */
    });
}
