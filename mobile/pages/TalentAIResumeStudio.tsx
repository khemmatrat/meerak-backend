import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  Loader2,
  Sparkles,
  Play,
  Lock,
  Briefcase,
  Star,
  CheckCircle2,
  RefreshCw,
  Upload,
  User,
  Video,
} from "lucide-react";
import { AIResumeVideoWizard } from "../components/growth/AIResumeVideoWizard";
import {
  fetchTalentVideoEntitlement,
  startTalentVideoGeneration,
  pollTalentVideoJob,
} from "../services/talentVideoService";
import {
  fetchTalentResumeDraft,
  publishTalentResume,
  type TalentResumeDraft,
  type TalentResumeProfileContext,
} from "../services/talentResumeService";
import { uploadDocumentToSecure } from "../services/secureDocumentUploadService";
import { shrinkImageForDocumentUpload } from "../utils/shrinkImageForDocumentUpload";
import { useNotification } from "../context/NotificationContext";
import { useAuth } from "../context/AuthContext";

type TabId = "profile" | "video";

export const TalentAIResumeStudio: React.FC = () => {
  const navigate = useNavigate();
  const { notify } = useNotification();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(true);
  const [credits, setCredits] = useState(0);
  const [tab, setTab] = useState<TabId>("profile");

  const [profileCtx, setProfileCtx] = useState<TalentResumeProfileContext | null>(null);
  const [draft, setDraft] = useState<TalentResumeDraft | null>(null);
  const [aiSources, setAiSources] = useState<string>("");
  const [draftLoading, setDraftLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);

  const [script, setScript] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"idle" | "generating" | "done">("idle");
  const [outputUrl, setOutputUrl] = useState<string | null>(null);

  const loadEntitlement = useCallback(async () => {
    const ent = await fetchTalentVideoEntitlement();
    setLocked(!!ent.locked);
    setCredits(ent.creditsRemaining ?? 0);
    return ent;
  }, []);

  const loadDraft = useCallback(async () => {
    setDraftLoading(true);
    try {
      const res = await fetchTalentResumeDraft();
      setProfileCtx(res.profile);
      setDraft(res.draft);
      setScript(res.draft.video_script_th || "");
      const src = res.sources;
      const parts = [src?.structure, src?.prose].filter(Boolean);
      setAiSources(parts.length ? parts.join(" + ") : res.draft.source || "AI");
      if (res.profile.avatar_url && !previewUrl) {
        setPreviewUrl(res.profile.avatar_url);
        setAvatarUrl(res.profile.avatar_url);
      }
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "โหลด AI Resume ไม่สำเร็จ", "error");
    } finally {
      setDraftLoading(false);
    }
  }, [notify]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await loadEntitlement();
      await loadDraft();
    } finally {
      setLoading(false);
    }
  }, [loadEntitlement, loadDraft]);

  useEffect(() => {
    void load();
  }, [load]);

  const onPickPhoto = async (file: File) => {
    try {
      const shrunk = await shrinkImageForDocumentUpload(file);
      const { url } = await uploadDocumentToSecure(shrunk, "talent_ai_avatar");
      setAvatarUrl(url);
      setPreviewUrl(url);
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "อัปโหลดรูปไม่สำเร็จ", "error");
    }
  };

  const publishProfile = async (withVideo?: string) => {
    if (!draft) return;
    setPublishing(true);
    try {
      await publishTalentResume({
        headline_th: draft.headline_th,
        about_th: draft.about_th,
        video_script_th: script,
        skills_highlight: draft.skills_highlight,
        experience_highlight: draft.experience_highlight,
        greeting_video_url: withVideo,
      });
      setPublished(true);
      confetti({ particleCount: 60, spread: 60, origin: { y: 0.5 } });
      notify("เผยแพร่โปรไฟล์แล้ว — ลูกค้าเห็นได้ทันที", "success");
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "เผยแพร่ไม่สำเร็จ", "error");
    } finally {
      setPublishing(false);
    }
  };

  const generateVideo = async (opts?: { character?: string }) => {
    if (locked || credits <= 0) {
      notify("ยังล็อกอยู่ — ชวนเพื่อน 10 คนก่อน", "warning");
      navigate("/referral?tab=ai");
      return;
    }
    if (!avatarUrl) {
      notify("เลือกรูปเซลฟี่ก่อน", "warning");
      return;
    }
    if (!script.trim()) {
      notify("กรอกสคริปต์ก่อน", "warning");
      return;
    }

    setBusy(true);
    setPhase("generating");
    setOutputUrl(null);
    try {
      const { jobId } = await startTalentVideoGeneration({
        script_text: script.trim(),
        avatar_url: avatarUrl,
        character: opts?.character,
      });
      notify("Hermes + AI Studio กำลังสร้างวิดีโอ…", "info");
      const job = await pollTalentVideoJob(jobId, {
        intervalMs: 4000,
        maxAttempts: 90,
      });
      if (job.status === "failed") {
        throw new Error(job.error_message || "สร้างวิดีโอไม่สำเร็จ");
      }
      const url = job.output_url || null;
      setOutputUrl(url);
      setPhase("done");
      setCredits((c) => Math.max(0, c - 1));
      confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
      notify("วิดีโอพร้อม — กดเผยแพร่โปรไฟล์", "success");
      if (url) {
        await publishProfile(url);
      }
    } catch (e: unknown) {
      setPhase("idle");
      notify(e instanceof Error ? e.message : "สร้างไม่สำเร็จ", "error");
    } finally {
      setBusy(false);
    }
  };

  const displayName = profileCtx?.talent_name || user?.name || "Talent";
  const avatar = previewUrl || profileCtx?.avatar_url || user?.avatar_url;
  const score = draft?.completeness_score ?? 0;

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 gap-3">
        <Loader2 className="animate-spin text-emerald-400" size={36} />
        <p className="text-sm text-white/50">Hermes + Qwen กำลังร่างโปรไฟล์…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-28">
      <header className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur border-b border-white/10">
        <div className="flex items-center gap-3 px-4 py-3">
          <button type="button" onClick={() => navigate(-1)} aria-label="กลับ">
            <ChevronLeft size={24} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-base truncate">AI Resume Studio</h1>
            <p className="text-[10px] text-emerald-400/90 truncate">
              Hermes โครงสร้าง • Qwen ภาษาไทย • ระดับ LinkedIn
            </p>
          </div>
          {!locked ? (
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-1 rounded-full shrink-0">
              เครดิต {credits}
            </span>
          ) : null}
        </div>

        {!locked ? (
          <div className="flex border-t border-white/5">
            {(
              [
                { id: "profile" as TabId, label: "โปรไฟล์", icon: User },
                { id: "video" as TabId, label: "วิดีโอ AI", icon: Video },
              ] as const
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                  tab === id
                    ? "border-emerald-400 text-emerald-300"
                    : "border-transparent text-white/45"
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-5">
        {locked ? (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-6 text-center">
            <Lock className="mx-auto text-amber-400 mb-3" size={40} />
            <p className="font-semibold text-lg">ปลดล็อก AI Resume Premium</p>
            <p className="text-sm text-white/70 mt-2 leading-relaxed">
              ชวนเพื่อน 10 คนเปิด Wallet — ได้โปรไฟล์ AI ระดับ LinkedIn + วิดีโอพูดได้ 2 คลิป
            </p>
            <Link
              to="/referral?tab=ai"
              className="inline-block mt-5 px-8 py-3.5 rounded-xl bg-amber-500 text-slate-900 font-bold"
            >
              ไปหน้าชวนเพื่อน
            </Link>
          </div>
        ) : tab === "profile" ? (
          <>
            {/* LinkedIn-style preview card */}
            <div className="rounded-2xl overflow-hidden border border-white/10 bg-white shadow-xl">
              <div className="h-20 bg-gradient-to-r from-emerald-700 via-teal-600 to-cyan-700" />
              <div className="px-4 pb-4 -mt-10">
                <div className="flex items-end gap-3">
                  <div className="w-20 h-20 rounded-2xl ring-4 ring-white overflow-hidden bg-slate-200 shrink-0">
                    {avatar ? (
                      <img src={avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-slate-300 text-slate-500">
                        <User size={32} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 pb-1">
                    <p className="font-bold text-slate-900 text-lg leading-tight truncate">
                      {displayName}
                    </p>
                    {draftLoading ? (
                      <Loader2 className="animate-spin text-slate-400 mt-1" size={16} />
                    ) : (
                      <p className="text-sm text-slate-600 leading-snug line-clamp-2 mt-0.5">
                        {draft?.headline_th || "—"}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-3">
                  {(profileCtx?.completed_jobs_count ?? 0) > 0 ? (
                    <span className="inline-flex items-center gap-1 text-[11px] bg-slate-100 text-slate-700 px-2 py-1 rounded-full">
                      <Briefcase size={11} />
                      {profileCtx?.completed_jobs_count} งานสำเร็จ
                    </span>
                  ) : null}
                  {profileCtx?.rating ? (
                    <span className="inline-flex items-center gap-1 text-[11px] bg-amber-50 text-amber-800 px-2 py-1 rounded-full">
                      <Star size={11} className="fill-amber-400 text-amber-400" />
                      {Number(profileCtx.rating).toFixed(1)}
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1 text-[11px] bg-emerald-50 text-emerald-800 px-2 py-1 rounded-full">
                    <CheckCircle2 size={11} />
                    AQOND Talent
                  </span>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                      เกี่ยวกับ
                    </p>
                    <span className="text-[10px] text-slate-400">
                      ความสมบูรณ์ {score}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mb-2">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: `${score}%` }}
                    />
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {draft?.about_th || "—"}
                  </p>
                </div>

                {draft?.skills_highlight?.length ? (
                  <div className="mt-4">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                      ทักษะ
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {draft.skills_highlight.map((s) => (
                        <span
                          key={s}
                          className="text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg font-medium"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {draft?.experience_highlight?.length ? (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                      ประสบการณ์
                    </p>
                    {draft.experience_highlight.map((exp, i) => (
                      <div key={i} className="border-l-2 border-emerald-500 pl-3">
                        <p className="text-sm font-semibold text-slate-800">{exp.title}</p>
                        <p className="text-xs text-slate-500">{exp.company}</p>
                        {exp.bullet ? (
                          <p className="text-xs text-slate-600 mt-0.5">{exp.bullet}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            {/* AI meta */}
            <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-3 flex items-start gap-3">
              <Sparkles size={18} className="text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-emerald-300">
                  สร้างโดย {aiSources || "Hermes + Qwen"}
                </p>
                {draft?.coaching_tip_th ? (
                  <p className="text-xs text-white/55 mt-1 leading-relaxed">
                    {draft.coaching_tip_th}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                disabled={draftLoading}
                onClick={() => void loadDraft()}
                className="shrink-0 p-2 rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-50"
                aria-label="สร้างใหม่"
              >
                <RefreshCw
                  size={16}
                  className={draftLoading ? "animate-spin" : ""}
                />
              </button>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={publishing || !draft}
                onClick={() => void publishProfile()}
                className="flex-1 py-3.5 rounded-xl bg-emerald-600 font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {publishing ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : published ? (
                  <CheckCircle2 size={18} />
                ) : (
                  <Upload size={18} />
                )}
                {published ? "เผยแพร่แล้ว" : "เผยแพร่โปรไฟล์"}
              </button>
              <Link
                to={`/talents/${profileCtx?.user_id || user?.id}`}
                className="px-4 py-3.5 rounded-xl bg-white/10 border border-white/15 text-sm font-semibold flex items-center justify-center"
              >
                ดูหน้าจ้าง
              </Link>
            </div>

            <button
              type="button"
              onClick={() => setTab("video")}
              className="w-full py-3 rounded-xl border border-violet-500/40 bg-violet-500/10 text-violet-200 text-sm font-semibold flex items-center justify-center gap-2"
            >
              <Video size={16} />
              ขั้นต่อไป — สร้างวิดีโอแนะนำตัว AI
            </button>

            <Link
              to="/talent/incubation"
              className="block text-center text-xs text-white/40 underline"
            >
              Incubation 90 วัน — คลิปรายสัปดาห์
            </Link>
          </>
        ) : (
          <>
            <AIResumeVideoWizard
              draft={draft}
              displayName={displayName}
              previewUrl={previewUrl}
              script={script}
              onScriptChange={setScript}
              onPickPhoto={onPickPhoto}
              busy={busy || phase === "generating"}
              outputUrl={outputUrl}
              onGenerate={(o) => void generateVideo({ character: o.character })}
            />

            {outputUrl && phase === "done" ? (
              <div className="flex gap-2">
                <a
                  href={outputUrl}
                  download
                  className="flex-1 py-3 rounded-xl bg-white/10 border border-white/15 text-center text-sm font-semibold"
                >
                  ดาวน์โหลด
                </a>
                <Link
                  to="/video-feed"
                  className="flex-1 py-3 rounded-xl bg-emerald-600 text-center text-sm font-semibold flex items-center justify-center gap-1"
                >
                  <Play size={14} />
                  Video Feed
                </Link>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
};

export default TalentAIResumeStudio;
