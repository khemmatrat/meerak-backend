/**
 * ลงทะเบียน FCM token ของแอปมือถือ (Capacitor) — ใช้รับประกาศจากแอดมิน (ช่อง aqond_app_news)
 */
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { api } from "./api";

let registrationStarted = false;

async function postTokenToBackend(token: string, userId?: string) {
  await api.post(
    "/notifications/register",
    {
      token,
      source: "mobile",
      userId: userId || undefined,
    },
    { timeout: 10000 },
  );
  const v2Base = (import.meta as any).env?.VITE_NOTIFY_V2_URL as string | undefined;
  if (v2Base && userId) {
    const base = String(v2Base).replace(/\/$/, "");
    await fetch(`${base}/v1/push/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": userId,
      },
      body: JSON.stringify({
        user_id: userId,
        fcm_token: token,
        platform: "android",
      }),
    }).catch(() => {});
  }
}

/**
 * เรียกเมื่อผู้ใช้ล็อกอินแล้ว — idempotent ต่อ session
 */
export async function registerMobileFcmPush(userId?: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (registrationStarted) return;
  registrationStarted = true;

  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive !== "granted") {
      perm = await PushNotifications.requestPermissions();
      if (perm.receive !== "granted") {
        registrationStarted = false;
        return;
      }
    }

    await PushNotifications.addListener("registration", async (ev) => {
      const token = ev.value?.trim();
      if (!token) return;
      try {
        await postTokenToBackend(token, userId);
      } catch (e) {
        console.warn("[FCM] register token failed:", (e as Error)?.message);
      }
    });

    await PushNotifications.addListener("registrationError", (err) => {
      console.warn("[FCM] registrationError:", err);
      registrationStarted = false;
    });

    await PushNotifications.register();
  } catch (e) {
    registrationStarted = false;
    console.warn("[FCM] setup failed:", (e as Error)?.message);
  }
}
