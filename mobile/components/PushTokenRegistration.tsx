import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getBackendBase } from "../services/api";
import {
  playNotificationSound,
  unlockNotificationSound,
} from "../services/notificationSound";
import { resolvePushNotificationPath } from "../utils/advanceJobPushNavigation";

/**
 * บน Android/iOS (Capacitor) ลงทะเบียน FCM token ไปที่ POST /api/notifications/register
 * เพื่อให้ Testing Center / sendFcmMulticast หา user_id ได้
 */
export function PushTokenRegistration() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const lastSentRef = useRef<string | null>(null);

  const navigateFromPushData = (data?: Record<string, unknown>) => {
    const path = resolvePushNotificationPath(data);
    if (path) navigate(path);
  };

  useEffect(() => {
    if (!user?.id) {
      lastSentRef.current = null;
      return;
    }
    if (!Capacitor.isNativePlatform()) return;

    let cancelled = false;
    const handlers: Array<{ remove: () => Promise<void> }> = [];

    (async () => {
      try {
        const perm = await PushNotifications.requestPermissions();
        if (cancelled || perm.receive !== "granted") return;

        const regHandle = await PushNotifications.addListener(
          "registration",
          async (ev) => {
            if (cancelled || !ev.value) return;
            const key = `${user.id}:${ev.value}`;
            if (lastSentRef.current === key) return;
            const base = getBackendBase().replace(/\/$/, "");
            const res = await fetch(`${base}/api/notifications/register`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                token: ev.value,
                source: "mobile",
                userId: user.id,
              }),
            });
            if (res.ok) {
              lastSentRef.current = key;
              console.log("[FCM] Registered token for user", user.id);
            } else {
              console.warn("[FCM] register failed", await res.text());
            }
          },
        );
        handlers.push(regHandle);

        const errHandle = await PushNotifications.addListener(
          "registrationError",
          (err) => console.warn("[FCM] registrationError", err),
        );
        handlers.push(errHandle);

        const fgHandle = await PushNotifications.addListener(
          "pushNotificationReceived",
          (notification) => {
            console.log("[FCM] Foreground push:", notification.title);
            unlockNotificationSound();
            playNotificationSound();
          },
        );
        handlers.push(fgHandle);

        const actionHandle = await PushNotifications.addListener(
          "pushNotificationActionPerformed",
          (action) => {
            const data = (action.notification?.data || {}) as Record<string, unknown>;
            navigateFromPushData(data);
          },
        );
        handlers.push(actionHandle);

        await PushNotifications.register();
      } catch (e) {
        console.warn("[FCM] Push setup failed", e);
      }
    })();

    return () => {
      cancelled = true;
      handlers.forEach((h) => {
        h.remove().catch(() => {});
      });
    };
  }, [user?.id, navigate]);

  return null;
}
