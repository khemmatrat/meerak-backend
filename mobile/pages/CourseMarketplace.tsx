import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark, Filter, GraduationCap, TrendingUp, Flame, WalletCards } from "lucide-react";
import {
  getCourseMarketplaceHealth,
  listMarketplaceCourses,
  listMyCourses,
  listSavedMarketplaceCourses,
  listSavedMarketplaceCourseIds,
  saveMarketplaceCourse,
  unsaveMarketplaceCourse,
  type CourseMarketplaceEmptyReason,
  type MarketplaceCourse,
} from "../services/courseMarketplaceService";
import CourseMarketplaceCard from "../components/courseMarketplace/CourseMarketplaceCard";
import CourseMarketplaceSkeleton from "../components/courseMarketplace/CourseMarketplaceSkeleton";
import CourseFlowHeader from "../components/courseMarketplace/CourseFlowHeader";
import { trackCourseFunnelBatch } from "../utils/courseFunnelAnalytics";
import { useNotification } from "../context/NotificationContext";

type CatalogTab = "all" | "saved" | "mine";
type PriceFilter = "" | "free" | "500" | "1000";

const LEVEL_OPTIONS = [
  { id: "", label: "ทุกระดับ" },
  { id: "beginner", label: "เริ่มต้น" },
  { id: "intermediate", label: "กลาง" },
  { id: "advanced", label: "สูง" },
];

const LANGUAGE_OPTIONS = [
  { id: "", label: "ทุกภาษา" },
  { id: "th", label: "ไทย" },
  { id: "en", label: "English" },
];

const PRICE_OPTIONS: { id: PriceFilter; label: string }[] = [
  { id: "", label: "ทุกราคา" },
  { id: "free", label: "ฟรี" },
  { id: "500", label: "≤ ฿500" },
  { id: "1000", label: "≤ ฿1,000" },
];

function CourseRail({
  title,
  icon,
  courses,
  enrolledIds,
  savedIds,
  onSaveChange,
}: {
  title: string;
  icon: React.ReactNode;
  courses: MarketplaceCourse[];
  enrolledIds: Set<string>;
  savedIds: Set<string>;
  onSaveChange?: (courseId: string, saved: boolean) => void;
}) {
  if (!courses.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-slate-100 inline-flex items-center gap-2 px-1">
        {icon} {title}
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {courses.map((course) => (
          <div key={course.id} className="shrink-0 w-[260px]">
            <CourseMarketplaceCard
              course={course}
              enrolled={enrolledIds.has(course.id)}
              saved={savedIds.has(course.id)}
              onSaveChange={onSaveChange}
              compact
            />
          </div>
        ))}
      </div>
    </section>
  );
}

export default function CourseMarketplace() {
  const { notify } = useNotification();
  const [tab, setTab] = useState<CatalogTab>("all");
  const [courses, setCourses] = useState<MarketplaceCourse[]>([]);
  const [savedCourses, setSavedCourses] = useState<MarketplaceCourse[]>([]);
  const [myCourses, setMyCourses] = useState<MarketplaceCourse[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [level, setLevel] = useState("");
  const [language, setLanguage] = useState("");
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("");
  const [sort, setSort] = useState("featured");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [emptyReason, setEmptyReason] = useState<CourseMarketplaceEmptyReason | null>(null);
  const [healthHint, setHealthHint] = useState("");
  const [demoCourseIds, setDemoCourseIds] = useState({ paid: "aqond-service-business-starter", free: "aqond-marketplace-free-preview" });

  const hasActiveFilters = Boolean(query.trim() || category || level || language || priceFilter);

  const catalogParams = useMemo(() => {
    const params: Record<string, string> = { sort };
    if (query.trim()) params.q = query.trim();
    if (category) params.category = category;
    if (level) params.level = level;
    if (language) params.language = language;
    if (priceFilter === "free") {
      params.price_max = "0";
    } else if (priceFilter) {
      params.price_max = priceFilter;
    }
    return params;
  }, [query, category, level, language, priceFilter, sort]);

  const refreshSavedIds = useCallback(async () => {
    try {
      const ids = await listSavedMarketplaceCourseIds();
      setSavedIds(new Set(ids));
    } catch {
      setSavedIds(new Set());
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        setLoadError("");
        setEmptyReason(null);
        const [health, catalog, mine, saved, ids] = await Promise.all([
          getCourseMarketplaceHealth().catch(() => null),
          listMarketplaceCourses(catalogParams),
          listMyCourses().catch(() => []),
          listSavedMarketplaceCourses().catch(() => []),
          listSavedMarketplaceCourseIds().catch(() => []),
        ]);
        if (!alive) return;
        setCourses(catalog);
        setMyCourses(mine);
        setSavedCourses(saved);
        setSavedIds(new Set(ids));
        if (health?.demoCourseIds?.paid || health?.paidDemoCourseId) {
          setDemoCourseIds({
            paid: health.demoCourseIds?.paid || health.paidDemoCourseId || "aqond-service-business-starter",
            free: health.demoCourseIds?.free || health.freeDemoCourseId || "aqond-marketplace-free-preview",
          });
        }
        if (health?.hint) setHealthHint(health.hint);

        const routesReady = health?.marketplaceRoutes !== false && health?.ok !== false;
        if (!routesReady && health?.hint) {
          setEmptyReason("api_unavailable");
          setLoadError(health.hint);
          return;
        }
        if (catalog.length === 0 && tab === "all") {
          if (hasActiveFilters) {
            setEmptyReason("filter_no_match");
          } else if ((health?.publishedCourses ?? catalog.length) === 0) {
            setEmptyReason("empty_catalog");
          } else {
            setEmptyReason("filter_no_match");
          }
        }
      } catch (e: any) {
        if (!alive) return;
        setCourses([]);
        setEmptyReason("api_unavailable");
        setLoadError(
          e?.response?.status === 404
            ? "marketplace route ยังไม่พร้อม — restart backend (node server.js) หลัง migrate"
            : "โหลดตลาดคอร์สไม่สำเร็จ",
        );
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [catalogParams, hasActiveFilters, tab]);

  useEffect(() => {
    if (!courses.length || loading || tab !== "all") return;
    trackCourseFunnelBatch(
      courses.slice(0, 12).map((c) => ({
        courseId: c.id,
        eventType: "course_impression" as const,
        metadata: { source: "marketplace_list" },
      })),
    );
  }, [courses, loading, tab]);

  const categories = useMemo(() => {
    const set = new Set(courses.map((c) => c.category).filter(Boolean) as string[]);
    return Array.from(set);
  }, [courses]);
  const enrolledIds = useMemo(() => new Set(myCourses.map((c) => c.id)), [myCourses]);

  const trendingCourses = useMemo(
    () => courses.filter((c) => (c.badges || []).some((b) => b.id === "trending")).slice(0, 8),
    [courses],
  );
  const bestsellerCourses = useMemo(
    () => courses.filter((c) => (c.badges || []).some((b) => b.id === "bestseller")).slice(0, 8),
    [courses],
  );
  const coachRecommended = useMemo(
    () => courses.filter((c) => (c.badges || []).some((b) => b.id === "coach_recommended")).slice(0, 8),
    [courses],
  );

  const displayCourses = tab === "saved" ? savedCourses : tab === "mine" ? myCourses : courses;
  const showRails = tab === "all" && !loading && emptyReason !== "api_unavailable" && !loadError && !query && !category && !level && !language && !priceFilter;

  const handleSaveChange = async (courseId: string, nextSaved: boolean) => {
    try {
      if (nextSaved) {
        await saveMarketplaceCourse(courseId);
        notify("บันทึกคอร์สแล้ว", "success");
      } else {
        await unsaveMarketplaceCourse(courseId);
        notify("ลบออกจากที่บันทึกแล้ว", "info");
      }
      await refreshSavedIds();
      if (tab === "saved" && !nextSaved) {
        setSavedCourses((prev) => prev.filter((c) => c.id !== courseId));
      } else if (nextSaved) {
        const found = courses.find((c) => c.id === courseId);
        if (found) setSavedCourses((prev) => [found, ...prev.filter((c) => c.id !== courseId)]);
      }
      setCourses((prev) => prev.map((c) => (c.id === courseId ? { ...c, saved: nextSaved } : c)));
    } catch (e: any) {
      if (e?.response?.status === 401) {
        notify("เข้าสู่ระบบก่อนบันทึกคอร์ส", "warning");
      } else {
        notify("บันทึกคอร์สไม่สำเร็จ", "error");
      }
    }
  };

  return (
    <div className="aqond-trust-theme course-flow-theme min-h-screen pb-24 space-y-6">
      <CourseFlowHeader title="ตลาดคอร์ส" backTo="/" backLabel="หน้าหลัก" />
      <section className="course-flow-hero rounded-[32px] p-6 bg-gradient-to-br from-emerald-600 via-teal-600 to-slate-900 text-white shadow-xl">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-2xl bg-white/15">
            <GraduationCap size={34} />
          </div>
          <div>
            <p className="text-sm opacity-80">AQOND Courses Marketplace</p>
            <h1 className="text-3xl font-black leading-tight">เรียนทักษะบริการ แล้วขายงานได้เก่งขึ้น</h1>
            <p className="text-sm opacity-90 mt-2">Preview ฟรี · การันตีคืนเงิน 7 วัน · จ่ายด้วย Wallet 1-tap</p>
            <Link to="/courses/aqond-marketplace-free-preview" className="inline-flex mt-3 text-sm font-bold underline opacity-90">
              ทดสอบคอร์สฟรี 0 บาท →
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-5 text-center text-xs">
          <div className="rounded-2xl bg-white/12 p-3">
            <p className="text-lg font-bold">{courses.length}</p>
            <p>คอร์สขายอยู่</p>
          </div>
          <div className="rounded-2xl bg-white/12 p-3">
            <p className="text-lg font-bold">{savedIds.size}</p>
            <p>บันทึกไว้</p>
          </div>
          <div className="rounded-2xl bg-white/12 p-3">
            <WalletCards className="mx-auto" size={20} />
            <p>จ่ายด้วย Wallet</p>
          </div>
        </div>
      </section>

      <section className="flex gap-2 overflow-x-auto pb-1 px-1">
        {(
          [
            { id: "all" as const, label: "ทั้งหมด" },
            { id: "saved" as const, label: `บันทึก (${savedIds.size})` },
            { id: "mine" as const, label: `ของฉัน (${myCourses.length})` },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap ${
              tab === item.id ? "bg-emerald-500 text-white" : "bg-slate-800 text-slate-300"
            }`}
          >
            {item.id === "saved" ? (
              <span className="inline-flex items-center gap-1">
                <Bookmark size={14} /> {item.label}
              </span>
            ) : (
              item.label
            )}
          </button>
        ))}
      </section>

      {showRails ? (
        <>
          <CourseRail
            title="Trending ตอนนี้"
            icon={<TrendingUp size={18} className="text-rose-300" />}
            courses={trendingCourses}
            enrolledIds={enrolledIds}
            savedIds={savedIds}
            onSaveChange={handleSaveChange}
          />
          <CourseRail
            title="ขายดี"
            icon={<Flame size={18} className="text-amber-300" />}
            courses={bestsellerCourses}
            enrolledIds={enrolledIds}
            savedIds={savedIds}
            onSaveChange={handleSaveChange}
          />
          {coachRecommended.length ? (
            <CourseRail
              title="โค้ชแนะนำ"
              icon={<GraduationCap size={18} className="text-indigo-300" />}
              courses={coachRecommended}
              enrolledIds={enrolledIds}
              savedIds={savedIds}
              onSaveChange={handleSaveChange}
            />
          ) : null}
        </>
      ) : null}

      {tab === "all" ? (
        <section className="luxury-card rounded-3xl p-4 space-y-3">
          <div className="flex items-center gap-2 rounded-2xl bg-slate-900/70 border border-slate-700 px-3 py-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาคอร์ส เช่น การขายบริการ, ทำความสะอาด, ภาษา"
              className="bg-transparent outline-none text-slate-100 placeholder:text-slate-500 flex-1 text-sm"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setCategory("")}
              className={`px-3 py-1.5 rounded-full text-sm ${!category ? "bg-emerald-500 text-white" : "bg-slate-800 text-slate-300"}`}
            >
              ทุกหมวด
            </button>
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${category === c ? "bg-emerald-500 text-white" : "bg-slate-800 text-slate-300"}`}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {LEVEL_OPTIONS.map((opt) => (
              <button
                key={opt.id || "all-level"}
                type="button"
                onClick={() => setLevel(opt.id)}
                className={`px-3 py-1.5 rounded-full text-xs ${level === opt.id ? "bg-teal-600 text-white" : "bg-slate-800 text-slate-300"}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {LANGUAGE_OPTIONS.map((opt) => (
              <button
                key={opt.id || "all-lang"}
                type="button"
                onClick={() => setLanguage(opt.id)}
                className={`px-3 py-1.5 rounded-full text-xs ${language === opt.id ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-300"}`}
              >
                {opt.label}
              </button>
            ))}
            {PRICE_OPTIONS.map((opt) => (
              <button
                key={opt.id || "all-price"}
                type="button"
                onClick={() => setPriceFilter(opt.id)}
                className={`px-3 py-1.5 rounded-full text-xs ${priceFilter === opt.id ? "bg-amber-600 text-white" : "bg-slate-800 text-slate-300"}`}
              >
                {opt.label}
              </button>
            ))}
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="ml-auto px-3 py-1.5 rounded-full bg-slate-800 text-slate-300 text-sm"
            >
              <option value="featured">แนะนำ</option>
              <option value="newest">ใหม่ล่าสุด</option>
              <option value="rating">คะแนนสูง</option>
              <option value="price_low">ราคาต่ำ</option>
              <option value="price_high">ราคาสูง</option>
            </select>
          </div>
        </section>
      ) : null}

      {loading ? (
        <CourseMarketplaceSkeleton variant={tab === "saved" ? "saved" : "grid"} />
      ) : loadError && tab === "all" ? (
        <div className="luxury-card rounded-3xl p-8 text-center">
          <Filter className="mx-auto text-amber-300" />
          <h2 className="text-xl font-bold text-slate-100 mt-3">ตลาดคอร์สยังไม่พร้อม</h2>
          <p className="text-slate-400 text-sm mt-1">{loadError}</p>
          {healthHint && healthHint !== loadError ? (
            <p className="text-slate-500 text-xs mt-2">{healthHint}</p>
          ) : null}
          <div className="flex justify-center gap-2 mt-4 flex-wrap">
            <Link to="/training/dashboard" className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold">
              Training Dashboard
            </Link>
            <Link to="/course-studio" className="px-4 py-2 rounded-xl bg-slate-800 text-slate-100 font-bold">
              Course Studio
            </Link>
          </div>
        </div>
      ) : displayCourses.length === 0 ? (
        <div className="luxury-card rounded-3xl p-8 text-center">
          <Filter className="mx-auto text-slate-400" />
          <h2 className="text-xl font-bold text-slate-100 mt-3">
            {tab === "saved"
              ? "ยังไม่มีคอร์สที่บันทึกไว้"
              : tab === "mine"
                ? "ยังไม่มีคอร์สที่ซื้อ/ลงทะเบียน"
                : emptyReason === "filter_no_match" || hasActiveFilters
                  ? "ยังไม่พบคอร์สที่ตรงกับตัวกรอง"
                  : emptyReason === "empty_catalog"
                    ? "ยังไม่มีคอร์สที่เปิดขาย"
                    : "ยังไม่พบคอร์สในตลาด"}
          </h2>
          {emptyReason === "empty_catalog" && tab === "all" ? (
            <p className="text-slate-400 text-sm mt-2">ลองคอร์ส demo ฟรีหรือเริ่มลงขายคอร์สแรกของคุณ</p>
          ) : null}
          <div className="flex justify-center gap-2 mt-4 flex-wrap">
            {tab === "all" && emptyReason === "empty_catalog" ? (
              <>
                <Link
                  to={`/courses/${demoCourseIds.free}`}
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold"
                >
                  ทดสอบคอร์สฟรี 0 บาท
                </Link>
                <Link
                  to={`/courses/${demoCourseIds.paid}`}
                  className="px-4 py-2 rounded-xl bg-teal-700 text-white font-bold"
                >
                  ดูคอร์ส demo 499 บาท
                </Link>
                <Link to="/course-studio" className="px-4 py-2 rounded-xl bg-slate-800 text-slate-100 font-bold">
                  ลงขายคอร์ส
                </Link>
                <Link to="/training/dashboard" className="px-4 py-2 rounded-xl bg-indigo-700 text-white font-bold">
                  Training Dashboard
                </Link>
              </>
            ) : tab === "all" ? (
              <>
                {(emptyReason === "filter_no_match" || hasActiveFilters) ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setCategory("");
                      setLevel("");
                      setLanguage("");
                      setPriceFilter("");
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-100 font-bold"
                  >
                    ล้างตัวกรอง
                  </button>
                ) : null}
                <Link to="/course-studio" className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold">
                  ลงขายคอร์ส
                </Link>
              </>
            ) : tab === "saved" ? (
              <button type="button" onClick={() => setTab("all")} className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold">
                ไปดูตลาดคอร์ส
              </button>
            ) : (
              <button type="button" onClick={() => setTab("all")} className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold">
                ค้นหาคอร์สใหม่
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {displayCourses.map((course) => (
            <CourseMarketplaceCard
              key={course.id}
              course={course}
              enrolled={enrolledIds.has(course.id) || tab === "mine"}
              saved={savedIds.has(course.id)}
              onSaveChange={tab === "mine" ? undefined : handleSaveChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}
