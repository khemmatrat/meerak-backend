import React from "react";
import { Plus, Recycle, Settings } from "lucide-react";

export interface PostSharingInfoModalProps {
  open: boolean;
  onClose: () => void;
  onManageSettings: () => void;
}

export const PostSharingInfoModal: React.FC<PostSharingInfoModalProps> = ({
  open,
  onClose,
  onManageSettings,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sharing-info-title"
    >
      <div className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl text-slate-900 shadow-2xl animate-in slide-in-from-bottom duration-200">
        <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mt-3 sm:hidden" />
        <div className="p-6 space-y-5 max-h-[85vh] overflow-y-auto">
          <h2 id="sharing-info-title" className="text-lg font-bold text-center">
            การแชร์โพสต์
          </h2>

          <ul className="space-y-4 text-sm text-slate-700">
            <li className="flex gap-3">
              <span className="shrink-0 w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
                <Plus size={18} />
              </span>
              <span>บัญชีสาธารณะ — ผู้อื่นสามารถค้นพบโพสต์และติดตามคุณได้</span>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
                <Recycle size={18} />
              </span>
              <span>
                ผู้อื่นอาจนำส่วนของโพสต์ไปใช้ซ้ำผ่านรีมิกซ์ เทมเพลต
                หรือสติกเกอร์ (ตามการตั้งค่าของคุณ)
              </span>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
                <Settings size={18} />
              </span>
              <span>
                ปิดการนำไปใช้ซ้ำหรือดาวน์โหลดได้ทีละโพสต์
                หรือเปลี่ยนค่าเริ่มต้นในการตั้งค่า
              </span>
            </li>
          </ul>

          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-blue-500 text-white font-semibold"
          >
            ตกลง
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onManageSettings();
            }}
            className="w-full text-center text-blue-600 font-medium text-sm"
          >
            จัดการการตั้งค่า
          </button>
        </div>
      </div>
    </div>
  );
};
