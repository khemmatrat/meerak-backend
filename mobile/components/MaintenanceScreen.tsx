import React from "react";
import { Wrench } from "lucide-react";

type Props = {
  message?: string;
};

/**
 * เต็มจอ — แสดงเมื่อ backend ตั้ง maintenanceMode (GET /api/app/config)
 */
export const MaintenanceScreen: React.FC<Props> = ({ message }) => {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-950 px-6 text-center text-slate-100">
      <Wrench className="mb-4 h-14 w-14 text-amber-400" strokeWidth={1.5} />
      <h1 className="text-xl font-bold text-white sm:text-2xl">ปิดปรับปรุงระบบชั่วคราว</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-400">
        {message?.trim() ||
          "เรากำลังปรับปรุงบริการให้ดียิ่งขึ้น กรุณาลองใหม่ภายหลัง ขออภัยในความไม่สะดวก"}
      </p>
    </div>
  );
};
