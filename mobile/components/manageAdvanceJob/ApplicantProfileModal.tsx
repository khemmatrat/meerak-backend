import React from "react";
import { X, User, Star } from "lucide-react";
import type { AdvanceApplicantWithUser } from "../../types/api";

export function ApplicantProfileModal({
  applicant,
  profileData,
  t,
  onClose,
}: {
  applicant: AdvanceApplicantWithUser;
  profileData: { avatar_url?: string; bio?: string } | null;
  t: (key: string) => string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-charcoal-800 rounded-2xl border border-slate-600 shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-charcoal-800/95 backdrop-blur border-b border-slate-600 flex justify-between items-center p-4">
          <h3 className="text-lg font-bold text-slate-100">
            {t("job_board.manage_advance.view_profile")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-slate-200"
            aria-label="Close"
          >
            <X size={24} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="w-24 h-24 rounded-full bg-slate-700 flex items-center justify-center overflow-hidden shrink-0">
              {profileData?.avatar_url ? (
                <img
                  src={profileData.avatar_url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <User size={40} className="text-slate-500" />
              )}
            </div>
            <div className="text-center sm:text-left">
              <h4 className="text-xl font-bold text-slate-100">
                {applicant.full_name || applicant.user_id}
              </h4>
              {typeof applicant.rating === "number" && applicant.rating > 0 && (
                <div className="flex items-center justify-center sm:justify-start gap-1 mt-1">
                  <Star size={18} className="text-amber-400 fill-amber-400" />
                  <span className="text-slate-200 font-medium">
                    {applicant.rating.toFixed(1)}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div>
            <h5 className="text-sm font-medium text-slate-400 mb-1">
              {t("job_board.manage_advance.profile_modal_bio")}
            </h5>
            <p className="text-slate-200 text-sm whitespace-pre-wrap">
              {profileData?.bio || t("job_board.manage_advance.profile_modal_no_bio")}
            </p>
          </div>
          {applicant.skills && applicant.skills.length > 0 && (
            <div>
              <h5 className="text-sm font-medium text-slate-400 mb-2">
                {t("job_board.manage_advance.profile_modal_skills")}
              </h5>
              <div className="flex flex-wrap gap-2">
                {applicant.skills.map((s, i) => (
                  <span
                    key={i}
                    className="px-3 py-1 rounded-lg bg-slate-700/80 text-slate-300 text-sm"
                  >
                    {s.name || s.category || "—"}
                  </span>
                ))}
              </div>
            </div>
          )}
          {(applicant.phone || applicant.email) && (
            <p className="text-sm text-slate-500">
              {[applicant.phone, applicant.email].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
