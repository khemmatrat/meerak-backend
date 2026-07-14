/**
 * Universal / in-app links → /kyc (SMS, LINE, FCM tap, aqond://kyc)
 */
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";

export function KycDeepLinkBridge() {
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
          const lower = url.toLowerCase();
          if (!lower.includes("kyc") && !lower.includes("reason=")) return;
          try {
            const u = new URL(url.replace(/^aqond:\/\//i, "https://app.aqond.local/"));
            const reason = u.searchParams.get("reason") || "resubmit";
            navigate(`/kyc?reason=${encodeURIComponent(reason)}`);
          } catch {
            navigate("/kyc?reason=resubmit");
          }
        });
        handlers.push(h1);

        const { PushNotifications } = await import("@capacitor/push-notifications");
        const h2 = await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
          if (cancelled) return;
          const data = action.notification?.data as Record<string, string> | undefined;
          if (!data) return;
          if (data.notification_type !== "kyc_status" && !data.kyc_status) return;
          const r = data.kyc_status || data.reason || "resubmit";
          navigate(`/kyc?reason=${encodeURIComponent(String(r))}`);
        });
        handlers.push(h2);
      } catch (e) {
        console.warn("[KycDeepLinkBridge]", e);
      }
    })();

    return () => {
      cancelled = true;
      handlers.forEach((h) => h.remove().catch(() => {}));
    };
  }, [navigate]);

  return null;
}
