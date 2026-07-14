import { useCallback, useEffect, useRef, useState } from "react";
import { getAdminLiveEvents, type AdminLiveEvent } from "../services/adminApi";
import {
  playAdminNotificationSound,
  unlockAdminNotificationSound,
} from "../utils/adminNotificationSound";

const POLL_MS = 12_000;
const ALERT_EVENT_TYPES = new Set([
  "vip_purchase_active",
  "vip_purchase_pending",
  "kyc_submitted",
  "kyc_supplement_submitted",
  "kyc_expiry_resubmit",
  "security_high_risk_user",
]);

export function useAdminLiveEvents(enabled: boolean) {
  const sinceRef = useRef<string>(new Date().toISOString());
  const seenIdsRef = useRef<Set<string>>(new Set());
  const [recentAlerts, setRecentAlerts] = useState<AdminLiveEvent[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [highRiskUnreadCount, setHighRiskUnreadCount] = useState(0);
  const [lastVipAlert, setLastVipAlert] = useState<AdminLiveEvent | null>(null);
  const [lastAlert, setLastAlert] = useState<AdminLiveEvent | null>(null);
  const [soundReady, setSoundReady] = useState(false);

  const unlockSound = useCallback(() => {
    unlockAdminNotificationSound();
    setSoundReady(true);
  }, []);

  const poll = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await getAdminLiveEvents(sinceRef.current);
      if (res.server_time) sinceRef.current = res.server_time;
      const fresh = (res.events || []).filter(
        (e) => !seenIdsRef.current.has(e.id),
      );
      if (fresh.length === 0) return;

      for (const e of fresh) {
        seenIdsRef.current.add(e.id);
        if (ALERT_EVENT_TYPES.has(e.event_type)) {
          playAdminNotificationSound();
          setLastAlert(e);
          if (e.event_type === "security_high_risk_user") {
            setHighRiskUnreadCount((c) => c + 1);
          }
          if (
            e.event_type === "vip_purchase_active" ||
            e.event_type === "vip_purchase_pending"
          ) {
            setLastVipAlert(e);
          }
        }
      }

      setRecentAlerts((prev) => [...fresh, ...prev].slice(0, 20));
      setUnreadCount((c) => c + fresh.length);
    } catch {
      /* silent — จะลองใหม่รอบถัดไป */
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void poll();
    const t = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(t);
  }, [enabled, poll]);

  const clearUnread = useCallback(() => {
    setUnreadCount(0);
    setHighRiskUnreadCount(0);
  }, []);

  return {
    recentAlerts,
    unreadCount,
    highRiskUnreadCount,
    lastVipAlert,
    lastAlert,
    soundReady,
    unlockSound,
    clearUnread,
    refresh: poll,
  };
}
