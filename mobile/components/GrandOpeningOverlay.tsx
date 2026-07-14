import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Sparkles, ChevronRight, ChevronLeft, BookOpen, X } from "lucide-react";
import { useGrandOpeningCountdown } from "../../shared/useGrandOpeningCountdown";
import { useAuth } from "../context/AuthContext";

const SESSION_KEY = "aqond_grand_opening_overlay_dismissed";

const TUTORIAL_STEPS: { title: string; body: string }[] = [
  {
    title: "สมัครก่อนเปิดระบบ",
    body: "ใช้เวลาไม่กี่นาที คุณสามารถสมัครสมาชิกและยืนยันตัวตน (KYC) ได้ก่อนวันเปิดใช้งานจริง — รับสิทธิ์ค่าธรรมเนียม 0 บาทสำหรับงานแรกตามโปรโมชัน",
  },
  {
    title: "ขั้นตอนที่ 1 — กดปุ่มสมัคร",
    body: 'กดปุ่ม "สมัครสมาชิก" (กรอบขาว) ด้านล่างนับถอยหลัง ระบบจะปิดหน้านี้แล้วพาไปหน้าสมัครอัตโนมัติ ถ้าหน้าค้าง ให้กดปุ่ม "เข้าสู่แอป" ก่อน แล้วไปที่เมนูสมัครอีกครั้ง',
  },
  {
    title: "ขั้นตอนที่ 2 — เบอร์โทร & OTP",
    body: "กรอกเบอร์โทรศัพท์ → รับรหัส OTP ทาง SMS → ตั้งรหัสผ่านและกรอกข้อมูลให้ครบ ตามหน้าจอ",
  },
  {
    title: "ขั้นตอนที่ 3 — ยืนยันตัวตน (KYC)",
    body: "หลังสมัครสำเร็จ แอปจะพาไปหน้ายืนยันตัวตนโดยอัตโนมัติ เพื่อเตรียมรับงานหรือใช้บริการเมื่อเปิดระบบ",
  },
];

export const GrandOpeningOverlay: React.FC = () => {
  const go = useGrandOpeningCountdown();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tutorialIdx, setTutorialIdx] = useState(0);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_KEY) === "1") setDismissed(true);
    } catch (_) {}
  }, []);

  const persistDismiss = useCallback(() => {
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch (_) {}
    setDismissed(true);
  }, []);

  if (go.isLive || dismissed) return null;

  const pad = (n: number) => String(n).padStart(2, "0");

  const dismiss = () => {
    persistDismiss();
  };

  /** สำคัญ: ต้องปิด overlay ก่อน/พร้อม navigate ไม่งั้นหน้า /register อยู่ใต้ layer สูง — ผู้ใช้จะเห็นว่า "กดแล้วไม่ไป" */
  const goToRegisterFlow = () => {
    persistDismiss();
    navigate(isAuthenticated ? "/kyc" : "/register?next=/kyc");
  };

  const goToProfileInfo = () => {
    persistDismiss();
    navigate("/profile?tab=info");
  };

  const openTutorial = () => {
    setTutorialIdx(0);
    setTutorialOpen(true);
  };

  const closeTutorial = () => setTutorialOpen(false);

  const tutorialNext = () => {
    if (tutorialIdx < TUTORIAL_STEPS.length - 1) setTutorialIdx((i) => i + 1);
    else {
      closeTutorial();
      goToRegisterFlow();
    }
  };

  const tutorialPrev = () => {
    if (tutorialIdx > 0) setTutorialIdx((i) => i - 1);
  };

  const el = (
    <div
      className="fixed inset-0 z-[9998] flex flex-col items-center justify-center px-5 text-center pointer-events-auto"
      style={{
        background:
          "radial-gradient(ellipse 120% 80% at 50% 0%, rgba(6,78,59,0.35) 0%, #020617 45%, #020617 100%)",
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="go-overlay-title"
    >
      <div className="pointer-events-none absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 60L60 0M-10 10L10 -10M50 70L70 50\' stroke=\'rgba(148,163,184,0.06)\' stroke-width=\'1\'/%3E%3C/svg%3E')]" />

      <div className="relative z-[1] w-full max-w-sm flex flex-col items-center">
        <img
          src="/logo.png"
          alt="AQOND"
          className="w-20 h-20 object-contain rounded-2xl shadow-lg shadow-emerald-500/20 mb-6"
          width={80}
          height={80}
        />

        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold text-emerald-200 mb-4">
          <Sparkles size={14} />
          Grand Opening · Bangkok 01:00
        </div>

        <h1 id="go-overlay-title" className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mb-2">
          นับถอยหลังสู่เปิดระบบ
        </h1>
        <p className="text-slate-400 text-sm max-w-xs mb-8 leading-relaxed">
          เตรียมพบกับมิติใหม่ของการจ้างงานและรับ-ส่งคน — เปิดระบบพร้อมกันทั่วประเทศ
        </p>

        <div className="grid grid-cols-4 gap-3 sm:gap-4 mb-10 w-full">
          {[
            { label: "วัน", v: go.days },
            { label: "ชม.", v: go.hours },
            { label: "นาที", v: go.minutes },
            { label: "วิ", v: go.seconds },
          ].map((u) => (
            <div
              key={u.label}
              className="rounded-2xl border border-white/10 bg-white/5 px-2 py-4 backdrop-blur-sm"
            >
              <div className="aqond-go-countdown-digit text-2xl sm:text-3xl font-black tabular-nums text-white">
                {u.label === "วัน" ? u.v : pad(u.v)}
              </div>
              <div className="text-[10px] text-slate-500 mt-1 font-bold uppercase tracking-wider">{u.label}</div>
            </div>
          ))}
        </div>

        <p className="text-xs text-amber-200/90 max-w-sm mb-4 px-2 leading-relaxed">
          สมัครก่อนเปิดระบบ รับค่าธรรมเนียม 0 บาท สำหรับ 10 งานแรก!
        </p>

        <button
          type="button"
          onClick={openTutorial}
          className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/35 bg-emerald-950/40 px-4 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-900/50 active:scale-[0.98] min-h-[44px]"
        >
          <BookOpen size={16} />
          ดูวิธีสมัครทีละขั้น (Tutorial)
        </button>

        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
          <button
            type="button"
            onClick={dismiss}
            className="flex-1 min-h-[48px] rounded-2xl bg-emerald-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-900/40 hover:bg-emerald-500 transition-colors touch-manipulation"
          >
            เข้าสู่แอป
          </button>
          <button
            type="button"
            onClick={goToRegisterFlow}
            className="flex-1 min-h-[48px] rounded-2xl border border-white/20 bg-white/5 py-3.5 text-sm font-bold text-white hover:bg-white/10 transition-colors touch-manipulation"
          >
            {isAuthenticated ? "ยืนยันตัวตน (KYC)" : "สมัครสมาชิก"}
          </button>
        </div>

        <button
          type="button"
          onClick={isAuthenticated ? goToProfileInfo : goToRegisterFlow}
          className="mt-4 text-xs text-slate-500 hover:text-emerald-300 transition-colors min-h-[44px] px-2"
        >
          {isAuthenticated
            ? "ดูสถานะยืนยันตัวตนในโปรไฟล์"
            : "สมัครแล้วไปยืนยันตัวตน (KYC) อัตโนมัติหลังสมัคร"}
        </button>
      </div>

      {/* Tutorial ทับด้านบน — อธิบายจนกดไปสมัครได้ */}
      {tutorialOpen && (
        <div
          className="absolute inset-0 z-[10] flex items-end sm:items-center justify-center p-4 bg-black/65 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="go-tutorial-title"
        >
          <div className="w-full max-w-md rounded-3xl border border-white/15 bg-slate-900/95 p-6 shadow-2xl text-left max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-2 mb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/90">
                  ขั้นตอน {tutorialIdx + 1} / {TUTORIAL_STEPS.length}
                </p>
                <h2 id="go-tutorial-title" className="text-lg font-bold text-white mt-1">
                  {TUTORIAL_STEPS[tutorialIdx].title}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeTutorial}
                className="p-2 rounded-xl text-slate-400 hover:bg-white/10 hover:text-white shrink-0"
                aria-label="ปิด"
              >
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
              {TUTORIAL_STEPS[tutorialIdx].body}
            </p>
            <div className="flex flex-col-reverse sm:flex-row gap-3 mt-8">
              <button
                type="button"
                onClick={tutorialPrev}
                disabled={tutorialIdx === 0}
                className="flex-1 min-h-[48px] inline-flex items-center justify-center gap-1 rounded-2xl border border-white/15 py-3 text-sm font-semibold text-slate-200 disabled:opacity-40 disabled:pointer-events-none touch-manipulation"
              >
                <ChevronLeft size={18} />
                ย้อนกลับ
              </button>
              <button
                type="button"
                onClick={tutorialNext}
                className="flex-1 min-h-[48px] inline-flex items-center justify-center gap-1 rounded-2xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-500 touch-manipulation"
              >
                {tutorialIdx < TUTORIAL_STEPS.length - 1 ? (
                  <>
                    ถัดไป
                    <ChevronRight size={18} />
                  </>
                ) : (
                  "ไปหน้าสมัครเลย"
                )}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-4 text-center">
              ปุ่มสุดท้ายจะปิดหน้านับถอยหลังและเปิดหน้าสมัครให้โดยอัตโนมัติ
            </p>
          </div>
        </div>
      )}
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(el, document.body);
};
