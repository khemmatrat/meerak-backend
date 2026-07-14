import React, { useState, type Dispatch, type SetStateAction } from "react";
import { type NavigateFunction } from "react-router-dom";
import {
  Eye,
  HelpCircle,
  ChevronDown,
  Utensils,
  Shirt,
  Palette,
  Scissors,
  Leaf,
  Video,
  BadgeCheck,
  Sparkles,
  BookOpen,
  type LucideIcon,
} from "lucide-react";
import type { NotificationType } from "../../context/NotificationContext";
import { PortfolioImageUploader } from "../../components/PortfolioImageUploader";
import { PROFILE_EXPERT_CATEGORY_OPTIONS } from "../../constants/profileExpertCategories";
import { api } from "../../services/api";
import type { UserProfile } from "../../types";
import { AvailabilitySlotsBlock } from "./AvailabilitySlotsBlock";
import { BeautyMerchantHub } from "./BeautyMerchantHub";
import { isServiceMerchantCategory } from "../../constants/serviceMerchantCategories";

/** โทนสีเล็กในไอคอน — เลียนแพทเทิร์นหมวดจากหน้าเลือกอาชีพ */
const EXPERT_CATEGORY_VISUAL: Record<
  string,
  { Icon: LucideIcon; box: string }
> = {
  chef: {
    Icon: Utensils,
    box: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-600/25",
  },
  tailor: {
    Icon: Shirt,
    box: "bg-violet-100 text-violet-700 ring-1 ring-violet-600/25",
  },
  artist: {
    Icon: Palette,
    box: "bg-fuchsia-100 text-fuchsia-700 ring-1 ring-fuchsia-600/25",
  },
  barber: {
    Icon: Scissors,
    box: "bg-sky-100 text-sky-800 ring-1 ring-sky-600/25",
  },
  wellness: {
    Icon: Leaf,
    box: "bg-teal-100 text-teal-800 ring-1 ring-teal-600/25",
  },
  beauty: {
    Icon: Sparkles,
    box: "bg-rose-100 text-rose-800 ring-1 ring-rose-600/25",
  },
};

/** การ์ดจัดระเบียบ — โทนเดียวเลือกสายงานหลัก (พื้นขาวเมื่อธีม standard) */
const PORTFOLIO_BLOCK =
  "rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm ring-1 ring-slate-100";
const FORM_LABEL =
  "block text-sm font-semibold text-slate-800 tracking-tight mb-2";
const FORM_HINT_XS = "text-xs sm:text-[13px] text-slate-600 leading-relaxed";
const FORM_CONTROL =
  "w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-900 text-[15px] leading-snug placeholder:text-slate-500 outline-none shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] transition focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/20 disabled:opacity-60";
const FORM_TEXTAREA_BASE = `${FORM_CONTROL} resize-y leading-relaxed min-h-[5.5rem]`;
const SECTION_HEAD = "text-base font-bold text-slate-800 tracking-tight";
const SECTION_KICKER = "text-sm text-slate-600 leading-relaxed";

function profilePatchErrorMessage(err: unknown): string {
  const r = err as {
    response?: { data?: { error?: string; details?: string } };
  };
  const d = r.response?.data;
  if (!d || typeof d !== "object") return "บันทึกไม่สำเร็จ";
  const msg = typeof d.error === "string" ? d.error : "";
  const det = typeof d.details === "string" ? d.details : "";
  return msg || det || "บันทึกไม่สำเร็จ";
}

function clipPreview(s: string | null | undefined, max: number) {
  const t = (s || "").trim();
  if (!t) return "";
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

type BrandExpandKey = "greeting" | "badge" | "signature" | "journey";

export interface PortfolioExpertTabProps {
  profile: UserProfile | null;
  setProfile: Dispatch<SetStateAction<UserProfile | null>>;
  user: UserProfile | null;
  navigate: NavigateFunction;
  notify: (msg: string, type?: NotificationType) => void;
  t: (key: string) => string;
}

export const PortfolioExpertTab: React.FC<PortfolioExpertTabProps> = ({
  profile,
  setProfile,
  user,
  navigate,
  notify,
  t,
}) => {
  /** Postgres UUID / jwt.sub — ใช้ก่อน profile.id เพื่อไม่ PATCH ผิดตอนโหลดจาก Firestore (id = Firebase doc) */
  const uid = user?.id ?? profile?.id ?? null;
  const [expandBrandPanel, setExpandBrandPanel] =
    useState<BrandExpandKey | null>(null);
  const [expandMerchantHub, setExpandMerchantHub] = useState(false);
  const merchantHubRef = React.useRef<HTMLDivElement | null>(null);

  const greetingPreview =
    clipPreview(profile?.greeting_video_url || user?.greeting_video_url, 48) ||
    "ยังไม่ใส่ลิงก์คลิป";
  const badgeRaw = profile?.verified_badge ?? user?.verified_badge;
  const badgePreview =
    (typeof badgeRaw === "boolean"
      ? badgeRaw
        ? "Verified"
        : ""
      : `${badgeRaw ?? ""}`.trim()) || "ยังไม่ตั้ง Badge";
  const signaturePreview =
    clipPreview(profile?.signature_service || user?.signature_service, 40) ||
    "ยังไม่ได้เขียนคำโปรย";
  const journeyPreview =
    clipPreview(profile?.the_journey || user?.the_journey, 40) ||
    "เล่าประวัติ/แนวคิดเมื่อพร้อม";

  const persistExpertCategory = async (nextRaw: string | null) => {
    if (!uid) {
      notify("ยังโหลดโปรไฟล์ไม่พร้อม — ลองรีเฟรชหน้า", "error");
      return;
    }
    const next = nextRaw?.trim() || null;
    try {
      await api.patch(`/users/profile/${uid}`, {
        expert_category: next,
      });
      setProfile((p) =>
        p ? { ...p, expert_category: next as string | undefined } : null,
      );
      notify("บันทึกแล้ว", "success");
      if (next && isServiceMerchantCategory(next)) {
        setExpandMerchantHub(true);
        requestAnimationFrame(() => {
          merchantHubRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
      }
    } catch (e) {
      notify(profilePatchErrorMessage(e), "error");
    }
  };

  const currentExpert = profile?.expert_category || user?.expert_category || "";
  const showMerchantHub = isServiceMerchantCategory(currentExpert);

  return (
    <div className="luxury-card rounded-b-[20px] rounded-t-none border-t-0 p-6 sm:p-8 animate-in fade-in space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-200">
        <div className="min-w-0 space-y-2">
          <h3 className="text-xl font-bold text-slate-800 tracking-tight">
            Portfolio และแบรนด์ส่วนตัว
          </h3>
          <p className="text-[15px] text-slate-600 leading-relaxed max-w-xl">
            เติมพอร์ต วิดีโอ และเรื่องราวให้ครบ
            เพื่อให้ลูกค้าเห็นมืออาชีพของคุณชัดในแท็บ About
          </p>
        </div>
        {(profile?.id || user?.id) && (
          <button
            type="button"
            onClick={() => navigate(`/talents/${profile?.id || user?.id}`)}
            className="flex shrink-0 items-center gap-2 px-4 py-2.5 rounded-xl border border-emerald-200 bg-white font-semibold text-sm text-emerald-800 hover:bg-emerald-50 hover:border-emerald-300 shadow-sm transition"
          >
            <Eye size={18} />
            {t("profile.view_as_customer")}
          </button>
        )}
      </div>

      {/* คู่มือ Portfolio — การ์ดอ่านง่าย โทนเดียว Advance Booking */}
      <details className="group overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50/85 shadow-sm ring-1 ring-emerald-600/10">
        <summary className="flex items-center gap-2 px-4 py-3.5 cursor-pointer font-semibold text-slate-800 hover:bg-emerald-100/50 list-none [&::-webkit-details-marker]:hidden">
          <HelpCircle size={18} className="shrink-0 text-emerald-700" />
          <span className="text-[15px]">
            คู่มือ Portfolio — เปิดถ้าต้องการรายละเอียด
          </span>
          <ChevronDown
            size={18}
            className="shrink-0 ml-auto text-slate-600 group-open:rotate-180 transition-transform"
          />
        </summary>
        <div className="border-t border-emerald-200/80 px-4 pb-4 pt-3 text-[15px] text-slate-700 space-y-2.5 leading-relaxed bg-white/60">
          <p>
            <strong className="text-slate-900">รูปผลงาน:</strong> อัปโหลดไฟล์
            (JPG, PNG, WebP, GIF) หรือใส่ URL — แสดงในโปรไฟล์ลูกค้าแท็บ About
          </p>
          <p>
            <strong className="text-slate-900">วิดีโอใน Portfolio:</strong> URL
            ที่ลงท้าย .mp4, .webm, .mov จะไปรวมใน Story ด้วย
          </p>
          <p>
            <strong className="text-slate-900">คลิป Greeting:</strong> ใส่ URL
            คลิปสั้นโชว์เทคนิค/แนะนำตัว (เช่น YouTube)
          </p>
          <p>
            <strong className="text-slate-900">The Journey:</strong>{" "}
            เล่าประวัติหรือแนวคิดในการทำงาน — ช่วยให้ลูกค้าเชื่อมโยงกับคุณ
          </p>
          <p>
            <strong className="text-slate-900">ช่วงเวลาว่าง:</strong>{" "}
            ตั้งเวลาเปิดจองคิว — ลูกค้าจองได้ทันทีในโปรไฟล์
          </p>
          <p className="text-slate-600 text-xs pt-1">
            กดปุ่ม &quot;ดูแบบลูกค้า&quot; เพื่อดูโปรไฟล์ในมุมมองลูกค้า
          </p>
        </div>
      </details>

      {/* Profile Completeness */}
      {(() => {
        const items = [
          {
            key: "expert_category",
            label: "หมวด Expert",
            filled: !!(profile?.expert_category || user?.expert_category),
          },
          {
            key: "portfolio_urls",
            label: "รูปผลงาน",
            filled: !!(
              (profile?.portfolio_urls || user?.portfolio_urls || []).length > 0
            ),
          },
          {
            key: "greeting_video_url",
            label: "คลิป Greeting",
            filled: !!(profile?.greeting_video_url || user?.greeting_video_url),
          },
          {
            key: "verified_badge",
            label: "Verified Badge",
            filled: !!(profile?.verified_badge || user?.verified_badge),
          },
          {
            key: "signature_service",
            label: "Signature Service",
            filled: !!(profile?.signature_service || user?.signature_service),
          },
          {
            key: "the_journey",
            label: "The Journey",
            filled: !!(profile?.the_journey || user?.the_journey),
          },
          {
            key: "social",
            label: t("profile.add_social_links"),
            filled: !!(
              (
                (profile as { instagram_url?: string })?.instagram_url ||
                (user as { instagram_url?: string })?.instagram_url
              )?.trim() ||
              (
                (profile as { line_id?: string })?.line_id ||
                (user as { line_id?: string })?.line_id
              )?.trim()
            ),
          },
        ];
        const filled = items.filter((i) => i.filled).length;
        const pct = Math.round((filled / items.length) * 100);
        const tips = items.filter((i) => !i.filled).map((i) => i.label);
        return (
          <div className={`${PORTFOLIO_BLOCK} space-y-3`} aria-live="polite">
            <div className="flex flex-wrap items-end justify-between gap-2 mb-1">
              <span className="text-sm font-semibold text-slate-800">
                {t("profile.profile_completeness")}
              </span>
              <span className="text-lg font-bold tabular-nums text-emerald-700">
                {pct}%
              </span>
            </div>
            <div className="h-3 rounded-full bg-slate-100 overflow-hidden shadow-inner border border-slate-200/80">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            {tips.length > 0 && (
              <p className={`${FORM_HINT_XS} mt-3`}>
                <span className="font-semibold text-slate-700">
                  {t("profile.profile_complete_tip")}:
                </span>{" "}
                {tips.slice(0, 3).join(" · ")}
              </p>
            )}
          </div>
        );
      })()}

      <div className="grid gap-8 md:gap-10">
        <section className="space-y-0">
          <div className={`${PORTFOLIO_BLOCK} space-y-5`}>
            <div className="space-y-2 pb-4 border-b border-slate-100">
              <h4 className={SECTION_HEAD}>สายงานหลัก</h4>
              <p className={SECTION_KICKER}>
                เลือกหมวดหนึ่งหมวดที่ใช้กรองเมื่อผู้ว่าจ้างค้นหาในแท็บ Talents —
                เลือกให้ใกล้ความเป็นมืออาชีพของคุณที่สุด
              </p>
            </div>
            <div role="radiogroup" aria-label="เลือกสายงานหลัก">
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                {PROFILE_EXPERT_CATEGORY_OPTIONS.map((opt) => {
                  const vis = EXPERT_CATEGORY_VISUAL[opt.value];
                  const Icon = vis?.Icon ?? Utensils;
                  const box =
                    vis?.box ??
                    "bg-slate-200 text-slate-700 ring-1 ring-slate-400/30";
                  const selected =
                    currentExpert.trim().toLowerCase() ===
                    opt.value.toLowerCase();
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={`flex items-start gap-2 sm:gap-3 rounded-2xl border p-2.5 sm:p-3 text-left transition-all shadow-sm ${
                        selected
                          ? "border-emerald-600 bg-emerald-50/95 ring-2 ring-emerald-500/55"
                          : "border-slate-200 bg-white hover:border-emerald-300/80 hover:shadow-md"
                      }`}
                      onClick={() => {
                        const isSelected =
                          currentExpert.trim().toLowerCase() ===
                          opt.value.toLowerCase();
                        if (
                          isSelected &&
                          isServiceMerchantCategory(opt.value)
                        ) {
                          setExpandMerchantHub((v) => !v);
                          if (!expandMerchantHub) {
                            requestAnimationFrame(() => {
                              merchantHubRef.current?.scrollIntoView({
                                behavior: "smooth",
                                block: "start",
                              });
                            });
                          }
                          return;
                        }
                        void persistExpertCategory(opt.value);
                      }}
                    >
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${box}`}
                      >
                        <Icon size={20} aria-hidden strokeWidth={2} />
                      </span>
                      <span className="min-w-0 flex-1 text-xs sm:text-sm font-semibold text-slate-700 leading-snug">
                        {opt.label}
                      </span>
                    </button>
                  );
                })}
              </div>
              {currentExpert ? (
                <button
                  type="button"
                  className="mt-3 text-sm font-semibold text-slate-600 hover:text-emerald-800 underline underline-offset-4 decoration-slate-300 hover:decoration-emerald-500"
                  onClick={() => void persistExpertCategory(null)}
                >
                  ล้างหมวด (ยังไม่ระบุ)
                </button>
              ) : null}
            </div>
          </div>
        </section>

        {showMerchantHub && (
          <div ref={merchantHubRef}>
            <BeautyMerchantHub
              expertCategory={currentExpert}
              expanded={expandMerchantHub}
              onToggle={() => setExpandMerchantHub((v) => !v)}
              notify={notify}
            />
          </div>
        )}

        <section className="space-y-0">
          <div className={`${PORTFOLIO_BLOCK} space-y-6`}>
            <div className="space-y-2">
              <h4 className={SECTION_HEAD}>ภาพและผลงาน</h4>
              <p className={`${SECTION_KICKER} max-w-xl`}>
                Lookbook บนการ์ดโปรไฟล์ — ใส่รูปจากไฟล์หรือ URL
                (ทีละหลายบรรทัดได้)
              </p>
            </div>
            <div>
              <span className={FORM_LABEL}>Portfolio (รูปผลงาน Lookbook)</span>
              <PortfolioImageUploader
                onSuccess={async (url) => {
                  if (!uid) {
                    notify("ยังโหลดโปรไฟล์ไม่พร้อม — ลองรีเฟรชหน้า", "error");
                    return;
                  }
                  const current =
                    profile?.portfolio_urls ?? user?.portfolio_urls ?? [];
                  const urls = [...current, url];
                  try {
                    await api.patch(`/users/profile/${uid}`, {
                      portfolio_urls: urls,
                    });
                    setProfile((p) =>
                      p ? { ...p, portfolio_urls: urls } : null,
                    );
                    notify("อัปโหลดรูปผลงานสำเร็จ", "success");
                  } catch (e) {
                    notify(profilePatchErrorMessage(e), "error");
                  }
                }}
                onError={(msg) => notify(msg, "error")}
              />
            </div>
            <div>
              <p className={`${FORM_HINT_XS}`}>
                <span className="font-semibold text-slate-700">
                  หรือวางลิงก์รูป
                </span>{" "}
                คั่นแต่ละแถวบรรทัดใหม่
              </p>
              <textarea
                value={(
                  profile?.portfolio_urls ??
                  user?.portfolio_urls ??
                  []
                ).join("\n")}
                onChange={async (e) => {
                  const urls = e.target.value
                    .split("\n")
                    .map((u) => u.trim())
                    .filter(Boolean);
                  if (!uid) {
                    notify("ยังโหลดโปรไฟล์ไม่พร้อม — ลองรีเฟรชหน้า", "error");
                    return;
                  }
                  try {
                    await api.patch(`/users/profile/${uid}`, {
                      portfolio_urls: urls,
                    });
                    setProfile((p) =>
                      p ? { ...p, portfolio_urls: urls } : null,
                    );
                    notify("บันทึกแล้ว", "success");
                  } catch (e) {
                    notify(profilePatchErrorMessage(e), "error");
                  }
                }}
                placeholder="https://example.com/work1.jpg"
                rows={4}
                spellCheck={false}
                className={`${FORM_TEXTAREA_BASE} mt-2`}
              />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-start gap-3 px-0.5 pt-1">
            <span
              className="hidden sm:block h-10 w-1 rounded-full shrink-0 bg-violet-600"
              aria-hidden
            />
            <div className="min-w-0 space-y-1">
              <h4 className={SECTION_HEAD}>วิดีโอและแบรนด์</h4>
              <p className={`${SECTION_KICKER} max-w-xl`}>
                แตะการ์ดเพื่อเปิดแก้ทีละหัวข้อ —
                เลย์เอาต์เดียวกับเลือกสายงานหลัก
              </p>
            </div>
          </div>

          <div className={`${PORTFOLIO_BLOCK} space-y-3`}>
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              <button
                type="button"
                id="brand-card-greeting"
                aria-expanded={expandBrandPanel === "greeting"}
                aria-controls="brand-panel-greeting"
                className={`flex w-full items-start gap-2 sm:gap-3 rounded-2xl border p-3 text-left transition-all shadow-sm ${
                  expandBrandPanel === "greeting"
                    ? "border-emerald-600 bg-emerald-50/95 ring-2 ring-emerald-500/55"
                    : "border-slate-200 bg-white hover:border-emerald-300/80 hover:shadow-md"
                }`}
                onClick={() =>
                  setExpandBrandPanel((k) =>
                    k === "greeting" ? null : "greeting",
                  )
                }
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 ring-1 ring-violet-600/25">
                  <Video size={20} aria-hidden strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs sm:text-sm font-semibold text-slate-800 leading-snug">
                    คลิป Greeting
                  </span>
                  <span className="mt-1 block text-[11px] sm:text-xs text-slate-600 leading-snug line-clamp-2">
                    {greetingPreview}
                  </span>
                </span>
                <ChevronDown
                  size={18}
                  className={`mt-1 shrink-0 text-slate-400 transition-transform ${
                    expandBrandPanel === "greeting" ? "rotate-180" : ""
                  }`}
                  aria-hidden
                />
              </button>

              <button
                type="button"
                aria-expanded={expandBrandPanel === "badge"}
                aria-controls="brand-panel-badge"
                className={`flex w-full items-start gap-2 sm:gap-3 rounded-2xl border p-3 text-left transition-all shadow-sm ${
                  expandBrandPanel === "badge"
                    ? "border-emerald-600 bg-emerald-50/95 ring-2 ring-emerald-500/55"
                    : "border-slate-200 bg-white hover:border-emerald-300/80 hover:shadow-md"
                }`}
                onClick={() =>
                  setExpandBrandPanel((k) => (k === "badge" ? null : "badge"))
                }
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-800 ring-1 ring-sky-600/25">
                  <BadgeCheck size={20} aria-hidden strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs sm:text-sm font-semibold text-slate-800 leading-snug">
                    Verified Badge
                  </span>
                  <span className="mt-1 block text-[11px] sm:text-xs text-slate-600 leading-snug line-clamp-2">
                    {badgePreview}
                  </span>
                </span>
                <ChevronDown
                  size={18}
                  className={`mt-1 shrink-0 text-slate-400 transition-transform ${
                    expandBrandPanel === "badge" ? "rotate-180" : ""
                  }`}
                  aria-hidden
                />
              </button>

              <button
                type="button"
                aria-expanded={expandBrandPanel === "signature"}
                aria-controls="brand-panel-signature"
                className={`flex w-full items-start gap-2 sm:gap-3 rounded-2xl border p-3 text-left transition-all shadow-sm ${
                  expandBrandPanel === "signature"
                    ? "border-emerald-600 bg-emerald-50/95 ring-2 ring-emerald-500/55"
                    : "border-slate-200 bg-white hover:border-emerald-300/80 hover:shadow-md"
                }`}
                onClick={() =>
                  setExpandBrandPanel((k) =>
                    k === "signature" ? null : "signature",
                  )
                }
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-fuchsia-100 text-fuchsia-800 ring-1 ring-fuchsia-600/25">
                  <Sparkles size={20} aria-hidden strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs sm:text-sm font-semibold text-slate-800 leading-snug">
                    Signature Service
                  </span>
                  <span className="mt-1 block text-[11px] sm:text-xs text-slate-600 leading-snug line-clamp-2">
                    {signaturePreview}
                  </span>
                </span>
                <ChevronDown
                  size={18}
                  className={`mt-1 shrink-0 text-slate-400 transition-transform ${
                    expandBrandPanel === "signature" ? "rotate-180" : ""
                  }`}
                  aria-hidden
                />
              </button>

              <button
                type="button"
                aria-expanded={expandBrandPanel === "journey"}
                aria-controls="brand-panel-journey"
                className={`flex w-full items-start gap-2 sm:gap-3 rounded-2xl border p-3 text-left transition-all shadow-sm ${
                  expandBrandPanel === "journey"
                    ? "border-emerald-600 bg-emerald-50/95 ring-2 ring-emerald-500/55"
                    : "border-slate-200 bg-white hover:border-emerald-300/80 hover:shadow-md"
                }`}
                onClick={() =>
                  setExpandBrandPanel((k) =>
                    k === "journey" ? null : "journey",
                  )
                }
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-800 ring-1 ring-teal-600/25">
                  <BookOpen size={20} aria-hidden strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs sm:text-sm font-semibold text-slate-800 leading-snug">
                    The Journey
                  </span>
                  <span className="mt-1 block text-[11px] sm:text-xs text-slate-600 leading-snug line-clamp-2">
                    {journeyPreview}
                  </span>
                </span>
                <ChevronDown
                  size={18}
                  className={`mt-1 shrink-0 text-slate-400 transition-transform ${
                    expandBrandPanel === "journey" ? "rotate-180" : ""
                  }`}
                  aria-hidden
                />
              </button>
            </div>
          </div>

          {expandBrandPanel === "greeting" && (
            <div
              id="brand-panel-greeting"
              role="region"
              aria-labelledby="brand-card-greeting"
              className={`${PORTFOLIO_BLOCK} space-y-3`}
            >
              <label htmlFor="pf-greeting-url" className={FORM_LABEL}>
                Video Masterclass (Greeting) — URL คลิปสั้นโชว์เทคนิค
              </label>
              <input
                id="pf-greeting-url"
                type="url"
                value={
                  profile?.greeting_video_url ?? user?.greeting_video_url ?? ""
                }
                onChange={async (e) => {
                  const v = e.target.value.trim() || null;
                  if (!uid) {
                    notify("ยังโหลดโปรไฟล์ไม่พร้อม — ลองรีเฟรชหน้า", "error");
                    return;
                  }
                  try {
                    await api.patch(`/users/profile/${uid}`, {
                      greeting_video_url: v,
                    });
                    setProfile((p) =>
                      p ? { ...p, greeting_video_url: v } : null,
                    );
                    notify("บันทึกแล้ว", "success");
                  } catch (e) {
                    notify(profilePatchErrorMessage(e), "error");
                  }
                }}
                placeholder="https://youtube.com/..."
                className={`${FORM_CONTROL} min-h-[48px]`}
              />
            </div>
          )}

          {expandBrandPanel === "badge" && (
            <div
              id="brand-panel-badge"
              role="region"
              className={`${PORTFOLIO_BLOCK} space-y-3`}
            >
              <label htmlFor="pf-verified-badge" className={FORM_LABEL}>
                Verified Skills Badge
              </label>
              <select
                id="pf-verified-badge"
                value={(() => {
                  const v = profile?.verified_badge ?? user?.verified_badge;
                  if (v === true) return "Verified";
                  if (v === false || v == null || v === "") return "";
                  return String(v);
                })()}
                onChange={async (e) => {
                  const v = e.target.value || null;
                  if (!uid) {
                    notify("ยังโหลดโปรไฟล์ไม่พร้อม — ลองรีเฟรชหน้า", "error");
                    return;
                  }
                  try {
                    await api.patch(`/users/profile/${uid}`, {
                      verified_badge: v,
                    });
                    setProfile((p) => (p ? { ...p, verified_badge: v } : null));
                    notify("บันทึกแล้ว", "success");
                  } catch (e) {
                    notify(profilePatchErrorMessage(e), "error");
                  }
                }}
                className={`${FORM_CONTROL} min-h-[48px]`}
              >
                <option value="">— ไม่ตั้ง —</option>
                <option value="Verified">Verified</option>
                <option value="Master Tailor">Master Tailor</option>
                <option value="Authentic Chef">Authentic Chef</option>
                <option value="Style Master">Style Master</option>
                <option value="Wellness Expert">Wellness Expert</option>
                <option value="Creative Artist">Creative Artist</option>
              </select>
            </div>
          )}

          {expandBrandPanel === "signature" && (
            <div
              id="brand-panel-signature"
              role="region"
              className={`${PORTFOLIO_BLOCK} space-y-3`}
            >
              <label htmlFor="pf-signature" className={FORM_LABEL}>
                Signature Service (เมนู/สไตล์ที่เป็นเอกลักษณ์)
              </label>
              <p className={`${FORM_HINT_XS}`}>
                เขียนจุดที่ทำให้ลูกค้าจดจำจากบริการครั้งแรกได้ง่าย
              </p>
              <textarea
                id="pf-signature"
                value={
                  profile?.signature_service ?? user?.signature_service ?? ""
                }
                onChange={async (e) => {
                  const v = e.target.value.trim().slice(0, 500) || null;
                  if (!uid) {
                    notify("ยังโหลดโปรไฟล์ไม่พร้อม — ลองรีเฟรชหน้า", "error");
                    return;
                  }
                  try {
                    await api.patch(`/users/profile/${uid}`, {
                      signature_service: v,
                    });
                    setProfile((p) =>
                      p ? { ...p, signature_service: v } : null,
                    );
                    notify("บันทึกแล้ว", "success");
                  } catch (e) {
                    notify(profilePatchErrorMessage(e), "error");
                  }
                }}
                placeholder="เช่น Signature Menu ของเชฟ หรือสไตล์การตัดสูทที่เป็นเอกลักษณ์"
                rows={4}
                className={`${FORM_TEXTAREA_BASE} min-h-[6.75rem]`}
              />
            </div>
          )}

          {expandBrandPanel === "journey" && (
            <div
              id="brand-panel-journey"
              role="region"
              className={`${PORTFOLIO_BLOCK} space-y-3`}
            >
              <label htmlFor="pf-journey" className={FORM_LABEL}>
                The Journey — ประวัติ/แนวคิดในการทำงาน (Personal Storytelling)
              </label>
              <p className={`${FORM_HINT_XS}`}>
                เล่าเรื่องสั้นๆ ที่เป็นตัวคุณ
                เพื่อให้ผู้ว่าจ้างรู้สึกผูกพันมาก่อนพูดเรื่องราคา
              </p>
              <textarea
                id="pf-journey"
                value={profile?.the_journey ?? user?.the_journey ?? ""}
                onChange={async (e) => {
                  const v = e.target.value.trim().slice(0, 2000) || null;
                  if (!uid) {
                    notify("ยังโหลดโปรไฟล์ไม่พร้อม — ลองรีเฟรชหน้า", "error");
                    return;
                  }
                  try {
                    await api.patch(`/users/profile/${uid}`, {
                      the_journey: v,
                    });
                    setProfile((p) => (p ? { ...p, the_journey: v } : null));
                    notify("บันทึกแล้ว", "success");
                  } catch (e) {
                    notify(profilePatchErrorMessage(e), "error");
                  }
                }}
                placeholder="เล่าประวัติหรือแนวคิดในการทำงาน เพื่อให้คนจ้างรู้สึก Connect กับตัวคุณ"
                rows={6}
                className={`${FORM_TEXTAREA_BASE} min-h-[8.5rem]`}
              />
            </div>
          )}
        </section>

        {/* Social */}
        <div className={PORTFOLIO_BLOCK}>
          <div className="space-y-1 pb-4 mb-5 border-b border-slate-100">
            <h4 className={SECTION_HEAD}>โซเชียลและการติดต่อ</h4>
            <p className={`${SECTION_KICKER} max-w-xl`}>
              แชร์ช่องทางให้ว่าจ้างตามหาในพื้นที่ที่ใช้อยู่ประจำ
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label htmlFor="pf-ig" className={FORM_LABEL}>
                {t("profile.instagram")}
              </label>
              <input
                id="pf-ig"
                type="text"
                value={profile?.instagram_url || user?.instagram_url || ""}
                onChange={async (e) => {
                  const v = e.target.value.trim().slice(0, 255) || null;
                  if (!uid) {
                    notify("ยังโหลดโปรไฟล์ไม่พร้อม — ลองรีเฟรชหน้า", "error");
                    return;
                  }
                  try {
                    await api.patch(`/users/profile/${uid}`, {
                      instagram_url: v,
                    });
                    setProfile((p) => (p ? { ...p, instagram_url: v } : null));
                    notify("บันทึกแล้ว", "success");
                  } catch (e) {
                    notify(profilePatchErrorMessage(e), "error");
                  }
                }}
                placeholder="username หรือ https://instagram.com/..."
                autoComplete="off"
                className={`${FORM_CONTROL} min-h-[48px]`}
              />
            </div>
            <div>
              <label htmlFor="pf-line" className={FORM_LABEL}>
                {t("profile.line_id")}
              </label>
              <input
                id="pf-line"
                type="text"
                value={profile?.line_id || user?.line_id || ""}
                onChange={async (e) => {
                  const v = e.target.value.trim().slice(0, 100) || null;
                  if (!uid) {
                    notify("ยังโหลดโปรไฟล์ไม่พร้อม — ลองรีเฟรชหน้า", "error");
                    return;
                  }
                  try {
                    await api.patch(`/users/profile/${uid}`, {
                      line_id: v,
                    });
                    setProfile((p) => (p ? { ...p, line_id: v } : null));
                    notify("บันทึกแล้ว", "success");
                  } catch (e) {
                    notify(profilePatchErrorMessage(e), "error");
                  }
                }}
                placeholder="@username หรือ Line ID"
                className={`${FORM_CONTROL} min-h-[48px]`}
              />
            </div>
          </div>
        </div>

        {/* Advance Booking — พื้นอ่อนข้อความเข้ม: ธีม standard ข้อความ emerald อ่อนบนขาวไม่อ่าน */}
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5 space-y-4 shadow-sm ring-1 ring-emerald-600/15">
          <div className="flex gap-3">
            <div
              className="hidden sm:block w-1 shrink-0 rounded-full bg-emerald-600"
              aria-hidden
            />
            <div className="space-y-1.5">
              <h4 className="text-base font-semibold tracking-tight text-slate-800">
                จองคิวล่วงหน้า
                <span className="font-normal text-slate-600">
                  {" "}
                  (Advance Booking)
                </span>
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                เฉพาะการจองเวลา — ถ้าอยากโชว์งานเป็นคลิปไปฟีด ใช้แท็บ Story
              </p>
              <p className="text-xs text-slate-600">
                แนะนำ: เลือกหลายช่วง เช่น ศุกร์–อา ช่วงเย็น
              </p>
            </div>
          </div>
          <AvailabilitySlotsBlock />
        </section>
      </div>
    </div>
  );
};
