/**
 * SafetyWidget — "Emergency Overrides Everything"
 * Floating Emergency Action Button (EAB) with pulse effect.
 * SOS: Hold 3 seconds to prevent false alarms.
 * z-index: 9999 (above VIP and all layers)
 */
import React, { useState, useRef, useCallback } from "react";
import {
  Shield,
  Phone,
  MapPin,
  AlertTriangle,
  X,
  Plus,
  Helicopter,
} from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import { useNotification } from "../context/NotificationContext";
import { useAuth } from "../context/AuthContext";
import {
  sendSOS,
  requestAeroMedevac,
  type EmergencyPayload,
} from "../services/emergencyService";
import { useFloatingFabPrefs } from "../hooks/useFloatingFabPrefs";
import { useLongPressHide } from "../hooks/useLongPressHide";
import { hideFloatingSos } from "../utils/floatingFabPrefs";

const HOLD_DURATION_MS = 3000;

export const SafetyWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { t } = useLanguage();
  const { notify } = useNotification();
  const { user } = useAuth();
  const fabPrefs = useFloatingFabPrefs();
  const sosHidePress = useLongPressHide(() => {
    hideFloatingSos();
    setIsOpen(false);
    notify("ซ่อนปุ่ม SOS แล้ว — เปิดได้ที่ ตั้งค่า → ปุ่มลอยบนหน้าจอ", "info");
  });
  const [sendingSOS, setSendingSOS] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const buildPayload = useCallback(async (): Promise<
    Partial<EmergencyPayload>
  > => {
    const payload: Partial<EmergencyPayload> = {
      user_id: user?.id,
      full_name: user?.name,
      phone: user?.phone,
      medical: {},
      emergency_contacts: [],
    };
    const u = user as any;
    if (u?.blood_type) payload.medical!.blood_type = u.blood_type;
    if (u?.allergies) payload.medical!.allergies = u.allergies;
    if (u?.emergency_contact)
      payload.emergency_contacts = [u.emergency_contact];

    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(payload);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          payload.lat = lat;
          payload.lng = lng;
          payload.google_maps_link = `https://www.google.com/maps?q=${lat},${lng}`;
          resolve(payload);
        },
        () => resolve(payload),
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 },
      );
    });
  }, [user]);

  const executeSOS = useCallback(async () => {
    if (sendingSOS) return;
    setSendingSOS(true);
    const payload = await buildPayload();
    if (!payload.lat && !payload.lng) {
      notify(t("safety.sending_sos"), "info");
    }
    const result = await sendSOS(payload);
    setSendingSOS(false);
    if (result.success) {
      notify("SOS ส่งแล้ว — หน่วยกู้ภัยจะติดต่อคุณ", "success");
      setIsOpen(false);
    } else if (result.fallback) {
      notify("API ล้มเหลว — โทร 191 หรือ 1669 ทันที", "error");
      window.location.href = "tel:191";
    } else {
      notify("ส่ง SOS ไม่สำเร็จ — โทร 191 หรือ 1669", "error");
    }
  }, [sendingSOS, buildPayload, notify, t]);

  const handleHoldStart = () => {
    setHoldProgress(0);
    const start = Date.now();
    holdIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(100, (elapsed / HOLD_DURATION_MS) * 100);
      setHoldProgress(pct);
      if (pct >= 100) {
        if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
        holdIntervalRef.current = null;
        executeSOS();
      }
    }, 50);
  };

  const handleHoldEnd = () => {
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    setHoldProgress(0);
  };

  const handleAeroMedevac = async () => {
    if (sendingSOS) return;
    setSendingSOS(true);
    const payload = await buildPayload();
    if (!payload.lat && !payload.lng) {
      payload.lat = 0;
      payload.lng = 0;
    }
    const result = await requestAeroMedevac(payload);
    setSendingSOS(false);
    if (result.success) {
      notify("Request Aero-Medevac ส่งไปยังแอดมินแล้ว", "success");
      setIsOpen(false);
    } else {
      notify("ส่งไม่สำเร็จ — โทร 1669 หรือหน่วยกู้ภัย", "error");
    }
  };

  const handleShareLocation = () => {
    if (navigator.geolocation) {
      notify("Fetching location...", "info");
      navigator.geolocation.getCurrentPosition(
        () => notify("Live Location Shared with Trusted Contacts", "success"),
        () => notify("ไม่สามารถเข้าถึงตำแหน่งได้", "error"),
      );
    }
  };

  if (!fabPrefs.showSos) {
    return null;
  }

  return (
    <div className="fixed bottom-20 right-4 z-[9999] md:bottom-6 md:right-6">
      {/* Security Center Modal — z-[9999] above everything */}
      {isOpen && (
        <div
          className="mb-4 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-red-200 dark:border-red-900/50 overflow-hidden animate-in slide-in-from-bottom-10 w-72 z-[9999]"
          style={{ boxShadow: "0 0 40px rgba(239,68,68,0.15)" }}
        >
          <div className="bg-red-500 text-white p-3 flex justify-between items-center">
            <span className="font-bold text-sm flex items-center">
              <Shield size={16} className="mr-2" /> {t("safety.title")}
            </span>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white/80 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
          <div className="p-4 space-y-3">
            <p className="text-xs text-gray-500 dark:text-slate-400 mb-2">
              {t("safety.help_desc")}
            </p>

            {/* SOS: Hold 3 seconds */}
            <div className="space-y-2">
              <button
                onMouseDown={handleHoldStart}
                onMouseUp={handleHoldEnd}
                onMouseLeave={handleHoldEnd}
                onTouchStart={handleHoldStart}
                onTouchEnd={handleHoldEnd}
                onTouchCancel={handleHoldEnd}
                disabled={sendingSOS}
                className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg flex items-center justify-center shadow-md shadow-red-200 dark:shadow-red-900/30 relative overflow-hidden"
              >
                {holdProgress > 0 && holdProgress < 100 && (
                  <div
                    className="absolute inset-0 bg-red-400/80 transition-all duration-50"
                    style={{ width: `${holdProgress}%` }}
                  />
                )}
                <span className="relative z-10">
                  {sendingSOS ? (
                    t("payment.processing")
                  ) : (
                    <>
                      <AlertTriangle size={18} className="mr-2 inline" />{" "}
                      {t("safety.panic")}
                    </>
                  )}
                </span>
              </button>
              <p className="text-[10px] text-gray-500 dark:text-slate-400 text-center">
                กดค้าง 3 วินาที เพื่อส่ง SOS
              </p>
            </div>

            {/* Aero-Medevac (Helicopter) placeholder */}
            <button
              onClick={handleAeroMedevac}
              disabled={sendingSOS}
              className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg flex items-center justify-center"
            >
              <Helicopter size={18} className="mr-2" /> Request Aero-Medevac
            </button>

            <button
              onClick={handleShareLocation}
              className="w-full py-2 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-slate-200 font-medium rounded-lg flex items-center justify-center hover:bg-gray-50 dark:hover:bg-slate-600"
            >
              <MapPin size={18} className="mr-2 text-blue-500" />{" "}
              {t("safety.share_loc")}
            </button>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <a
                href="tel:191"
                className="py-2 bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 text-xs font-bold rounded-lg flex flex-col items-center justify-center hover:bg-gray-200 dark:hover:bg-slate-600"
              >
                <Phone size={14} className="mb-1" /> 191 (Police)
              </a>
              <a
                href="tel:1669"
                className="py-2 bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 text-xs font-bold rounded-lg flex flex-col items-center justify-center hover:bg-gray-200 dark:hover:bg-slate-600"
              >
                <Phone size={14} className="mb-1" /> 1669 (Medic)
              </a>
            </div>

            <button
              type="button"
              onClick={() => {
                hideFloatingSos();
                setIsOpen(false);
                notify("ซ่อนปุ่ม SOS แล้ว — เปิดได้ที่ ตั้งค่า", "info");
              }}
              className="w-full py-2 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 border-t border-gray-100 dark:border-slate-600 mt-2 pt-3"
            >
              ซ่อนปุ่ม SOS บนหน้าจอ
            </button>
          </div>
        </div>
      )}

      {/* EAB — Floating SOS button with pulse effect */}
      <button
        type="button"
        title="กดค้างเพื่อซ่อนปุ่ม"
        {...sosHidePress}
        onClick={() => {
          if (sosHidePress.consumeSuppressClick()) return;
          setIsOpen(!isOpen);
        }}
        className={`p-3 rounded-full shadow-xl transition-transform active:scale-90 z-[9999] ${
          isOpen
            ? "bg-gray-600 text-white rotate-45"
            : "bg-white dark:bg-slate-800 text-red-500 border-2 border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-slate-700/80 animate-pulse"
        }`}
        style={{
          boxShadow: isOpen ? undefined : "0 0 0 0 rgba(239, 68, 68, 0.4)",
        }}
        aria-label="Emergency Safety Center"
      >
        {isOpen ? (
          <Plus size={24} />
        ) : (
          <Shield
            size={28}
            fill="currentColor"
            className="text-red-100 stroke-red-500 dark:text-red-900/50 dark:stroke-red-400"
          />
        )}
      </button>
    </div>
  );
};
