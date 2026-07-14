import React from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { ChevronRight, X } from "lucide-react";
import type { JobBoardActionItem } from "../utils/jobBoardActionItems";

export function JobBoardActionSheet({
  open,
  onClose,
  title,
  items,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  items: JobBoardActionItem[];
}) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div className="jb-bottom-sheet-backdrop" onClick={onClose} aria-hidden />
      <div
        className="jb-bottom-sheet jb-bottom-sheet--nav-safe"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="jb-bottom-sheet-handle" />
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100"
            aria-label="ปิด"
          >
            <X size={20} className="text-slate-500" />
          </button>
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">ไม่มีรายการที่ต้องดำเนินการ</p>
        ) : (
          <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
            {items.slice(0, 12).map((item) => (
              <li key={`${item.jobId}-${item.actionLabel}`}>
                <Link
                  to={item.href}
                  onClick={onClose}
                  className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{item.title}</p>
                    <p className="text-xs text-red-600 font-medium mt-0.5">{item.actionLabel}</p>
                  </div>
                  <ChevronRight size={18} className="text-slate-400 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>,
    document.body,
  );
}
