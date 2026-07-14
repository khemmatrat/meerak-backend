import React from "react";
import { CheckCircle } from "lucide-react";

const PIPELINE_STEPS = [
  { id: "posted", label: "โพสต์" },
  { id: "applicants", label: "มีผู้สนใจ" },
  { id: "hired", label: "จ้าง" },
  { id: "escrow", label: "เงินค้ำ" },
  { id: "submit", label: "ส่งงาน" },
  { id: "review", label: "ให้คะแนน" },
] as const;

export function JobPipelineStepper({
  applicantCount,
  hiredUserId,
  escrowStatus,
  workSubmissionStatus,
  isCompleted,
}: {
  applicantCount: number;
  hiredUserId?: string | null;
  escrowStatus: string;
  workSubmissionStatus: string;
  isCompleted: boolean;
}) {
  const currentIdx = isCompleted
    ? 5
    : workSubmissionStatus === "submitted" ||
        workSubmissionStatus === "revision_requested"
      ? 4
      : escrowStatus === "held" || escrowStatus === "released"
        ? 3
        : hiredUserId
          ? 2
          : applicantCount > 0
            ? 1
            : 0;

  return (
    <div className="luxury-card rounded-2xl p-4">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
        ขั้นตอนงาน
      </p>
      <div className="jb-pipeline-stepper">
        {PIPELINE_STEPS.map((step, i) => (
          <div
            key={step.id}
            className={`jb-pipeline-step ${i < currentIdx ? "done" : ""} ${i === currentIdx ? "current" : ""}`}
          >
            <div className="jb-pipeline-dot">
              {i < currentIdx ? <CheckCircle size={12} /> : i + 1}
            </div>
            <span className="jb-pipeline-label">{step.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
