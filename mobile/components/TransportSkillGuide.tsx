import React, { useState } from "react";
import { ChevronDown, ChevronUp, Info } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";

const GUIDE_KEYS = [
  {
    id: "driving",
    emoji: "🚗",
    titleKey: "training.transport_guide_driving_title",
    jobsKey: "training.transport_guide_driving_jobs",
    examKey: "training.transport_guide_driving_exam",
    noteKey: "training.transport_guide_driving_note",
  },
  {
    id: "messenger",
    emoji: "🏍️",
    titleKey: "training.transport_guide_messenger_title",
    jobsKey: "training.transport_guide_messenger_jobs",
    examKey: "training.transport_guide_messenger_exam",
    noteKey: "training.transport_guide_messenger_note",
  },
  {
    id: "public_transport",
    emoji: "🚌",
    titleKey: "training.transport_guide_pt_title",
    jobsKey: "training.transport_guide_pt_jobs",
    examKey: "training.transport_guide_pt_exam",
    noteKey: "training.transport_guide_pt_note",
  },
  {
    id: "delivery",
    emoji: "📦",
    titleKey: "training.transport_guide_delivery_title",
    jobsKey: "training.transport_guide_delivery_jobs",
    examKey: "training.transport_guide_delivery_exam",
    noteKey: "training.transport_guide_delivery_note",
  },
] as const;

type Props = {
  defaultOpen?: boolean;
  compact?: boolean;
};

/** คู่มือสกิลขนส่ง — ให้ user เลือกสอบ Module 2 ถูกหมวด (ตรงกับ admin) */
export function TransportSkillGuide({
  defaultOpen = true,
  compact = false,
}: Props) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/80 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-sky-900">
          <Info size={16} className="flex-shrink-0" />
          {t("training.transport_guide_title")}
        </span>
        {open ? (
          <ChevronUp size={18} className="text-sky-700 flex-shrink-0" />
        ) : (
          <ChevronDown size={18} className="text-sky-700 flex-shrink-0" />
        )}
      </button>

      {open && (
        <div
          className={`px-3 pb-3 grid gap-2 ${compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}
        >
          {GUIDE_KEYS.map((g) => (
            <div
              key={g.id}
              className="rounded-lg bg-white border border-sky-100 p-3 text-xs text-slate-700 leading-relaxed"
            >
              <p className="font-bold text-slate-900 text-sm mb-1.5">
                {g.emoji} {t(g.titleKey)}
              </p>
              <p>
                <span className="text-slate-500 font-medium">
                  {t("training.transport_guide_jobs_label")}:{" "}
                </span>
                {t(g.jobsKey)}
              </p>
              <p className="mt-1">
                <span className="text-slate-500 font-medium">
                  {t("training.transport_guide_exam_label")}:{" "}
                </span>
                {t(g.examKey)}
              </p>
              <p className="mt-1.5 text-amber-800 bg-amber-50/80 rounded-md px-2 py-1">
                {t(g.noteKey)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** คำอธิบายสั้นใต้ชื่อหมวดในรายการ Module 2 */
export function transportCategoryHint(
  category: string,
  t: (path: string) => string,
): string | null {
  const map: Record<string, string> = {
    Driving: "training.transport_hint_driving",
    Messenger: "training.transport_hint_messenger",
    "Public Transport": "training.transport_hint_pt",
    Delivery: "training.transport_hint_delivery",
  };
  const key = map[category];
  return key ? t(key) : null;
}
