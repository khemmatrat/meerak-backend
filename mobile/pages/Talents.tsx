import React, { useEffect, useState, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MockApi } from "../services/mockApi";
import { UserProfile } from "../types";
import { useLanguage } from "../context/LanguageContext";
import {
  Search,
  Star,
  GraduationCap,
  Heart,
  User,
  Briefcase,
  Rocket,
  UtensilsCrossed,
  Scissors,
  Palette,
  Sparkles,
  Gem,
  Crown,
  ShieldCheck,
  Car,
  Wrench,
  PartyPopper,
} from "lucide-react";
import {
  gradeService,
  GradeData,
  GRADE_META,
  WorkerGrade,
} from "../services/gradeService";
import { isSponsoredProvider } from "../services/adsService";
import { SponsoredMarketplaceCard, type SponsoredMarketplaceItem } from "../components/SponsoredMarketplaceCard";
import { SponsoredPromoBanner, type SponsoredPromoItem } from "../components/SponsoredPromoBanner";
import { adsService } from "../services/adsService";
import { api } from "../services/api";

export type ExpertCategory =
  | "all"
  | "chef"
  | "tailor"
  | "artist"
  | "barber"
  | "wellness"
  | "beauty"
  | "driver"
  | "cleaning"
  | "technical"
  | "party_guest";
type GradeFilter = "all" | "A" | "B" | "C";

const EXPERT_FILTERS: {
  id: ExpertCategory;
  label: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "all",
    label: "ทั้งหมด",
    icon: <Sparkles size={18} className="text-emerald-600" />,
  },
  {
    id: "driver",
    label: "คนขับรถ & แมสเซนเจอร์",
    icon: <Car size={18} className="text-slate-600" />,
  },
  {
    id: "cleaning",
    label: "ทำความสะอาด",
    icon: <Sparkles size={18} className="text-slate-600" />,
  },
  {
    id: "technical",
    label: "ช่างเทคนิค",
    icon: <Wrench size={18} className="text-slate-600" />,
  },
  {
    id: "party_guest",
    label: "เพื่อนเที่ยว / ปาร์ตี้",
    icon: <PartyPopper size={18} className="text-slate-600" />,
  },
  {
    id: "chef",
    label: "Gourmet & Chef",
    icon: <UtensilsCrossed size={18} className="text-slate-600" />,
  },
  {
    id: "tailor",
    label: "Style Masters",
    icon: <Scissors size={18} className="text-slate-600" />,
  },
  {
    id: "artist",
    label: "Entertainment",
    icon: <Palette size={18} className="text-slate-600" />,
  },
  {
    id: "barber",
    label: "Barber",
    icon: <Scissors size={18} className="text-slate-600" />,
  },
  {
    id: "beauty",
    label: "Beauty & Salon",
    icon: <Sparkles size={18} className="text-rose-600" />,
  },
  {
    id: "wellness",
    label: "Wellness & Spa",
    icon: <Heart size={18} className="text-slate-600" />,
  },
];

// ── Grade Badge overlay for talent cards ─────────────────────────────────
const TalentGradeBadge: React.FC<{ grade: WorkerGrade }> = ({ grade }) => {
  const meta = GRADE_META[grade];
  if (grade === "A") {
    return (
      <div
        className="absolute top-2 right-2 z-20 flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold shadow-lg"
        style={{ background: meta.bgColor, color: "#fff" }}
      >
        <Crown size={11} fill="currentColor" />
        VVIP
        <style>{`@keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}`}</style>
      </div>
    );
  }
  if (grade === "B") {
    return (
      <div className="absolute top-2 right-2 z-20 flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold bg-indigo-600 text-white shadow">
        <ShieldCheck size={11} /> Pro
      </div>
    );
  }
  return null;
};

/** Cover image with gradient + icon when no URL or load failure (no generic stock faces). */
const TalentCover: React.FC<{ src?: string | null; alt: string }> = ({
  src,
  alt,
}) => {
  const [failed, setFailed] = useState(false);
  const valid = Boolean(src && String(src).trim());
  if (!valid || failed) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-100 via-white to-emerald-50/60">
        <User
          className="text-slate-200"
          size={68}
          strokeWidth={1.15}
          aria-hidden
        />
      </div>
    );
  }
  return (
    <img
      src={src!}
      alt={alt}
      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
      onError={() => setFailed(true)}
    />
  );
};

export const Talents: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [providers, setProviders] = useState<UserProfile[]>([]);
  const [filtered, setFiltered] = useState<UserProfile[]>([]);
  const [gradeMap, setGradeMap] = useState<Record<string, GradeData>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [genderFilter, setGenderFilter] = useState("all");
  const [expertCategory, setExpertCategory] = useState<ExpertCategory>("all");
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>("all");
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [savedOnly, setSavedOnly] = useState(false);
  const [searchPromo, setSearchPromo] = useState<SponsoredPromoItem | null>(null);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const { t, language } = useLanguage();

  const HOME_CATEGORIES = [
    "driver",
    "cleaning",
    "technical",
    "party_guest",
  ] as const;

  useEffect(() => {
    const cat = searchParams.get("category");
    const status = searchParams.get("status");
    if (
      cat &&
      [
        "all",
        "driver",
        "cleaning",
        "technical",
        "party_guest",
        "chef",
        "tailor",
        "artist",
        "barber",
        "beauty",
        "wellness",
      ].includes(cat)
    ) {
      setExpertCategory(cat as ExpertCategory);
    }
    if (status === "online") setOnlineOnly(true);
    adsService.captureAdClickFromUrl(searchParams);
  }, [searchParams]);

  useEffect(() => {
    api.get("/ads/placements/search").then((r) => {
      setSearchPromo(r.data?.promo || null);
    }).catch(() => setSearchPromo(null));
  }, []);

  const categoryToSkills: Record<string, string[]> = {
    driver: ["Driver", "Messenger", "driver", "messenger"],
    cleaning: ["Cleaning", "cleaning", "ทำความสะอาด"],
    technical: [
      "Plumbing",
      "Electrician",
      "Repair",
      "plumbing",
      "electrician",
      "ช่าง",
    ],
    party_guest: [
      "Party_Guest",
      "Dating",
      "Sommelier",
      "party_guest",
      "dating",
      "sommelier",
      "เพื่อนเที่ยว",
    ],
  };

  useEffect(() => {
    const fetchProviders = async () => {
      setLoading(true);
      try {
        const categoryParam =
          expertCategory === "all" ||
          HOME_CATEGORIES.includes(expertCategory as any)
            ? undefined
            : expertCategory;
        const data = await MockApi.getProviders(categoryParam);
        const list = Array.isArray(data) ? data : [];
        setProviders(list);

        // ดึง grade ของแต่ละ provider แบบ batch (รัน parallel สูงสุด 10)
        const gradeResults: Record<string, GradeData> = {};
        await Promise.all(
          list
            .filter((p) => !isSponsoredProvider(p))
            .slice(0, 20)
            .map(async (p) => {
            const g = await gradeService.getWorkerGrade(p.id).catch(() => null);
            if (g) gradeResults[p.id] = g;
          }),
        );
        setGradeMap(gradeResults);
      } catch (err) {
        console.error(err);
        setProviders([]);
      } finally {
        setLoading(false);
      }
    };
    fetchProviders();
  }, [expertCategory]);

  useEffect(() => {
    const load = async () => {
      try {
        const list = await MockApi.getSavedTalents();
        setSavedIds(new Set(list.map((t) => String(t.talent_id))));
      } catch (_) {
        setSavedIds(new Set());
      }
    };
    load();
  }, []);

  const toggleSaveTalent = async (e: React.MouseEvent, talentId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const isSaved = savedIds.has(talentId);
    try {
      if (isSaved) {
        await MockApi.unsaveTalent(talentId);
        setSavedIds((prev) => {
          const s = new Set(prev);
          s.delete(talentId);
          return s;
        });
      } else {
        await MockApi.saveTalent(talentId);
        setSavedIds((prev) => new Set([...prev, talentId]));
      }
    } catch (_) {}
  };

  useEffect(() => {
    let result = providers;

    if (
      HOME_CATEGORIES.includes(expertCategory as any) &&
      expertCategory !== "all"
    ) {
      const skills = categoryToSkills[expertCategory] || [];
      result = result.filter((p) => {
        if (isSponsoredProvider(p)) return true;
        const providerSkills = (p.skills || []).map((s) =>
          typeof s === "object" ? (s as any)?.name : String(s),
        );
        const expertCat = (p as any).expert_category;
        return (
          skills.some((sk) =>
            providerSkills.some((ps) =>
              String(ps).toLowerCase().includes(sk.toLowerCase()),
            ),
          ) ||
          (expertCat &&
            skills.some((sk) =>
              String(expertCat).toLowerCase().includes(sk.toLowerCase()),
            ))
        );
      });
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          isSponsoredProvider(p) ||
          (p.name || "").toLowerCase().includes(q) ||
          (p.university && p.university.toLowerCase().includes(q)) ||
          (p.looks && p.looks.some((tag) => tag.toLowerCase().includes(q))) ||
          (p.signature_service &&
            p.signature_service.toLowerCase().includes(q)) ||
          (p.skills &&
            p.skills.some((s) => String(s).toLowerCase().includes(q))),
      );
    }

    if (genderFilter !== "all") {
      result = result.filter(
        (p) => isSponsoredProvider(p) || p.gender === genderFilter,
      );
    }

    // Grade filter — Top Rated VVIP, Pro, Standard
    if (gradeFilter !== "all") {
      result = result.filter((p) => {
        if (isSponsoredProvider(p)) return true;
        const g = gradeMap[p.id];
        if (!g) return gradeFilter === "C"; // ไม่มีข้อมูล = Grade C
        return g.grade === gradeFilter;
      });
    }

    if (savedOnly) {
      result = result.filter(
        (p) => isSponsoredProvider(p) || savedIds.has(String(p.id)),
      );
    }

    if (onlineOnly) {
      result = result.filter(
        (p) => isSponsoredProvider(p) || (p as any).status === "available",
      );
    }

    // Sort organic by grade; keep sponsored slots at server injection positions
    const withIdx = result.map((p, i) => ({ p, i }));
    withIdx.sort((a, b) => {
      if (isSponsoredProvider(a.p) || isSponsoredProvider(b.p)) {
        return a.i - b.i;
      }
      const ga = gradeMap[a.p.id]?.grade || "C";
      const gb = gradeMap[b.p.id]?.grade || "C";
      const order = { A: 0, B: 1, C: 2 };
      if (order[ga] !== order[gb]) return order[ga] - order[gb];
      return (b.p.rating ?? 0) - (a.p.rating ?? 0);
    });
    result = withIdx.map((x) => x.p);

    setFiltered(result);
  }, [
    searchQuery,
    genderFilter,
    gradeFilter,
    savedOnly,
    savedIds,
    providers,
    gradeMap,
    expertCategory,
    onlineOnly,
  ]);

  return (
    <div className="space-y-5 bg-white">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100">
            <Sparkles size={20} strokeWidth={2} />
          </span>
          {t("talents.title")}
        </h1>
        <p className="text-slate-500 mt-2 text-sm leading-relaxed">
          {t("talents.subtitle")}
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-sm space-y-4">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            {t("talents.category_label")}
          </p>
          <div className="flex flex-wrap gap-2">
            {EXPERT_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setExpertCategory(f.id)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium border transition-all ${
                  expertCategory === f.id
                    ? "border-emerald-500 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-500/20 shadow-sm"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                {f.icon}
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-slate-100">
          {onlineOnly && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Online เท่านั้น
              <button
                type="button"
                onClick={() => setOnlineOnly(false)}
                className="text-emerald-600 hover:text-emerald-800 font-bold"
              >
                ×
              </button>
            </span>
          )}
          <button
            type="button"
            onClick={() => setSavedOnly((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border transition-all ${
              savedOnly
                ? "bg-rose-50 text-rose-800 border-rose-200"
                : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
            }`}
          >
            <Heart
              size={14}
              className={savedOnly ? "fill-rose-500 text-rose-500" : ""}
            />
            {savedOnly
              ? `ที่บันทึก (${filtered.length})`
              : "แสดงเฉพาะที่บันทึก"}
          </button>
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Grade
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {(["all", "A", "B", "C"] as GradeFilter[]).map((g) => {
              const isActive = gradeFilter === g;
              const styles =
                g === "A"
                  ? isActive
                    ? "bg-amber-100 text-amber-900 border-amber-300 ring-2 ring-amber-200/80"
                    : "bg-white text-amber-800 border-amber-200 hover:bg-amber-50"
                  : g === "B"
                    ? isActive
                      ? "bg-indigo-50 text-indigo-900 border-indigo-300 ring-2 ring-indigo-200/60"
                      : "bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50/80"
                    : g === "C"
                      ? isActive
                        ? "bg-slate-700 text-white border-slate-700"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                      : isActive
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50";
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGradeFilter(g)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold border transition-all ${styles}`}
                >
                  {g === "A" && (
                    <Crown
                      size={13}
                      className="text-amber-700"
                      fill="currentColor"
                    />
                  )}
                  {g === "B" && <ShieldCheck size={13} />}
                  {g === "all" ? "ทั้งหมด" : `Grade ${g}`}
                  {g === "A" && (
                    <span className="text-[10px] opacity-90">VVIP</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            {t("talents.gender_label")}
          </p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["all", t("talents.filter_all")],
                ["female", t("talents.filter_female")],
                ["male", t("talents.filter_male")],
                ["lgbtq", t("talents.filter_lgbtq")],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setGenderFilter(key)}
                className={`px-3 py-1.5 text-sm font-medium rounded-xl border transition-colors whitespace-nowrap ${
                  genderFilter === key
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative pt-1 border-t border-slate-100">
          <Search
            className="absolute left-3 top-[calc(50%+2px)] -translate-y-1/2 text-slate-400 pointer-events-none"
            size={20}
          />
          <input
            type="search"
            placeholder={t("talents.search")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-slate-50/80 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-shadow text-slate-900 placeholder-slate-400"
          />
        </div>
      </div>

      {searchPromo ? (
        <div className="mb-4">
          <SponsoredPromoBanner item={searchPromo} surface="SEARCH_RESULTS" language={language} />
        </div>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-80 bg-gray-100 rounded-2xl animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {filtered.length === 0 ? (
            <div className="col-span-full text-center py-12 text-gray-500">
              {t("talents.no_results")}
            </div>
          ) : (
            filtered.map((person) => {
              if (isSponsoredProvider(person)) {
                return (
                  <SponsoredMarketplaceCard
                    key={person.id}
                    item={person as SponsoredMarketplaceItem}
                    language={language}
                  />
                );
              }

              const avatarUrl = person.avatar_url || (person as any).avatarUrl;
              const portfolioUrls =
                person.portfolio_urls || (person as any).portfolio_urls || [];
              const rawCover = portfolioUrls[0] || avatarUrl;
              const coverImage =
                rawCover && String(rawCover).trim() ? rawCover : null;
              const completedJobs =
                person.completed_jobs_count ??
                (person as any).completedJobs ??
                0;
              const rating = person.rating ?? 0;
              const badge =
                person.verified_badge || (person as any).verified_badge;
              const greetingVideo =
                person.greeting_video_url || (person as any).greeting_video_url;

              const personGrade = gradeMap[person.id];

              return (
                <div
                  key={person.id}
                  className={`bg-white rounded-2xl shadow-sm border overflow-hidden hover:shadow-lg transition-all group relative ${
                    personGrade?.grade === "A"
                      ? "border-amber-300 ring-2 ring-amber-200 shadow-amber-100"
                      : personGrade?.grade === "B"
                        ? "border-indigo-200"
                        : (person as any).is_boosted
                          ? "border-amber-300 ring-2 ring-amber-100 transform scale-[1.02]"
                          : "border-gray-100"
                  }`}
                  onMouseEnter={() =>
                    greetingVideo &&
                    videoRefs.current[person.id]?.play().catch(() => {})
                  }
                  onMouseLeave={() => {
                    if (!greetingVideo) return;
                    const el = videoRefs.current[person.id];
                    if (!el) return;
                    el.pause();
                    el.currentTime = 0;
                  }}
                >
                  {/* Grade Badge (A = VVIP gold, B = Pro purple) */}
                  {personGrade && personGrade.grade !== "C" && (
                    <TalentGradeBadge grade={personGrade.grade} />
                  )}

                  {(person as any).is_boosted && !personGrade && (
                    <div className="absolute top-2 left-2 z-10 bg-amber-400 text-white p-1.5 rounded-full shadow-md">
                      <Rocket size={14} fill="currentColor" />
                    </div>
                  )}

                  <div className="h-64 bg-slate-100 relative overflow-hidden">
                    <TalentCover
                      src={coverImage}
                      alt={person.name || "Talent"}
                    />
                    {greetingVideo && (
                      <video
                        ref={(el) => {
                          videoRefs.current[person.id] = el;
                        }}
                        src={greetingVideo}
                        className="absolute inset-0 z-10 w-full h-full object-cover opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                        muted
                        playsInline
                        loop
                      />
                    )}
                    {person.is_online && (
                      <div
                        className="absolute top-4 left-4 w-3 h-3 bg-green-500 border-2 border-white rounded-full shadow-sm z-10"
                        title="Online"
                      />
                    )}
                    <button
                      onClick={(e) => toggleSaveTalent(e, person.id)}
                      className="absolute top-4 right-4 z-20 w-10 h-10 rounded-full bg-white/90 shadow-md flex items-center justify-center hover:bg-white transition-colors"
                      title={
                        savedIds.has(person.id)
                          ? "ยกเลิกบันทึก"
                          : "บันทึก Talent ไว้จ้างภายหลัง"
                      }
                    >
                      <Heart
                        size={20}
                        className={
                          savedIds.has(person.id)
                            ? "text-rose-500 fill-rose-500"
                            : "text-gray-500"
                        }
                      />
                    </button>

                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 pt-10 z-[1]">
                      <div className="flex justify-between items-end text-white">
                        <div>
                          <h3 className="text-xl font-bold flex items-center">
                            {person.name}
                            {person.age != null && (
                              <span className="ml-2 text-sm font-normal opacity-90">
                                {person.age}
                              </span>
                            )}
                          </h3>
                          {person.university && (
                            <p className="text-xs opacity-90 flex items-center mt-0.5">
                              <GraduationCap size={12} className="mr-1" />{" "}
                              {person.university}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center bg-black/40 px-2 py-1 rounded-lg backdrop-blur-sm gap-1">
                          <Star
                            size={14}
                            className="text-amber-400 fill-current"
                          />
                          <span className="font-bold text-sm">
                            {personGrade
                              ? Number(personGrade.avg_rating).toFixed(1)
                              : Number(rating).toFixed(1)}
                          </span>
                          {personGrade && (
                            <span
                              className="text-[10px] font-bold px-1 rounded"
                              style={{
                                background:
                                  GRADE_META[personGrade.grade].bgColor,
                                color:
                                  personGrade.grade === "C" ? "#fff" : "#fff",
                              }}
                            >
                              {personGrade.grade}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-4">
                    {/* Grade banner for Grade A */}
                    {personGrade?.grade === "A" && (
                      <div
                        className="flex items-center gap-1.5 mb-2 px-2 py-1 rounded-lg text-xs font-bold"
                        style={{
                          background:
                            "linear-gradient(90deg,#D4AF37,#F5E27D,#B8860B)",
                          color: "#fff",
                        }}
                      >
                        <Crown size={12} fill="currentColor" />
                        VVIP Verified • {personGrade.total_reviews} reviews
                      </div>
                    )}
                    {personGrade?.grade === "B" && (
                      <div className="flex items-center gap-1.5 mb-2 text-indigo-600">
                        <ShieldCheck size={13} />
                        <span className="text-xs font-bold">
                          Professional • {personGrade.total_reviews} reviews
                        </span>
                      </div>
                    )}
                    {!personGrade && badge && (
                      <div className="flex items-center gap-1.5 mb-2 text-amber-600">
                        <Gem size={14} />
                        <span className="text-xs font-bold uppercase tracking-wide">
                          {badge}
                        </span>
                      </div>
                    )}
                    {person.signature_service && (
                      <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                        {person.signature_service}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1 mb-3">
                      {(person.skills || person.looks || [])
                        .slice(0, 4)
                        .map((tag: string) => (
                          <span
                            key={tag}
                            className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 bg-gray-100 text-gray-600 rounded-md"
                          >
                            {tag}
                          </span>
                        ))}
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 mb-4">
                      {person.height != null && (
                        <span
                          className="flex items-center"
                          title={t("talents.height")}
                        >
                          <User size={12} className="mr-1" /> {person.height} cm
                        </span>
                      )}
                      <span className="flex items-center">
                        <Briefcase size={12} className="mr-1" />{" "}
                        {personGrade?.total_jobs ?? completedJobs} jobs
                      </span>
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <Link
                          to={
                            person.id
                              ? `/talents/${String(person.id)}`
                              : "/talents"
                          }
                          className="flex-1 py-2.5 text-center bg-white border-2 border-emerald-600 text-emerald-700 font-bold rounded-xl hover:bg-emerald-50 transition-colors"
                        >
                          เลือกเวลา
                        </Link>
                        <Link
                          to={`/create-job?providerId=${person.id}&providerName=${encodeURIComponent(person.name || "")}`}
                          className="flex-1 py-2.5 text-center bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors"
                        >
                          {t("talents.hire")}
                        </Link>
                      </div>
                      <button
                        onClick={(e) => toggleSaveTalent(e, person.id)}
                        className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-medium transition-colors ${
                          savedIds.has(person.id)
                            ? "bg-rose-50 text-rose-600"
                            : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                        }`}
                      >
                        <Heart
                          size={16}
                          className={
                            savedIds.has(person.id) ? "fill-rose-500" : ""
                          }
                        />
                        {savedIds.has(person.id)
                          ? "บันทึกแล้ว"
                          : "บันทึก Talent ไว้จ้างภายหลัง"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
