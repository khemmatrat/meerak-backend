import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";

export function PrbDeepLinkBridge() {
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
          if (!lower.includes("prb")) return;
          const m = url.match(/prb\/track\/([a-f0-9-]+)/i);
          if (m?.[1]) navigate(`/prb/track/${m[1]}`);
          else navigate("/prb");
        });
        handlers.push(h1);

        const { PushNotifications } =
          await import("@capacitor/push-notifications");
        const h2 = await PushNotifications.addListener(
          "pushNotificationActionPerformed",
          (action) => {
            if (cancelled) return;
            const data = action.notification?.data as
              | Record<string, string>
              | undefined;
            if (!data || data.notification_type?.startsWith("prb") !== true)
              return;
            const oid = data.order_id;
            if (oid) navigate(`/prb/track/${oid}`);
            else navigate("/prb");
          },
        );
        handlers.push(h2);
      } catch (e) {
        console.warn("[PrbDeepLinkBridge]", e);
      }
    })();

    return () => {
      cancelled = true;
      handlers.forEach((h) => h.remove().catch(() => {}));
    };
  }, [navigate]);

  return null;
}
