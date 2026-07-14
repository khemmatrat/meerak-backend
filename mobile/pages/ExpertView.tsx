import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../services/api";
import { adsService } from "../services/adsService";
import { SponsoredPromoBanner, type SponsoredPromoItem } from "../components/SponsoredPromoBanner";
import { useNotification } from "../context/NotificationContext";
import FirebaseApi from "../services/firebase";
import { gradeService, GradeData, GRADE_META } from "../services/gradeService";
import {
  ArrowLeft,
  Star,
  Gem,
  Calendar,
  Clock,
  Loader2,
  Award,
  Play,
  X,
  ChevronLeft,
  ChevronRight,
  Crown,
  ShieldCheck,
  User,
  Briefcase,
  Zap,
  Image,
  Wallet,
  GraduationCap,
  Scissors,
  Utensils,
  Palette,
  Shirt,
} from "lucide-react";
import {
  isServiceMerchantCategory,
  getServiceMerchantMeta,
} from "../constants/serviceMerchantCategories";
import {
  calcBookingEmployerTotal,
  calcBookingTalentBreakdown,
} from "../constants/bookingFeeStructure";
import { useSlotBookingFees } from "../hooks/useSlotBookingFees";
import { ChallengeSubmitModal } from "../components/ChallengeSubmitModal";
import { bidsService, TalentOffer } from "../services/bidsService";
import { PlaceBidModal } from "../components/PlaceBidModal";
import { VideoBrandOverlay } from "../components/VideoBrandOverlay";
import { useAuth } from "../context/AuthContext";
import { videoService } from "../services/videoService";
import type { ProfileWorkExperience, ProfileEducation } from "../types";

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i;

interface Slot {
  id: string;
  start_time: string;
  end_time: string;
}

interface Review {
  id: string;
  job_id: string;
  rating_overall: number;
  rating_quality?: number;
  rating_punctuality?: number;
  rating_attitude?: number;
  rating_cleanliness?: number;
  rating_communication?: number;
  tags?: string[];
  comment?: string;
  created_at: string;
  reviewer_name: string;
  reviewer_avatar?: string;
}

interface ExpertProfile {
  id: string;
  name?: string;
  avatar_url?: string;
  rating?: number;
  signature_service?: string;
  the_journey?: string;
  verified_badge?: string;
  expert_category?: string;
  portfolio_urls?: string[];
  greeting_video_url?: string;
  platinumBadge?: boolean;
  is_vip?: boolean;
  provider_status?: string;
  completed_jobs_count?: number;
  verified_hours?: number;
  work_experience?: ProfileWorkExperience[];
  education?: ProfileEducation[];
}

type TabId = "about" | "videos" | "reviews";

export const ExpertView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { notify } = useNotification();
  const { user } = useAuth();
  const slotFees = useSlotBookingFees();
  const [profile, setProfile] = useState<ExpertProfile | null>(null);
  const [gradeData, setGradeData] = useState<GradeData | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewStats, setReviewStats] = useState<{
    avg_overall: number;
    total_reviews: number;
  } | null>(null);
  const [workClips, setWorkClips] = useState<
    { id: string; url: string; type?: string }[]
  >([]);
  const [backendWorkClips, setBackendWorkClips] = useState<
    { id: string; url: string; title?: string; description?: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("about");
  const [bookingSlotId, setBookingSlotId] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [storyOpen, setStoryOpen] = useState(false);
  const [storyIndex, setStoryIndex] = useState(0);
  const storyVideoRef = useRef<HTMLVideoElement | null>(null);
  const slotsSectionRef = useRef<HTMLDivElement | null>(null);
  const [openOffers, setOpenOffers] = useState<TalentOffer[]>([]);
  const [placeBidOffer, setPlaceBidOffer] = useState<TalentOffer | null>(null);
  const [bookedSlots, setBookedSlots] = useState<any[]>([]);
  const [challengeSlot, setChallengeSlot] = useState<any | null>(null);
  const [slotBookModal, setSlotBookModal] = useState<{
    slot: Slot;
    suggestedDeposit: number;
  } | null>(null);
  const [depositInput, setDepositInput] = useState<string>("");
  const [profilePromo, setProfilePromo] = useState<SponsoredPromoItem | null>(null);

  useEffect(() => {
    adsService.captureAdClickFromUrl(searchParams);
  }, [searchParams]);

  useEffect(() => {
    api.get("/ads/placements/profile").then((r) => {
      setProfilePromo(r.data?.promo || null);
    }).catch(() => setProfilePromo(null));
  }, [id]);

  // Build verified work clips: Backend talent_videos + Firestore + greeting_video + portfolio videos
  const buildWorkClips = useCallback(
    (
      p: ExpertProfile,
    ): { id: string; url: string; title?: string; description?: string }[] => {
      const clips: {
        id: string;
        url: string;
        title?: string;
        description?: string;
      }[] = [];
      const seen = new Set<string>();

      // 1. Backend talent_videos (คลิปที่อัปโหลดจาก Story)
      backendWorkClips.forEach((c) => {
        if (c.url && !seen.has(c.url)) {
          clips.push({
            id: c.id,
            url: c.url,
            title: c.title,
            description: c.description,
          });
          seen.add(c.url);
        }
      });

      // 2. Greeting video
      if (p.greeting_video_url && !seen.has(p.greeting_video_url)) {
        clips.push({
          id: "greeting",
          url: p.greeting_video_url,
          title: "Greeting",
        });
        seen.add(p.greeting_video_url);
      }

      // 3. Firestore clips
      workClips.forEach((c) => {
        if (c.url && !seen.has(c.url)) {
          clips.push({ id: c.id, url: c.url });
          seen.add(c.url);
        }
      });

      // 4. Portfolio URLs that are videos
      const portfolio = p.portfolio_urls || [];
      portfolio.forEach((url, i) => {
        if (typeof url === "string" && VIDEO_EXT.test(url) && !seen.has(url)) {
          clips.push({ id: `portfolio-${i}`, url });
          seen.add(url);
        }
      });

      return clips;
    },
    [workClips, backendWorkClips],
  );

  const allClips = profile ? buildWorkClips(profile) : [];

  // รูปผลงานจาก portfolio_urls (ไม่รวมวิดีโอ)
  const portfolioImages = (profile?.portfolio_urls || [])
    .filter(
      (url): url is string =>
        typeof url === "string" && url.trim() !== "" && !VIDEO_EXT.test(url),
    )
    .map((url, i) => ({ id: `img-${i}`, url: url.trim() }));

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      try {
        const [profileRes, slotsRes, gradeRes, firestoreClips, backendVideos] =
          await Promise.all([
            api.get(`/users/profile/${id}`).catch(() => ({ data: null })),
            api
              .get(`/availability/${id}`)
              .catch(() => ({ data: { slots: [] } })),
            gradeService.getWorkerGrade(id).catch(() => null),
            FirebaseApi.getProviderWorkClips(id),
            videoService.getVideosByTalent(id),
          ]);

        if (profileRes.data && typeof profileRes.data === "object") {
          setProfile(profileRes.data as ExpertProfile);
        }
        setSlots(
          Array.isArray(slotsRes.data?.slots) ? slotsRes.data.slots : [],
        );
        setGradeData(gradeRes);
        setWorkClips(firestoreClips);
        setBackendWorkClips(
          (backendVideos || []).map((v) => ({
            id: v.id,
            url: v.video_url,
            title: v.title || undefined,
            description: v.description || undefined,
          })),
        );
        const offersRes = await bidsService
          .getOpenOffers(id)
          .catch(() => ({ data: { offers: [] } }));
        setOpenOffers(offersRes.data?.offers ?? []);
        const bookedRes = await api
          .get(`/talents/${id}/booked-slots`)
          .catch(() => ({ data: { slots: [] } }));
        setBookedSlots(bookedRes.data?.slots ?? []);
      } catch (e) {
        notify("โหลดไม่สำเร็จ", "error");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, notify]);

  useEffect(() => {
    if (!id || !profile) return;
    api
      .get(`/reviews/worker/${id}`, { params: { limit: 20 } })
      .then((res) => {
        setReviews(res.data?.reviews || []);
        const stats = res.data?.stats;
        setReviewStats(
          stats
            ? {
                avg_overall: parseFloat(stats.avg_overall) || 0,
                total_reviews: parseInt(stats.total_reviews) || 0,
              }
            : null,
        );
      })
      .catch(() => {});
  }, [id, profile]);

  const openSlotBookModal = (slot: Slot) => {
    const offerForSlot = openOffers.find(
      (o) => o.slot_id && String(o.slot_id) === String(slot.id),
    );
    const suggestedDeposit = offerForSlot?.base_price ?? 500;
    setSlotBookModal({ slot, suggestedDeposit });
    setDepositInput(String(suggestedDeposit));
  };

  const closeSlotBookModal = () => {
    setSlotBookModal(null);
    setDepositInput("");
  };

  const handleBook = async (slotId: string, depositAmount: number) => {
    if (!id || !slotId) return;
    if (depositAmount < 1) {
      notify("กรุณาระบุจำนวนมัดจำอย่างน้อย ฿1", "error");
      return;
    }
    setBookingSlotId(slotId);
    setBooking(true);
    try {
      await api.post("/bookings", {
        slot_id: slotId,
        talent_id: id,
        deposit_amount: depositAmount,
        ...adsService.getAdClickPayloadForBooking(),
        adSurface: adsService.getStoredClickAttribution()?.surface || "VIDEO_FEED",
      });
      notify(
        "จองคิวสำเร็จ — รอ Talent ยืนยัน แล้วชำระมัดจำที่ My Bookings",
        "success",
      );
      setSlots((prev) => prev.filter((s) => s.id !== slotId));
      closeSlotBookModal();
    } catch (e: any) {
      const msg = e.response?.data?.error || "จองไม่สำเร็จ";
      notify(msg, "error");
    } finally {
      setBookingSlotId(null);
      setBooking(false);
    }
  };

  const formatSlot = (start: string, end: string) => {
    const d = new Date(start);
    const e = new Date(end);
    return {
      date: d.toLocaleDateString("th-TH", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "2-digit",
      }),
      time: `${d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} – ${e.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`,
    };
  };

  const openStory = (index: number) => {
    setStoryIndex(index);
    setStoryOpen(true);
  };

  const closeStory = () => setStoryOpen(false);

  const goPrevStory = () => setStoryIndex((i) => Math.max(0, i - 1));
  const goNextStory = () =>
    setStoryIndex((i) => Math.min(allClips.length - 1, i + 1));

  // TikTok-style touch swipe (vertical: up = next, down = prev)
  const touchStartY = useRef(0);
  const handleStoryTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };
  const handleStoryTouchEnd = (e: React.TouchEvent) => {
    const dy = touchStartY.current - e.changedTouches[0].clientY;
    if (Math.abs(dy) > 50) {
      if (dy > 0) goNextStory();
      else goPrevStory();
    }
  };

  const handleBookNow = () => {
    navigate(
      `/create-job?providerId=${id}&providerName=${encodeURIComponent(profile?.name || "")}`,
    );
  };

  const scrollToSlots = () => {
    setActiveTab("about");
    setTimeout(
      () => slotsSectionRef.current?.scrollIntoView({ behavior: "smooth" }),
      100,
    );
  };

  if (loading && !profile) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-amber-500 animate-spin" />
      </div>
    );
  }

  if (!profile && !loading) {
    return (
      <div className="max-w-2xl mx-auto p-6 text-center min-h-[40vh] flex flex-col items-center justify-center">
        <p className="text-gray-500">ไม่พบโปรไฟล์นี้</p>
        <Link
          to="/talents"
          className="mt-4 inline-flex items-center gap-2 text-amber-600 hover:underline"
        >
          <ArrowLeft size={18} /> กลับไปรายชื่อ Talents
        </Link>
      </div>
    );
  }

  const avatarUrl =
    profile.avatar_url || "https://via.placeholder.com/200?text=Expert";
  const displayRating = gradeData
    ? gradeData.avg_rating
    : (profile.rating ?? 0);
  const completedJobs =
    gradeData?.total_jobs ?? profile.completed_jobs_count ?? 0;
  const showPlatinumBadge =
    profile.platinumBadge || profile.is_vip || gradeData?.grade === "A";

  const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "about", label: "About", icon: <User size={16} /> },
    { id: "videos", label: "Video Story", icon: <Play size={16} /> },
    { id: "reviews", label: "Reviews", icon: <Star size={16} /> },
  ];

  return (
    <div className="max-w-3xl mx-auto pb-36 md:pb-24">
      <Link
        to="/talents"
        className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft size={18} /> รายชื่อ Talents
      </Link>

      {profilePromo ? (
        <div className="mb-4">
          <SponsoredPromoBanner item={profilePromo} surface="PROVIDER_PROFILE_PROMO" />
        </div>
      ) : null}

      {/* Header: Avatar + Name + Badges */}
      <div className="flex flex-col sm:flex-row gap-6 mb-6">
        <div className="flex-shrink-0 relative">
          <img
            src={avatarUrl}
            alt={profile.name}
            className="w-32 h-32 sm:w-40 sm:h-40 rounded-2xl object-cover border-2 border-amber-200 shadow-lg aspect-square"
          />
          {showPlatinumBadge && (
            <div
              className="absolute -top-1 -right-1 flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold shadow-lg"
              style={{
                background:
                  "linear-gradient(135deg, #D4AF37 0%, #F5E27D 50%, #B8860B 100%)",
                color: "#fff",
              }}
            >
              <Crown size={12} fill="currentColor" /> Platinum
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">
            {profile.name || "Expert"}
          </h1>
          {profile.verified_badge && (
            <div className="flex items-center gap-2 mt-1 text-amber-600">
              <Gem size={18} />
              <span className="font-semibold">{profile.verified_badge}</span>
            </div>
          )}
          {gradeData && gradeData.grade !== "C" && (
            <div className="flex items-center gap-2 mt-1">
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold text-white"
                style={{ background: GRADE_META[gradeData.grade].bgColor }}
              >
                {gradeData.grade === "A" ? (
                  <Crown size={12} fill="currentColor" />
                ) : (
                  <ShieldCheck size={12} />
                )}
                {gradeData.grade === "A" ? "VVIP" : "Pro"}
              </span>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-2 text-gray-600">
            <span className="flex items-center gap-1">
              <Star size={18} className="text-amber-400 fill-amber-400" />
              <span className="font-medium">
                {Number(displayRating).toFixed(1)}
              </span>
            </span>
            {reviewStats && (
              <span className="text-sm text-gray-500">
                ({reviewStats.total_reviews} รีวิว)
              </span>
            )}
            {(profile.verified_hours ?? 0) >= 1 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
                <Clock size={12} />
                Verified {Math.floor(profile.verified_hours!)} ชม.
              </span>
            )}
          </div>
          {profile.signature_service && (
            <p className="mt-2 text-gray-600 text-sm line-clamp-2">
              {profile.signature_service}
            </p>
          )}
        </div>
      </div>

      {/* Tabbed Navigation */}
      <div className="flex gap-1 p-1 rounded-xl bg-gray-100 border border-gray-200 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-medium text-sm transition-all ${
              activeTab === tab.id
                ? "bg-white text-amber-600 shadow-sm border border-amber-200"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "about" && (
        <div className="space-y-6">
          {/* Portfolio Gallery — รูปผลงาน */}
          {portfolioImages.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Image size={20} className="text-amber-500" />
                รูปผลงาน
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {portfolioImages.map((img) => (
                  <a
                    key={img.id}
                    href={img.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-200 hover:opacity-90 transition"
                  >
                    <img
                      src={img.url}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          "https://via.placeholder.com/200?text=Image";
                      }}
                    />
                  </a>
                ))}
              </div>
            </div>
          )}
          {profile.the_journey && (
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                <Briefcase size={18} className="text-amber-500" /> The Journey
              </h3>
              <p className="text-gray-600 text-sm whitespace-pre-wrap">
                {profile.the_journey}
              </p>
            </div>
          )}
          {Array.isArray(profile.work_experience) &&
            profile.work_experience.length > 0 && (
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Briefcase size={20} className="text-amber-500" />
                  ประสบการณ์ทำงาน
                </h3>
                <ul className="space-y-4">
                  {profile.work_experience.map((exp) => (
                    <li
                      key={exp.id}
                      className="border-b border-gray-100 last:border-0 pb-4 last:pb-0"
                    >
                      <p className="font-semibold text-gray-900">{exp.title}</p>
                      <p className="text-sm text-gray-600">{exp.company}</p>
                      {exp.location ? (
                        <p className="text-xs text-gray-500">{exp.location}</p>
                      ) : null}
                      <p className="text-xs text-gray-500 mt-1">
                        {exp.startDate}
                        {" — "}
                        {exp.current ? "ปัจจุบัน" : exp.endDate || "—"}
                      </p>
                      {exp.description ? (
                        <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">
                          {exp.description}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          {Array.isArray(profile.education) && profile.education.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                <GraduationCap size={20} className="text-emerald-600" />
                การศึกษา
              </h3>
              <ul className="space-y-4">
                {profile.education.map((ed) => (
                  <li
                    key={ed.id}
                    className="border-b border-gray-100 last:border-0 pb-4 last:pb-0"
                  >
                    <p className="font-semibold text-gray-900">{ed.school}</p>
                    {(ed.degree || ed.field) && (
                      <p className="text-sm text-gray-600">
                        {[ed.degree, ed.field].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    {(ed.startYear || ed.endYear) && (
                      <p className="text-xs text-gray-500 mt-1">
                        {ed.startYear || "—"} — {ed.endYear || "—"}
                      </p>
                    )}
                    {ed.description ? (
                      <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">
                        {ed.description}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {gradeData && (
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                <Award size={18} className="text-amber-500" /> Certifications &
                Ratings
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Grade</span>
                  <p
                    className="font-semibold"
                    style={{ color: GRADE_META[gradeData.grade].color }}
                  >
                    {gradeData.grade} — {GRADE_META[gradeData.grade].badge}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">งานสำเร็จ</span>
                  <p className="font-semibold">{gradeData.total_jobs} งาน</p>
                </div>
                <div>
                  <span className="text-gray-500">Success Rate</span>
                  <p className="font-semibold">
                    {gradeData.success_rate?.toFixed(0) ?? 0}%
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">ใบเซอร์</span>
                  <p className="font-semibold">{gradeData.cert_count} ใบ</p>
                </div>
              </div>
            </div>
          )}
          {isServiceMerchantCategory(profile?.expert_category) &&
            (() => {
              const bookMeta = getServiceMerchantMeta(profile?.expert_category);
              const cat = (profile?.expert_category || "").toLowerCase();
              const BookIcon =
                cat === "chef"
                  ? Utensils
                  : cat === "artist"
                    ? Palette
                    : cat === "tailor"
                      ? Shirt
                      : Scissors;
              return (
                <div className="mb-6 rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-5 shadow-sm">
                  <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-2">
                    <BookIcon size={22} className="text-sky-600" />
                    {bookMeta.bookingTitle}
                  </h2>
                  <p className="text-sm text-gray-600 mb-4">
                    {bookMeta.bookingDescription}
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate(`/talents/${id}/beauty-booking`)}
                    className="w-full sm:w-auto px-6 py-3 rounded-xl bg-sky-600 text-white font-semibold hover:bg-sky-700"
                  >
                    เริ่มจองบริการ
                  </button>
                </div>
              );
            })()}
          {/* Select Your Time */}
          <div
            ref={slotsSectionRef}
            className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-xl p-6 sm:p-8"
          >
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-4">
              <Calendar size={22} className="text-amber-500" />
              Select Your Time
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              เลือกช่วงเวลาที่ต้องการจองคิวกับ Expert คนนี้
            </p>
            {slots.length === 0 ? (
              <div className="text-center py-10 text-gray-500 rounded-xl bg-white/5 border border-white/10">
                <Clock size={40} className="mx-auto mb-2 opacity-60" />
                <p>ยังไม่มีช่วงเวลาว่างในขณะนี้</p>
                <p className="text-xs mt-1">
                  ลองกลับมาดูภายหลังหรือติดต่อโดยตรง
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {slots.map((slot) => {
                  const { date, time } = formatSlot(
                    slot.start_time,
                    slot.end_time,
                  );
                  return (
                    <li
                      key={slot.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-white/10 border border-white/20 hover:bg-white/20 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                          <Calendar size={24} className="text-amber-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{date}</p>
                          <p className="text-sm text-gray-600">{time}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => openSlotBookModal(slot)}
                        disabled={booking}
                        className="px-5 py-2.5 rounded-xl bg-amber-500 text-white font-semibold hover:bg-amber-600 disabled:opacity-50 flex items-center justify-center gap-2 shrink-0"
                      >
                        จองคิว
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* คิวที่ถูกจอง — ท้าชิงได้ (AQOND Premium) */}
          {bookedSlots.length > 0 && user && (
            <div className="mt-6 rounded-2xl border-2 border-amber-200/80 bg-gradient-to-br from-white via-amber-50/30 to-emerald-50/30 p-6 shadow-lg">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-2">
                <Zap size={22} className="text-amber-500" />
                คิวที่ถูกจอง — ท้าชิงได้
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                เสนอราคาสูงกว่า 20% เพื่อท้าชิงคิวนี้
              </p>
              <ul className="space-y-3">
                {bookedSlots.map((bs) => {
                  const { date, time } = formatSlot(bs.start_time, bs.end_time);
                  return (
                    <li
                      key={bs.booking_id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-white/80 border border-amber-200/60"
                    >
                      <div>
                        <p className="font-medium text-gray-900">{date}</p>
                        <p className="text-sm text-gray-600">{time}</p>
                        <p className="text-xs text-amber-600 mt-0.5">
                          เดิม ฿{bs.deposit_amount?.toLocaleString()}
                        </p>
                      </div>
                      <button
                        onClick={() => user && setChallengeSlot(bs)}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-emerald-500 text-white font-semibold hover:opacity-90 flex items-center gap-2 shrink-0"
                      >
                        <Zap size={16} />
                        ท้าชิง
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* AQOND: Open Bidding Offers (18:00–20:00) */}
          {openOffers.length > 0 && (
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/50 p-6">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-4">
                <Zap size={22} className="text-amber-500" />
                Real-time Bidding (18:00–20:00)
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                วาง Bid สูงกว่าฐานเพื่อเพิ่มโอกาสถูกเลือก
              </p>
              <div className="space-y-3">
                {openOffers.map((offer) => (
                  <div
                    key={offer.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-white border border-amber-200"
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        {offer.title || "Offer"}
                      </p>
                      <p className="text-sm text-amber-600 font-bold">
                        Base: {offer.base_price.toLocaleString()} THB
                      </p>
                      <p className="text-xs text-gray-500">
                        {offer.offer_date} • {offer.bid_count ?? 0} bids
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        user ? setPlaceBidOffer(offer) : navigate("/login")
                      }
                      className="px-4 py-2 rounded-xl bg-amber-500 text-white font-semibold hover:bg-amber-600"
                    >
                      Place Bid
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {challengeSlot && id && (
        <ChallengeSubmitModal
          talentId={id}
          slot={challengeSlot}
          onClose={() => setChallengeSlot(null)}
          onSuccess={() => {
            setChallengeSlot(null);
            notify("ส่งคำท้าชิงเรียบร้อย รอผู้จองคนแรกตอบกลับ", "success");
          }}
        />
      )}

      {placeBidOffer && id && (
        <PlaceBidModal
          offer={placeBidOffer}
          talentId={id}
          walletBalance={Number((user as any)?.wallet_balance ?? 0)}
          onSuccess={() => setPlaceBidOffer(null)}
          onClose={() => setPlaceBidOffer(null)}
        />
      )}

      {/* Slot Book Modal — เก็บมัดจำตอนจอง + แสดง breakdown */}
      {slotBookModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">
                จองคิว — ชำระมัดจำ
              </h3>
              <button
                onClick={closeSlotBookModal}
                className="p-2 rounded-lg hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              {
                formatSlot(
                  slotBookModal.slot.start_time,
                  slotBookModal.slot.end_time,
                ).date
              }{" "}
              —{" "}
              {
                formatSlot(
                  slotBookModal.slot.start_time,
                  slotBookModal.slot.end_time,
                ).time
              }
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              จำนวนมัดจำ (บาท)
            </label>
            <input
              type="number"
              min={1}
              value={depositInput}
              onChange={(e) => setDepositInput(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 mb-4"
              placeholder="เช่น 500"
            />
            {(() => {
              const deposit = Math.max(0, Number(depositInput) || 0);
              const emp = calcBookingEmployerTotal(
                deposit,
                user?.vip_tier,
                slotFees ?? undefined,
              );
              const talentBreakdown = calcBookingTalentBreakdown(
                deposit,
                deposit,
                undefined,
                slotFees ?? undefined,
              );
              return deposit >= 1 ? (
                <div className="space-y-3 mb-6 p-4 rounded-xl bg-amber-50/80 border border-amber-200">
                  <p className="font-medium text-amber-900 text-sm">
                    Breakdown
                  </p>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between text-gray-700">
                      <span>ค่ามัดจำ</span>
                      <span className="font-mono">
                        ฿{deposit.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between text-gray-700">
                      <span>Markup ({(emp.markupRate * 100).toFixed(0)}%)</span>
                      <span className="font-mono">
                        +฿{emp.markupAmount.toLocaleString()}
                      </span>
                    </div>
                    <hr className="border-amber-200" />
                    <div className="flex justify-between font-bold text-amber-900">
                      <span>ยอดที่คุณจ่าย</span>
                      <span className="font-mono">
                        ฿{emp.totalToPay.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <details className="mt-2">
                    <summary className="text-xs text-amber-700 cursor-pointer">
                      Talent ได้รับ (หลังหัก Sourcing + Commission)
                    </summary>
                    <div className="mt-2 space-y-1 text-xs text-gray-600">
                      <div className="flex justify-between">
                        <span>Sourcing (8%)</span>
                        <span>
                          -฿{talentBreakdown.sourcingFee.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>
                          Commission (
                          {(talentBreakdown.commissionRate * 100).toFixed(0)}%)
                        </span>
                        <span>
                          -฿{talentBreakdown.commission.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between font-medium text-emerald-700">
                        <span>Talent ได้รับสุทธิ</span>
                        <span>
                          ฿{talentBreakdown.talentPayout.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </details>
                </div>
              ) : null;
            })()}
            <div className="flex gap-3">
              <button
                onClick={closeSlotBookModal}
                className="flex-1 py-3 rounded-xl border-2 border-gray-300 text-gray-700 font-semibold"
              >
                ยกเลิก
              </button>
              <button
                onClick={() =>
                  handleBook(
                    slotBookModal.slot.id,
                    Math.max(1, Number(depositInput) || 0),
                  )
                }
                disabled={booking || !depositInput || Number(depositInput) < 1}
                className="flex-1 py-3 rounded-xl bg-amber-500 text-white font-semibold hover:bg-amber-600 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {bookingSlotId === slotBookModal.slot.id ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <>
                    <Wallet size={20} />
                    ยืนยันจอง
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "videos" && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-4">Verified Work Clips</h3>
          {allClips.length === 0 ? (
            <div className="text-center py-12 text-gray-500 rounded-xl bg-gray-50 border border-dashed border-gray-200">
              <Play size={48} className="mx-auto mb-2 opacity-40" />
              <p>ยังไม่มีคลิปผลงาน</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {allClips.map((clip, idx) => (
                <button
                  key={clip.id}
                  onClick={() => openStory(idx)}
                  className="aspect-[9/16] rounded-xl overflow-hidden bg-gray-900 relative group"
                >
                  {VIDEO_EXT.test(clip.url) ? (
                    <>
                      <video
                        src={clip.url}
                        className="w-full h-full object-cover"
                        muted
                        playsInline
                        preload="metadata"
                        onMouseEnter={(e) =>
                          e.currentTarget.play().catch(() => {})
                        }
                        onMouseLeave={(e) => {
                          e.currentTarget.pause();
                          e.currentTarget.currentTime = 0;
                        }}
                      />
                      <div className="absolute top-1 right-1 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-black pointer-events-none">
                        <img
                          src="/logo.png"
                          alt=""
                          className="w-3 h-3 object-contain opacity-90"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display =
                              "none";
                          }}
                        />
                        <span className="text-white font-bold text-[8px] tracking-wide">
                          aqond
                        </span>
                      </div>
                    </>
                  ) : (
                    <img
                      src={clip.url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Play size={32} className="text-white" fill="white" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "reviews" && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-4">Customer Feedback</h3>
          {reviewStats && (
            <div className="flex items-center gap-4 mb-6 p-4 rounded-xl bg-amber-50 border border-amber-100">
              <div className="flex items-center gap-1">
                <Star size={24} className="text-amber-400 fill-amber-400" />
                <span className="text-2xl font-bold text-gray-900">
                  {reviewStats.avg_overall.toFixed(1)}
                </span>
              </div>
              <span className="text-gray-600">
                {reviewStats.total_reviews} รีวิว
              </span>
            </div>
          )}
          {reviews.length === 0 ? (
            <div className="text-center py-12 text-gray-500">ยังไม่มีรีวิว</div>
          ) : (
            <ul className="space-y-4">
              {reviews.map((r) => (
                <li
                  key={r.id}
                  className="border-b border-gray-100 pb-4 last:border-0"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900">
                      {r.reviewer_name}
                    </span>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star
                          key={n}
                          size={14}
                          className={
                            n <= (r.rating_overall || 0)
                              ? "text-amber-400 fill-amber-400"
                              : "text-gray-200"
                          }
                        />
                      ))}
                    </div>
                  </div>
                  {r.comment && (
                    <p className="text-sm text-gray-600">{r.comment}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(r.created_at).toLocaleDateString("th-TH", {
                      dateStyle: "medium",
                    })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Story Full-Screen (TikTok-style vertical swiper) */}
      {storyOpen && allClips.length > 0 && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-10">
            <button
              onClick={closeStory}
              className="p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
            >
              <X size={24} />
            </button>
            <span className="text-white font-medium">
              {storyIndex + 1} / {allClips.length}
            </span>
            <div className="w-10" />
          </div>
          <div
            className="flex-1 flex items-center justify-center overflow-hidden"
            onTouchStart={handleStoryTouchStart}
            onTouchEnd={handleStoryTouchEnd}
          >
            {storyIndex > 0 && (
              <button
                onClick={goPrevStory}
                className="absolute left-2 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
              >
                <ChevronLeft size={32} />
              </button>
            )}
            <div className="w-full max-w-[min(100vw,calc(100vh*9/16))] aspect-[9/16] mx-auto bg-black relative">
              {VIDEO_EXT.test(allClips[storyIndex].url) ? (
                <VideoBrandOverlay
                  videoRef={storyVideoRef}
                  showEndCard={true}
                  loop={false}
                  onEndCardComplete={() => {
                    if (storyIndex < allClips.length - 1) goNextStory();
                    else closeStory();
                  }}
                  className="w-full h-full flex items-center justify-center"
                >
                  <video
                    ref={storyVideoRef}
                    src={allClips[storyIndex].url}
                    className="w-full h-full object-contain"
                    autoPlay
                    playsInline
                    muted={false}
                    controls
                  />
                </VideoBrandOverlay>
              ) : (
                <img
                  src={allClips[storyIndex].url}
                  alt=""
                  className="w-full h-full object-contain"
                />
              )}
            </div>
            {storyIndex < allClips.length - 1 && (
              <button
                onClick={goNextStory}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
              >
                <ChevronRight size={32} />
              </button>
            )}
          </div>
          {/* Title & Description overlay (TikTok-style) */}
          {((allClips[storyIndex] as any).title ||
            (allClips[storyIndex] as any).description) && (
            <div className="absolute bottom-16 left-0 right-0 px-4 text-left">
              {(allClips[storyIndex] as any).title && (
                <p className="text-white font-semibold text-base drop-shadow-lg">
                  {(allClips[storyIndex] as any).title}
                </p>
              )}
              {(allClips[storyIndex] as any).description && (
                <p className="text-white/90 text-sm mt-0.5 line-clamp-2 drop-shadow-lg">
                  {(allClips[storyIndex] as any).description}
                </p>
              )}
            </div>
          )}
          {/* Swipe hint */}
          <div className="absolute bottom-8 left-0 right-0 text-center text-white/60 text-sm">
            เลื่อนซ้าย/ขวา หรือกดปุ่มเพื่อเปลี่ยนคลิป
          </div>
        </div>
      )}

      {/* Persistent Action Bar — Book Now with Escrow (อยู่เหนือ bottom nav h-16) */}
      <div className="fixed bottom-16 left-0 right-0 p-4 bg-white/95 backdrop-blur border-t border-gray-200 shadow-lg z-40 md:bottom-0">
        <div className="max-w-3xl mx-auto flex gap-3">
          <button
            type="button"
            onClick={scrollToSlots}
            className="flex-1 py-3 text-center rounded-xl border-2 border-amber-500 text-amber-600 font-bold hover:bg-amber-50 transition-colors"
          >
            เลือกเวลา
          </button>
          <button
            onClick={handleBookNow}
            className="flex-1 py-3 rounded-xl bg-amber-500 text-white font-bold hover:bg-amber-600 transition-colors shadow-lg shadow-amber-200"
          >
            Book Now
          </button>
        </div>
        <p className="text-center text-xs text-gray-500 mt-2">
          การชำระเงินผ่าน Escrow — ปลอดภัย เงินจะโอนเมื่องานเสร็จสมบูรณ์
        </p>
      </div>
    </div>
  );
};

export default ExpertView;
