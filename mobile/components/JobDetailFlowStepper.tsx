import React, { useEffect, useMemo, useState } from "react";
import { Check, Timer } from "lucide-react";
import { getJobFlowState } from "../utils/jobFlowStep";
import { getProviderStepIcons } from "../utils/jobCategoryFlowIcons";

export type FlowRole = "provider" | "employer";

export interface JobDetailFlowStepperProps {
  role: FlowRole;
  jobStatus: string;
  /** in_progress + arrived_at */
  hasArrived: boolean;
  /** both proof images uploaded */
  hasProof: boolean;
  /** employer: job waiting employer approval */
  waitingApproval?: boolean;
  /** หมวดงาน — ใช้เลือกไอคอนขั้นตอน */
  category?: string;
  /** เวลานัด — นับถอยหลัง (ฝั่งผู้รับงานก่อนถึงหน้างาน) */
  appointmentAt?: string | Date | null;
  className?: string;
}

function formatCountdownTh(ms: number): string {
  if (ms <= 0) return "เลยเวลานัดแล้ว";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h >= 48) {
    const d = Math.floor(h / 24);
    return `เหลืออีกประมาณ ${d} วัน`;
  }
  if (h > 0) return `เหลือ ${h} ชม. ${m} นาที`;
  if (m > 0) return `เหลือ ${m} นาที ${sec} วินาที`;
  return `เหลือ ${sec} วินาที`;
}

/**
 * แนว Grab / Lineman: แถบขั้นตอนชัด + ไอคอนตามหมวด + นับถอยหลังถึงเวลานัด (ผู้รับงาน)
 */
const JobDetailFlowStepper: React.FC<JobDetailFlowStepperProps> = ({
  role,
  jobStatus,
  hasArrived,
  hasProof,
  waitingApproval,
  category,
  appointmentAt,
  className = "",
}) => {
  const [now, setNow] = useState(() => Date.now());

  const flow = getJobFlowState({
    role,
    jobStatus,
    hasArrived,
    hasProof,
    waitingApproval,
  });

  const steps =
    role === "provider"
      ? [
          { key: "go", label: "เดินทาง" },
          { key: "arrive", label: "ถึงหน้างาน" },
          { key: "photo", label: "หลักฐาน" },
          { key: "submit", label: "ส่งมอบ" },
        ]
      : [
          { key: "track", label: "ติดตาม" },
          { key: "work", label: "ดำเนินงาน" },
          { key: "review", label: "ตรวจรับ" },
        ];

  const stepIcons =
    role === "provider" ? getProviderStepIcons(category) : null;

  const currentIndex = flow.currentIndex;
  const subtitle = flow.subtitle;

  const st = (jobStatus || "").toLowerCase();
  const showAppointmentCountdown =
    role === "provider" &&
    appointmentAt &&
    (st === "accepted" || (st === "in_progress" && !hasArrived));

  useEffect(() => {
    if (!showAppointmentCountdown) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [showAppointmentCountdown]);

  const countdownText = useMemo(() => {
    if (!showAppointmentCountdown || !appointmentAt) return null;
    const target = new Date(appointmentAt).getTime();
    if (Number.isNaN(target)) return null;
    return formatCountdownTh(target - now);
  }, [showAppointmentCountdown, appointmentAt, now]);

  return (
    <div
      className={`rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5 ${className}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          ขั้นตอนงาน
        </p>
        <span className="text-[11px] font-medium text-slate-500 tabular-nums">
          {currentIndex + 1}/{steps.length}
        </span>
      </div>

      <div className="mt-4 flex w-full items-start">
        {steps.map((step, i) => {
          const allComplete = currentIndex >= steps.length;
          const done = allComplete || i < currentIndex;
          const active = !allComplete && i === currentIndex;
          const IconCmp = stepIcons?.[i];
          return (
            <React.Fragment key={step.key}>
              <div className="flex min-w-0 flex-1 flex-col items-center">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                    done
                      ? "bg-emerald-500 text-white shadow-sm shadow-emerald-200/80"
                      : active
                        ? "bg-slate-900 text-white ring-2 ring-slate-900/10"
                        : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {done ? (
                    <Check size={18} strokeWidth={2.5} />
                  ) : IconCmp ? (
                    <IconCmp size={18} strokeWidth={2} className="opacity-95" />
                  ) : (
                    i + 1
                  )}
                </div>
                <span
                  className={`mt-2 block w-full truncate px-0.5 text-center text-[10px] font-medium leading-tight sm:text-[11px] ${
                    active ? "text-slate-900" : done ? "text-emerald-700" : "text-slate-400"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`mx-0.5 mt-[18px] h-0.5 min-w-[4px] flex-1 rounded-full ${
                    i < currentIndex ? "bg-emerald-400" : "bg-slate-200"
                  }`}
                  aria-hidden
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {countdownText && (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-800">
          <Timer size={18} className="shrink-0 text-emerald-600" strokeWidth={2} />
          <span className="leading-snug">
            <span className="text-slate-500">จนถึงเวลานัด · </span>
            {countdownText}
          </span>
        </div>
      )}

      <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5 text-sm font-medium leading-snug text-slate-800">
        {subtitle}
      </p>
    </div>
  );
};

export default JobDetailFlowStepper;
