import React, { useState } from "react";
import { Activity, FileWarning, X } from "lucide-react";
import { canAccessAdminView } from "../constants/adminRouteAccess";

interface MobileQuickActionsFabProps {
  setView: (view: string) => void;
  currentUserRole: string;
}

/** Floating actions — mobile only (parent hides with md:hidden) */
export const MobileQuickActionsFab: React.FC<MobileQuickActionsFabProps> = ({
  setView,
  currentUserRole,
}) => {
  const [open, setOpen] = useState(false);

  const go = (view: string) => {
    setView(view);
    setOpen(false);
  };

  const canGateway = canAccessAdminView("aqond-gateway-console", currentUserRole);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2 md:hidden">
      {open ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
          {canGateway ? (
            <button
              type="button"
              onClick={() => go("aqond-gateway-console")}
              className="flex min-h-[44px] min-w-[44px] items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:bg-indigo-50"
            >
              <Activity className="shrink-0 text-indigo-600" size={22} />
              Gateway Pulse
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => go("logs")}
            className="flex min-h-[44px] min-w-[44px] items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:bg-amber-50"
          >
            <FileWarning className="shrink-0 text-amber-600" size={22} />
            Error / System Logs
          </button>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-900/30 ring-2 ring-white transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2"
        aria-expanded={open}
        aria-label={open ? "ปิดเมนูลัด" : "เปิดเมนูลัด — Gateway Pulse และ Logs"}
      >
        {open ? <X size={26} /> : <Activity size={26} />}
      </button>
    </div>
  );
};
