/**
 * Universal / in-app links → /register with referral code.
 *
 * Supports:
 * - aqond://ref/<CODE>
 * - https://<associated-domain>/ref/<CODE> (Universal Links / Android App Links)
 * - query params ?ref= / ?referral=
 */
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";

function extractReferralCode(rawUrl: string): string | null {
  if (!rawUrl) return null;
  try {
    const normalized = rawUrl.replace(
      /^aqond:\/\//i,
      "https://app.aqond.local/",
    );
    const u = new URL(normalized);
    const pathMatch = u.pathname.match(/^\/ref\/([A-Za-z0-9]+)$/);
    const fromPath = pathMatch?.[1]?.trim() || "";
    const fromSearch = (
      u.searchParams.get("ref") ||
      u.searchParams.get("referral") ||
      ""
    ).trim();
    const code = (fromPath || fromSearch).trim().toUpperCase();
    return code ? code : null;
  } catch {
    return null;
  }
}

export function ReferralDeepLinkBridge() {
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window === "undefined" || !Capacitor.isNativePlatform()) return;

    const handlers: Array<{ remove: () => Promise<void> }> = [];
    let cancelled = false;

    (async () => {
      try {
        const { App: CapApp } = await import("@capacitor/app");
        const h1 = await CapApp.addListener("appUrlOpen", ({ url }) => {
          if (cancelled || !url) return;
          const code = extractReferralCode(url);
          if (!code) return;
          try {
            localStorage.setItem("referral_code", code);
          } catch {
            /* ignore */
          }
          navigate(`/register?ref=${encodeURIComponent(code)}`);
        });
        handlers.push(h1);
      } catch (e) {
        console.warn("[ReferralDeepLinkBridge]", e);
      }
    })();

    return () => {
      cancelled = true;
      handlers.forEach((h) => h.remove().catch(() => {}));
    };
  }, [navigate]);

  return null;
}
