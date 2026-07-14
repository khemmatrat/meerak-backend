import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";

export type ManageJobTabId = "applicants" | "chat" | "escrow" | "scope" | "review";

export function ManageJobHeader({
  effectiveTab,
  jobTitle,
  isTalent,
  loading,
  onRefresh,
  t,
}: {
  effectiveTab: ManageJobTabId;
  jobTitle: string;
  isTalent: boolean;
  loading: boolean;
  onRefresh: () => void;
  t: (k: string) => string;
}) {
  const tabTitleKey: Record<ManageJobTabId, string> = {
    applicants: "job_board.manage_advance.applicants_for",
    chat: "job_board.manage_advance.chat_for",
    escrow: "job_board.manage_advance.escrow_for",
    scope: "job_board.manage_advance.scope_for",
    review: "job_board.manage_advance.review_for",
  };

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Link
          to={isTalent ? "/job-board?tab=my-applications" : "/job-board?tab=my-jobs"}
          className="shrink-0 p-1 -ml-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
        >
          <ArrowLeft size={22} />
        </Link>
        <h1 className="text-lg sm:text-xl font-bold text-slate-50 truncate">
          ← {t(tabTitleKey[effectiveTab])} {jobTitle}
        </h1>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        className="p-2 rounded-lg bg-slate-700/50 text-slate-300 hover:bg-slate-600 disabled:opacity-50 shrink-0"
        title={t("job_board.refresh")}
      >
        <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
      </button>
    </div>
  );
}
