import React, { useEffect, useRef } from "react";
import { CheckCircle2 } from "lucide-react";

export const APP_TIMELINE_STEPS = [
  { id: "apply", label: "สมัคร", desc: "ส่งความสนใจแล้ว" },
  { id: "viewed", label: "นายจ้างดู", desc: "รอการพิจารณา" },
  { id: "shortlisted", label: "คัดเลือก", desc: "อยู่ในลิสต์สั้น" },
  { id: "hired", label: "จ้าง", desc: "ได้รับการจ้าง" },
  { id: "work", label: "ทำงาน", desc: "กำลังดำเนินงาน" },
  { id: "done", label: "จบ", desc: "งานเสร็จสมบูรณ์" },
] as const;

export function getApplicationTimelineIndex(
  status: string,
  jobStatus: string,
  viewedAt?: string | null,
): number {
  if (jobStatus === "completed") return 5;
  if (status === "hired") return 4;
  if (status === "shortlisted") return 2;
  if (status === "interested") return viewedAt ? 1 : 0;
  return 0;
}

export function ApplicationTimeline({
  status,
  jobStatus,
  viewedAt,
  compact,
}: {
  status: string;
  jobStatus: string;
  viewedAt?: string | null;
  compact?: boolean;
}) {
  const currentIdx = getApplicationTimelineIndex(status, jobStatus, viewedAt);
  const prevIdxRef = useRef(currentIdx);
  const [pulseStep, setPulseStep] = React.useState<number | null>(null);

  useEffect(() => {
    if (currentIdx > prevIdxRef.current) {
      setPulseStep(currentIdx);
      const t = window.setTimeout(() => setPulseStep(null), 1200);
      prevIdxRef.current = currentIdx;
      return () => window.clearTimeout(t);
    }
    prevIdxRef.current = currentIdx;
  }, [currentIdx, viewedAt]);

  return (
    <div className={`jb-app-timeline${compact ? " jb-app-timeline--compact" : ""}`}>
      {APP_TIMELINE_STEPS.map((step, i) => {
        const done = i < currentIdx;
        const current = i === currentIdx;
        const justAdvanced = pulseStep === i;
        return (
          <div
            key={step.id}
            className={`jb-app-timeline-step ${done ? "done" : ""} ${current ? "current" : ""} ${justAdvanced ? "jb-app-timeline-step--pulse" : ""}`}
          >
            <div className="jb-app-timeline-icon">
              {done ? <CheckCircle2 size={14} /> : i + 1}
            </div>
            <p className="text-[10px] font-semibold text-slate-700">{step.label}</p>
            {current && !compact && (
              <p className="text-[9px] text-slate-500 mt-0.5 leading-tight">{step.desc}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
