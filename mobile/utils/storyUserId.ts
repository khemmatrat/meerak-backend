/** UUID ของผู้ใช้จาก JWT (sub) — ตรงกับ backend viewer_id */
export function jwtSubUserId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const token = localStorage.getItem("meerak_token");
    if (!token || token.startsWith("mock_")) return null;
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as { sub?: string };
    const sub = payload.sub ? String(payload.sub).trim() : "";
    return /^[0-9a-f-]{36}$/i.test(sub) ? sub : sub || null;
  } catch {
    return null;
  }
}

/** ลำดับความสำคัญ: tray viewer_id → JWT sub → profile id */
export function resolveStoryViewerUserId(
  viewerIdFromTray: string | null | undefined,
  profileUserId: string | null | undefined,
): string {
  const tray = viewerIdFromTray ? String(viewerIdFromTray).trim() : "";
  if (tray) return tray;
  const sub = jwtSubUserId();
  if (sub) return sub;
  return profileUserId ? String(profileUserId).trim() : "";
}
