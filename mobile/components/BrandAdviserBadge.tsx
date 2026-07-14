import React from "react";
import { Link } from "react-router-dom";
import { Award, AlertTriangle, Briefcase, Settings } from "lucide-react";

/** Tooltip บนป้าย BA — ไม่ใช่การรับรองจากแพลตฟอร์ม */
export const BRAND_ADVISER_BADGE_TOOLTIP_TH =
  "สมาชิกโปรแกรม Brand Adviser — ไม่ใช่การรับรองจากแพลตฟอร์ม";

/** สไตล์เดียวกันทุกหน้าเมื่อปิดโปรแกรม BA บนแพลตฟอร์ม */
export const brandAdviserProgramOffBoxClass =
  "rounded-xl border border-slate-300 bg-slate-100 text-slate-700 text-xs sm:text-sm px-3 py-2";

type BadgeProps = {
  isBrandAdviser?: boolean;
  adviserStatus?: string | null;
  /** dark = บนการ์ดโปรไฟล์มืด; light = บนพื้นหลังสว่าง (งาน) */
  tone?: "dark" | "light";
  className?: string;
  /** ถ้าไม่ส่ง ใช้ข้อความมาตรฐาน (รับรองโดยแพลตฟอร์มไม่ใช่) */
  title?: string;
};

/** ป้าย Brand Adviser — active = ทอง/แอมเบอร์; suspended = เทา */
export function BrandAdviserBadge({
  isBrandAdviser,
  adviserStatus,
  tone = "dark",
  className = "",
  title = BRAND_ADVISER_BADGE_TOOLTIP_TH,
}: BadgeProps) {
  if (!isBrandAdviser) return null;
  const active = String(adviserStatus || "").toLowerCase() === "active";
  const light = tone === "light";
  const activeCls = light
    ? "bg-amber-100 text-amber-900 border border-amber-300"
    : "bg-amber-500/20 text-amber-200 border border-amber-400/40";
  const suspCls = light
    ? "bg-slate-200 text-slate-600 border border-slate-300"
    : "bg-slate-600/50 text-slate-300";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-wide ${active ? activeCls : suspCls} ${className}`}
      title={title}
    >
      <Award size={12} className={active ? "text-amber-500" : "opacity-80"} />
      {active ? "Brand Adviser" : "BA (พักสิทธิ์)"}
    </span>
  );
}

/** ข้อความเดียวกันเมื่อโปรแกรม BA ปิด (Profile / Settings / งาน) */
export function BrandAdviserProgramOffNotice({ className = "" }: { className?: string }) {
  return (
    <p className={`${brandAdviserProgramOffBoxClass} ${className}`}>
      โปรแกรม Brand Adviser ปิดบนแพลตฟอร์มชั่วคราว — สิทธิ์ยกเว้นค่าธรรมเนียมและคะแนน reputation จะไม่ใช้งานจนกว่าจะเปิดอีกครั้ง
    </p>
  );
}

/** คำอธิบาย reputation แบบบรรทัดเดียว */
export function BrandAdviserReputationHint({
  className = "",
  rules,
}: {
  className?: string;
  rules?: { inactivity_days: number; warn_days_before_suspend: number } | null;
}) {
  return (
    <div className={`space-y-1 ${className}`}>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Reputation สะสมจากกิจกรรมในโปรแกรม BA (เช่น การแนะนำผู้ใช้เมื่อคุณเป็นสมาชิก BA แทนเงินสดบางกรณี) — ใช้แสดงความสม่ำเสมอในแพลตฟอร์ม
      </p>
      {rules ? (
        <p className="text-[11px] text-slate-500/90 dark:text-slate-500">
          เกณฑ์เคลื่อนไหวจากแอดมิน: ไม่เกิน {rules.inactivity_days} วันไม่มีกิจกรรมอ้างอิง · แจ้งเตือนก่อนพัก {rules.warn_days_before_suspend} วัน
        </p>
      ) : null}
    </div>
  );
}

type BannerProps = {
  show?: boolean;
  daysLeft?: number | null;
  className?: string;
  /** light = พื้นหลังสว่าง (Settings) */
  tone?: "dark" | "light";
  /** แสดงปุ่มไปงานเปิด / ตั้งค่า (ช่วยรักษาสถานะ BA) */
  showActionLinks?: boolean;
  /** จาก GET /api/app/brand-adviser-rules — ให้ข้อความตรงแอดมิน */
  inactivityDays?: number;
  warnDaysBeforeSuspend?: number;
};

/** แถบเตือนก่อนถูกพักสิทธิ์ BA */
export function BrandAdviserSuspendBanner({
  show,
  daysLeft,
  className = "",
  tone = "dark",
  showActionLinks = true,
  inactivityDays,
  warnDaysBeforeSuspend,
}: BannerProps) {
  if (!show) return null;
  const inD = typeof inactivityDays === "number" && inactivityDays > 0 ? inactivityDays : null;
  const warnD = typeof warnDaysBeforeSuspend === "number" && warnDaysBeforeSuspend >= 0 ? warnDaysBeforeSuspend : null;
  const box =
    tone === "light"
      ? "border-amber-300 bg-amber-50 text-amber-950"
      : "border-amber-500/50 bg-amber-950/50 text-amber-100";
  const sub = tone === "light" ? "text-amber-800" : "text-amber-200/90";
  const btnBase =
    tone === "light"
      ? "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-200/80 text-amber-950 border border-amber-400/60 hover:bg-amber-200"
      : "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/20 text-amber-100 border border-amber-400/50 hover:bg-amber-500/30";
  const policyLine =
    inD != null && warnD != null
      ? `เกณฑ์จากแอดมิน: ไม่มีกิจกรรมอ้างอิงต่อเนื่องเกิน ${inD} วัน → ระบบอาจพักสิทธิ์ — แจ้งเตือนล่วงหน้า ${warnD} วัน`
      : inD != null
        ? `เกณฑ์จากแอดมิน: ไม่มีกิจกรรมอ้างอิงต่อเนื่องเกิน ${inD} วัน → ระบบอาจพักสิทธิ์`
        : null;
  return (
    <div className={`flex flex-col gap-3 p-3 rounded-xl border text-sm ${box} ${className}`}>
      <div className="flex items-start gap-2">
        <AlertTriangle
          className={`shrink-0 mt-0.5 ${tone === "light" ? "text-amber-600" : "text-amber-400"}`}
          size={18}
        />
        <div className="flex-1 min-w-0">
          <p className="font-bold">Brand Adviser — ใกล้ถึงกำหนดเคลื่อนไหว</p>
          <p className={`${sub} text-xs mt-1`}>
            {typeof daysLeft === "number"
              ? `อีกประมาณ ${daysLeft} วัน สิทธิ์ยกเว้นค่าธรรมเนียมอาจถูกพัก — เข้าแอปหรือปิดงานเพื่อรักษาสถานะ`
              : "กรุณาเข้าแอปหรือทำกิจกรรมที่เกี่ยวข้องเพื่อรักษาสถานะ"}
          </p>
          {policyLine ? (
            <p className={`${sub} text-[11px] mt-1.5 leading-snug border-t ${tone === "light" ? "border-amber-200/80 pt-1.5" : "border-amber-500/30 pt-1.5"}`}>
              {policyLine}
            </p>
          ) : null}
        </div>
      </div>
      {showActionLinks && (
        <div className="flex flex-wrap gap-2 pl-0 sm:pl-[26px]">
          <Link to="/jobs" className={btnBase}>
            <Briefcase size={14} />
            เปิดงานที่เปิดอยู่
          </Link>
          <Link to="/settings" className={btnBase}>
            <Settings size={14} />
            ดูสถานะ BA
          </Link>
        </div>
      )}
    </div>
  );
}
