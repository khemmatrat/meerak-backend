import React from "react";
import { ShieldAlert, LayoutDashboard } from "lucide-react";

interface AccessDeniedViewProps {
  viewId: string;
  role: string;
  onGoDashboard: () => void;
}

export const AccessDeniedView: React.FC<AccessDeniedViewProps> = ({
  viewId,
  role,
  onGoDashboard,
}) => {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-2xl border border-amber-200 bg-amber-50/90 p-8 text-center shadow-sm">
      <ShieldAlert className="mb-4 h-14 w-14 text-amber-600" aria-hidden />
      <h2 className="text-xl font-bold text-slate-900">ไม่มีสิทธิ์เข้าหน้านี้</h2>
      <p className="mt-2 max-w-md text-sm text-slate-600">
        บทบาท <span className="font-mono font-semibold">{role.replace(/_/g, " ")}</span> ไม่ได้รับอนุญาตให้เปิด{" "}
        <span className="font-mono text-slate-800">{viewId}</span> การดำเนินการทางการเงินยังถูกตรวจที่ API ฝั่งเซิร์ฟเวอร์เสมอ
      </p>
      <button
        type="button"
        onClick={onGoDashboard}
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow hover:bg-indigo-700"
      >
        <LayoutDashboard size={18} />
        กลับแดชบอร์ด
      </button>
    </div>
  );
};
