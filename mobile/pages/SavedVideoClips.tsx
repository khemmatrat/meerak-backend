/**
 * คลิปที่บันทึกไว้จากฟีดวิดีโอ — ดึงจาก GET /api/videos/saved
 */
import React, { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Bookmark, Loader2, User } from "lucide-react";
import { videoService, type TalentVideo } from "../services/videoService";
import { isSponsoredVideo } from "../services/adsService";
import { SavedClipPreview } from "../components/SavedClipPreview";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";

const SavedVideoClips: React.FC = () => {
  const { user } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [list, setList] = useState<TalentVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSaved = useCallback(async () => {
    if (!user?.id) {
      setList([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const videos = await videoService.listSavedVideos();
      setList(videos);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ||
        (e as Error)?.message ||
        "";
      setError(
        msg ||
          (language === "en"
            ? "Could not load saved clips"
            : "โหลดคลิปที่บันทึกไม่สำเร็จ"),
      );
    } finally {
      setLoading(false);
    }
  }, [user?.id, language]);

  useEffect(() => {
    void loadSaved();
  }, [loadSaved, location.key]);

  useEffect(() => {
    const onSavedChanged = () => {
      void loadSaved();
    };
    window.addEventListener("aqond:saved-clips-changed", onSavedChanged);
    return () =>
      window.removeEventListener("aqond:saved-clips-changed", onSavedChanged);
  }, [loadSaved]);

  const openInFeed = (v: TalentVideo) => {
    if (v.mixKind === "sponsored" || isSponsoredVideo(v)) {
      navigate("/video-feed", { state: { initialVideo: v } });
      return;
    }
    navigate(`/video-feed?video=${encodeURIComponent(v.id)}`);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-24">
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200/80 bg-white/95 px-4 py-3 backdrop-blur-sm">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100"
          aria-label={language === "en" ? "Back" : "กลับ"}
        >
          <ArrowLeft size={22} />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
            <Bookmark
              size={20}
              className="fill-emerald-600/25"
              strokeWidth={2}
            />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold text-slate-900">
              {language === "en" ? "Saved clips" : "คลิปที่บันทึก"}
            </h1>
            <p className="truncate text-xs text-slate-500">
              {language === "en"
                ? list.length > 0
                  ? `${list.length} clip${list.length === 1 ? "" : "s"} saved — scroll for more`
                  : "Clips you saved from the video feed."
                : list.length > 0
                  ? `บันทึกแล้ว ${list.length} คลิป — เลื่อนลงดูเพิ่มได้`
                  : "คลิปที่คุณกดบันทึกจากแหล่งศูนย์รวม"}
            </p>
          </div>
        </div>
        <Link
          to="/video-feed"
          className="shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50"
        >
          {language === "en" ? "Feed" : "ฟีด"}
        </Link>
      </div>

      {!user?.id ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="text-slate-600">
            {language === "en"
              ? "Sign in to see saved clips."
              : "เข้าสู่ระบบเพื่อดูคลิปที่บันทึก"}
          </p>
        </div>
      ) : loading ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16">
          <Loader2 size={36} className="animate-spin text-indigo-500" />
          <p className="text-sm text-slate-500">
            {language === "en" ? "Loading…" : "กำลังโหลด…"}
          </p>
        </div>
      ) : error ? (
        <div className="mx-4 mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <Bookmark size={32} strokeWidth={1.75} />
          </div>
          <p className="font-semibold text-slate-800">
            {language === "en" ? "No saved clips yet" : "ยังไม่มีคลิปที่บันทึก"}
          </p>
          <p className="mt-2 max-w-xs text-sm text-slate-600">
            {language === "en"
              ? "Open the feed and tap the bookmark icon on a clip."
              : "ไปที่ฟีดแล้วกดไอคอนที่บันทึกด้านขวาของคลิป"}
          </p>
          <Link
            to="/video-feed"
            className="mt-6 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            {language === "en" ? "Browse feed" : "ไปฟีดวิดีโอ"}
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
          {list.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => openInFeed(v)}
                className="flex w-full flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white text-left shadow-sm ring-1 ring-black/5 transition hover:border-indigo-200 hover:shadow-md active:scale-[0.98]"
              >
                <div className="relative aspect-[9/16] w-full overflow-hidden bg-slate-900">
                  <SavedClipPreview video={v} />
                  <span className="absolute bottom-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white">
                    <Bookmark
                      size={14}
                      className="fill-white/90"
                      strokeWidth={2}
                    />
                  </span>
                </div>
                <div className="min-w-0 p-3">
                  <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-slate-900">
                    {v.title?.trim()
                      ? v.title
                      : language === "en"
                        ? "Untitled clip"
                        : "คลิปไม่มีชื่อ"}
                  </p>
                  {(v.talent_name || v.talent_id || v.mixKind === "sponsored") && (
                    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                      <User size={12} />
                      <span className="truncate">
                        @
                        {v.mixKind === "sponsored"
                          ? language === "en"
                            ? "Promoted"
                            : "โปรโมต"
                          : v.talent_name || "Talent"}
                      </span>
                    </div>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default SavedVideoClips;
