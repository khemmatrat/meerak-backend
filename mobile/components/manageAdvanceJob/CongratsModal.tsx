import React from "react";
import { PartyPopper } from "lucide-react";

export function CongratsModal({
  isEmployer,
  hasMyReview,
  onClose,
  onGoReview,
}: {
  isEmployer: boolean;
  hasMyReview: boolean;
  onClose: () => void;
  onGoReview: () => void;
}) {
  const handleDismiss = () => {
    onClose();
    if (isEmployer && !hasMyReview) onGoReview();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={handleDismiss}
    >
      <div
        className="rounded-2xl border border-blue-200 bg-white shadow-2xl max-w-sm w-full p-8 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <PartyPopper size={48} className="mx-auto text-blue-500 mb-4" />
        <h3 className="text-xl font-bold text-slate-900 mb-2">โปรเจกต์สำเร็จ!</h3>
        <p className="text-slate-600 text-sm mb-6">
          งานเสร็จสมบูรณ์ เงินปล่อยให้ผู้รับจ้างครบแล้ว
        </p>
        <button
          type="button"
          onClick={handleDismiss}
          className="px-6 py-3 rounded-xl bg-blue-600 text-white font-bold shadow-md hover:bg-blue-500"
        >
          {isEmployer && !hasMyReview ? "ให้คะแนนผู้รับงาน" : "ยินดีด้วย"}
        </button>
      </div>
    </div>
  );
}
