import React, { useEffect, useState } from "react";
import { Crown, ShieldAlert, ShieldCheck } from "lucide-react";
import type { AdminLiveEvent } from "../services/adminApi";

type Props = {
  lastAlert: AdminLiveEvent | null;
  soundReady: boolean;
  onUnlockSound: () => void;
  onOpenUser?: (userId: string) => void;
  onOpenKyc?: () => void;
};

function alertIcon(eventType: string) {
  if (eventType.startsWith("security_")) {
    return <ShieldAlert size={18} className="text-rose-600 shrink-0" />;
  }
  if (eventType.startsWith("kyc_")) {
    return <ShieldCheck size={18} className="text-indigo-600 shrink-0" />;
  }
  return <Crown size={18} className="text-amber-600 shrink-0" />;
}

/** แบนเนอร์แจ้งเตือน live (VIP / KYC / Security) + ปุ่มเปิดเสียง */
export const AdminLiveAlertBanner: React.FC<Props> = ({
  lastAlert,
  soundReady,
  onUnlockSound,
  onOpenUser,
  onOpenKyc,
}) => {
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    if (!lastAlert) return;
    setBanner(lastAlert.title);
    const t = setTimeout(() => setBanner(null), 8000);
    return () => clearTimeout(t);
  }, [lastAlert]);

  const isKyc = lastAlert?.event_type?.startsWith("kyc_");

  return (
    <>
      {!soundReady && (
        <button
          type="button"
          onClick={onUnlockSound}
          className="fixed bottom-20 right-4 z-50 flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-lg hover:bg-indigo-700 md:bottom-6"
        >
          🔊 เปิดเสียงแจ้งเตือน (VIP / KYC / Security)
        </button>
      )}

      {banner && (
        <div
          role="alert"
          className="fixed top-16 left-1/2 z-50 flex max-w-md -translate-x-1/2 items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-lg"
        >
          {alertIcon(lastAlert?.event_type || "")}
          <span className="font-medium">{banner}</span>
          {isKyc && onOpenKyc && (
            <button
              type="button"
              className="ml-1 text-xs text-indigo-700 underline"
              onClick={onOpenKyc}
            >
              เปิด KYC
            </button>
          )}
          {!isKyc && lastAlert?.user_id && onOpenUser && (
            <button
              type="button"
              className="ml-1 text-xs text-indigo-700 underline"
              onClick={() => onOpenUser(String(lastAlert.user_id))}
            >
              ดู user
            </button>
          )}
        </div>
      )}
    </>
  );
};
