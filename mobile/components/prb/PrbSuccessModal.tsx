import React from "react";
import { CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { prbCta } from "./prbTheme";

export function PrbSuccessModal({
  quoteNumber,
  orderId,
  onClose,
}: {
  quoteNumber: string;
  orderId: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
        <CheckCircle className="mx-auto mb-3 h-14 w-14 text-emerald-500" />
        <h2 className="text-lg font-bold text-blue-950">
          รับคำสั่งเรียบร้อยแล้ว
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          เลขที่คำสั่ง: <strong>{quoteNumber}</strong>
        </p>
        <p className="mt-1 text-sm text-slate-500">
          กำลังดำเนินการเอกสาร ภายใน 1–3 วันจัดส่งถึงบ้าน
        </p>
        <button
          type="button"
          className={`${prbCta} mt-4`}
          onClick={() => navigate(`/prb/track/${orderId}`)}
        >
          ดูสถานะคำสั่ง
        </button>
        <button
          type="button"
          className="mt-2 w-full text-sm text-slate-500"
          onClick={onClose}
        >
          กลับหน้าหลัก
        </button>
      </div>
    </div>
  );
}
