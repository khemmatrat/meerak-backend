import React from "react";
import { Link } from "react-router-dom";
import { Lock, ChevronLeft } from "lucide-react";
import { useGrandOpeningCountdown } from "../../shared/useGrandOpeningCountdown";

/** Full-screen block for Book Ride / Take Job flows before Grand Opening. */
export const PreLaunchServiceBlock: React.FC<{ title?: string }> = ({
  title = "บริการนี้",
}) => {
  const { isLive } = useGrandOpeningCountdown();
  if (isLive) return null;

  return (
    <div className="fixed inset-0 z-[240] flex flex-col items-center justify-center bg-slate-950/96 px-6 text-center backdrop-blur-md">
      <Lock className="w-14 h-14 text-amber-400 mb-4" strokeWidth={1.5} />
      <h2 className="text-xl font-bold text-white mb-2">{title}</h2>
      <p className="text-slate-300 text-sm max-w-xs leading-relaxed mb-6">
        เริ่มให้บริการในวันที่ 4 พฤษภาคมนี้
      </p>
      <p className="text-slate-500 text-xs mb-8">
        คุณสามารถสมัครสมาชิกและยืนยันตัวตน (KYC) ล่วงหน้าได้จากหน้าโปรไฟล์
      </p>
      <Link
        to="/"
        className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white hover:bg-emerald-500 transition-colors"
      >
        <ChevronLeft size={18} />
        กลับหน้าแรก
      </Link>
    </div>
  );
};
