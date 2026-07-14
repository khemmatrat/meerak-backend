import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import {
  ChevronLeft,
  Loader2,
  Upload,
  Wand2,
  Play,
  Share2,
  Lock,
  Clapperboard,
  Sparkles,
} from "lucide-react";
import confetti from "canvas-confetti";
import { OverlayTemplatePicker } from "../components/growth/OverlayTemplatePicker";
import {
  fetchIncubationStatus,
  uploadIncubationRawVideo,
  composeIncubationClip,
  fetchIncubationOverlayVersion,
  EXPECTED_OVERLAY_VERSION,
  type IncubationBrief,
} from "../services/growthEngineService";
import { useNotification } from "../context/NotificationContext";

type LocState = {
  brief?: IncubationBrief | null;
  weekNo?: number;
};

export const ClipOverlayEditor: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { notify } = useNotification();
  const state = (location.state || {}) as LocState;

  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<
    Array<{ id: string; nameTh: string; preview: { bar: string; text: string } }>
  >([]);
  const [templateId, setTemplateId] = useState("pro_hire");
  const [brief, setBrief] = useState<IncubationBrief | null>(state.brief || null);
  const [weekNo, setWeekNo] = useState(state.weekNo || 1);
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [rawPreview, setRawPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [composedUrl, setComposedUrl] = useState<string | null>(null);
  const [overlaySkipped, setOverlaySkipped] = useState(false);
  const [overlayMeta, setOverlayMeta] = useState<{ ctaStart?: number; duration?: number; overlayMode?: string; overlayVersion?: number } | null>(
    null,
  );
  const [backendOverlayVersion, setBackendOverlayVersion] = useState<number | null>(null);
  const [incubationLocked, setIncubationLocked] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const st = await fetchIncubationStatus();
      setIncubationLocked(!!st.locked || !st.active);
      if (st.templates?.length) setTemplates(st.templates);
      if (st.currentWeek) setWeekNo(st.currentWeek);
      const ov = await fetchIncubationOverlayVersion();
      setBackendOverlayVersion(
        typeof ov.overlayVersion === "number" ? ov.overlayVersion : null,
      );
      if (!brief && st.active) {
        const { fetchIncubationBrief } = await import("../services/growthEngineService");
        const b = await fetchIncubationBrief(st.currentWeek);
        setBrief(b.brief);
        if (b.brief?.template_hint) setTemplateId(b.brief.template_hint);
      } else if (brief?.template_hint) {
        setTemplateId(brief.template_hint);
      }
    } finally {
      setLoading(false);
    }
  }, [brief]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (rawPreview?.startsWith("blob:")) URL.revokeObjectURL(rawPreview);
    };
  }, [rawPreview]);

  const onPickVideo = (file: File) => {
    if (!file.type.startsWith("video/")) {
      notify("เลือกไฟล์วิดีโอเท่านั้น", "warning");
      return;
    }
    if (file.size > 80 * 1024 * 1024) {
      notify("วิดีโอใหญ่เกินไป — ลองตัดให้สั้นกว่า 15 วินาที", "warning");
      return;
    }
    setRawFile(file);
    const url = URL.createObjectURL(file);
    setRawPreview(url);
    setComposedUrl(null);
    setOverlaySkipped(false);
    setOverlayMeta(null);
    notify("อัปโหลดแล้ว — ดู preview ก่อน→หลังด้านล่าง", "success");
  };

  const compose = async () => {
    if (!rawFile) {
      notify("เลือกหรือถ่ายวิดีโอก่อน", "warning");
      fileRef.current?.click();
      return;
    }
    setBusy(true);
    try {
      const rawUrl = await uploadIncubationRawVideo(rawFile);
      const result = await composeIncubationClip({
        raw_upload_url: rawUrl,
        template_id: templateId,
        cta_th: cta,
        week_no: weekNo,
      });
      setComposedUrl(`${result.composedUrl}${result.composedUrl.includes("?") ? "&" : "?"}v=${Date.now()}`);
      setOverlaySkipped(!!result.skippedOverlay);
      setOverlayMeta(result.overlayMeta || null);
      const v = result.overlayVersion ?? result.overlayMeta?.overlayVersion;
      const okPipeline =
        !result.skippedOverlay &&
        v === EXPECTED_OVERLAY_VERSION &&
        result.overlayMeta?.overlayMode === "tiktok_endcard";
      if (result.skippedOverlay) {
        const why =
          result.skipReason === "ffmpeg_unavailable"
            ? "ไม่พบ ffmpeg — ติดตั้ง ffmpeg แล้ว restart backend"
            : result.skipReason === "no_font"
              ? "ไม่พบฟอนต์ไทยสำหรับ overlay"
              : "ประกอบ overlay ไม่สำเร็จ — ได้คลิปดิบกลับมา (ไม่มีแคปชัน/CTA)";
        notify(why, "error");
      } else if (!okPipeline) {
        notify(
          "Backend ยังเป็นเวอร์ชันเก่า — restart backend แล้วประกอบใหม่",
          "error",
        );
      } else {
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.65 } });
        const ctaAt = result.overlayMeta?.ctaStart;
        notify(
          ctaAt != null
            ? `คลิปพร้อม! CTA ท้ายคลิปตั้งแต่วินาที ${Math.round(ctaAt)}`
            : "คลิปพร้อมโพสต์!",
          "success",
        );
      }
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "ประกอบคลิปไม่สำเร็จ", "error");
    } finally {
      setBusy(false);
    }
  };

  const shareToFeed = () => {
    navigate("/video-feed", {
      state: { incubationComposedUrl: composedUrl },
    });
  };

  const headline = brief?.headline_th || "AQOND Talent";
  const subtitle = brief?.hook_th || "";
  const script = brief?.script_th || "";
  const cta = brief?.cta_th || "จ้างงานคนนี้วันนี้ — ลด 20%";

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50/90 via-white to-violet-50/40 pb-32">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-100">
        <div className="px-4 py-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-xl hover:bg-slate-100"
            aria-label="กลับ"
          >
            <ChevronLeft size={22} className="text-slate-800" />
          </button>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0">
              <Clapperboard size={18} className="text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-slate-900 truncate text-base">Clip Studio</h1>
              <p className="text-[10px] text-violet-600 font-medium truncate flex items-center gap-1">
                <Sparkles size={10} />
                Hermes + ffmpeg · Product Promo สำหรับ Talent
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="animate-spin text-indigo-600" size={36} />
            <p className="text-sm text-slate-500">โหลดโจทย์ Hermes…</p>
          </div>
        ) : incubationLocked ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center space-y-4">
            <Lock size={40} className="mx-auto text-amber-600" />
            <p className="font-semibold text-slate-800">ยังไม่เข้าโปรแกรม Incubation</p>
            <p className="text-sm text-slate-600 leading-relaxed">
              ปลดล็อก AI Resume (ชวนเพื่อน 10/10) ก่อน — ระบบจะเริ่มนับ 90 วันอัตโนมัติ
            </p>
            <Link
              to="/referral?tab=ai"
              className="inline-block px-6 py-3 rounded-xl bg-violet-600 text-white font-semibold"
            >
              ไปหน้าชวนเพื่อน
            </Link>
          </div>
        ) : (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="video/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPickVideo(f);
              }}
            />

            {backendOverlayVersion != null && backendOverlayVersion < EXPECTED_OVERLAY_VERSION ? (
              <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 font-semibold">
                Backend overlay v{backendOverlayVersion} — ต้อง restart ให้เป็น v{EXPECTED_OVERLAY_VERSION} ก่อนประกอบคลิป
              </div>
            ) : null}

            {rawFile ? (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-xs text-emerald-800 font-medium flex-1 truncate">
                  {rawFile.name}
                </p>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="text-[11px] text-emerald-700 font-semibold underline shrink-0"
                >
                  เปลี่ยน
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full py-4 rounded-2xl bg-white border-2 border-indigo-200 shadow-sm font-semibold text-sm flex items-center justify-center gap-2 text-indigo-700 hover:border-indigo-400 transition-colors"
              >
                <Upload size={20} />
                เลือก / ถ่ายวิดีโอ 15 วินาที
              </button>
            )}

            <OverlayTemplatePicker
              templates={
                templates.length
                  ? templates
                  : [
                      {
                        id: "pro_hire",
                        nameTh: "น่าจ้าง — โปร",
                        preview: { bar: "#0f172a", text: "#fff" },
                      },
                      {
                        id: "pro_blue",
                        nameTh: "มืออาชีพ น้ำเงิน",
                        preview: { bar: "#1e3a8a", text: "#fff" },
                      },
                      {
                        id: "hiring_cta",
                        nameTh: "จ้างงานทันที",
                        preview: { bar: "#064e3b", text: "#fff" },
                      },
                    ]
              }
              selectedId={templateId}
              onSelect={setTemplateId}
              headline={headline}
              subtitle={subtitle}
              cta={cta}
              script={script}
              weekNo={weekNo}
              videoPreviewUrl={rawPreview}
              hasVideo={!!rawFile}
              onUploadClick={() => fileRef.current?.click()}
            />

            {composedUrl ? (
              <div className="rounded-2xl border border-emerald-200 bg-white shadow-lg overflow-hidden">
                {overlaySkipped || (overlayMeta?.overlayVersion != null && overlayMeta.overlayVersion < EXPECTED_OVERLAY_VERSION) ? (
                  <div className="px-4 py-3 bg-red-600 text-white text-sm font-semibold leading-snug">
                    {overlaySkipped
                      ? "ประกอบ overlay ไม่สำเร็จ — ได้คลิปดิบกลับมา"
                      : `คลิปนี้ประกอบด้วย backend เก่า (v${overlayMeta?.overlayVersion}) — กดประกอบใหม่หลัง restart`}
                  </div>
                ) : null}
                <div className="px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 flex items-center gap-2">
                  <Play size={16} className="text-white" />
                  <p className="text-sm font-bold text-white">
                    {overlaySkipped ? "คลิปดิบ (ไม่มี overlay)" : "คลิปพร้อมโพสต์"}
                  </p>
                </div>
                <video
                  src={composedUrl}
                  controls
                  playsInline
                  className="w-full bg-black max-h-72 object-contain"
                />
                {overlayMeta?.overlayMode === "tiktok_endcard" &&
                overlayMeta?.overlayVersion === EXPECTED_OVERLAY_VERSION &&
                !overlaySkipped ? (
                  <p className="px-4 pt-2 text-[11px] text-emerald-700 font-medium">
                    ✓ Overlay v{EXPECTED_OVERLAY_VERSION} — คลิปสะอาด · CTA ท้ายวินาที{" "}
                    {Math.round(overlayMeta.ctaStart || 0)}–
                    {Math.round(overlayMeta.duration || (overlayMeta.ctaStart || 0) + 3)}
                  </p>
                ) : null}
                <div className="p-3">
                  <button
                    type="button"
                    onClick={shareToFeed}
                    className="w-full py-3 rounded-xl bg-emerald-600 text-white font-bold flex items-center justify-center gap-2"
                  >
                    <Share2 size={18} />
                    ไป Video Feed
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* Sticky CTA — Instories gradient */}
      {!loading && !incubationLocked ? (
        <div className="fixed bottom-[4.5rem] left-0 right-0 z-20 px-4 pb-2 pt-3 bg-gradient-to-t from-white via-white/95 to-transparent">
          <button
            type="button"
            disabled={busy || !rawFile}
            onClick={() => void compose()}
            className="w-full max-w-lg mx-auto py-4 rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-fuchsia-600 text-white font-bold flex items-center justify-center gap-2 shadow-xl shadow-indigo-300/40 disabled:opacity-45 disabled:shadow-none active:scale-[0.99] transition-transform"
          >
            {busy ? (
              <>
                <Loader2 className="animate-spin" size={22} />
                กำลังประกอบคลิป…
              </>
            ) : (
              <>
                <Wand2 size={22} />
                {rawFile ? "ประกอบคลิปคลิกเดียว" : "อัปโหลดวิดีโอก่อน"}
              </>
            )}
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default ClipOverlayEditor;
