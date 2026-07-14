import React from "react";
import { CheckCircle, Loader2, User } from "lucide-react";
import type { ConnectionItem as ConnectionItemType } from "../../services/connectionService";

const GRADUATE_JOBS = 15;

const statusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: "รอยืนยัน", className: "bg-amber-100 text-amber-800 border-amber-200" },
  active: { label: "กำลังฝึกงาน", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  graduated: { label: "จบหลักสูตร", className: "bg-blue-100 text-blue-800 border-blue-200" },
  disqualified: { label: "สิ้นสุด", className: "bg-slate-100 text-slate-600 border-slate-200" },
  ended: { label: "สิ้นสุด", className: "bg-slate-100 text-slate-600 border-slate-200" },
};

interface ConnectionItemProps {
  item: ConnectionItemType;
  mode: "coach" | "trainee";
  onConfirm?: (id: string, asTrainee: boolean) => void;
  confirmingId?: string | null;
}

export const ConnectionItem: React.FC<ConnectionItemProps> = ({
  item,
  mode,
  onConfirm,
  confirmingId,
}) => {
  const name = mode === "coach" ? item.trainee_name : item.coach_name;
  const config = statusConfig[item.status] || statusConfig.pending;
  const needsConfirm = item.needs_confirm && onConfirm;
  const isConfirming = confirmingId === item.id;

  const completed = item.trainee_completed_jobs ?? 0;
  const showProgress = mode === "coach" && item.status === "active" && completed >= 0;
  const progressPct = Math.min(100, (completed / GRADUATE_JOBS) * 100);

  return (
    <div className="flex items-center justify-between gap-3 p-4 bg-white border border-slate-200 rounded-xl hover:bg-slate-50/50 transition-colors">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
          <User size={20} className="text-slate-500" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-800 truncate">{name || "—"}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium border ${config.className}`}
            >
              {config.label}
            </span>
            {item.connected_at && (
              <span className="text-xs text-slate-500">
                เชื่อมต่อ {new Date(item.connected_at).toLocaleDateString("th-TH")}
              </span>
            )}
          </div>
          {showProgress && (
            <div className="mt-2">
              <div className="flex justify-between text-xs text-slate-500 mb-0.5">
                <span>ความคืบหน้า {completed}/15 งาน</span>
                <span>{Math.round(progressPct)}%</span>
              </div>
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
      {needsConfirm && (
        <button
          onClick={() => onConfirm(item.id, mode === "trainee")}
          disabled={isConfirming}
          className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-sm transition-colors disabled:opacity-70"
        >
          {isConfirming ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <CheckCircle size={18} />
          )}
          ยืนยันการเชื่อมต่อ
        </button>
      )}
    </div>
  );
};
