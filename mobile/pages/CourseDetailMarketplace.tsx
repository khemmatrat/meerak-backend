import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Award,
  BookOpen,
  Bookmark,
  CheckCircle2,
  ChevronDown,
  Clock,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  Star,
  Users,
  WalletCards,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import {
  getCourseRecommendations,
  getCoursePurchaseQuote,
  getMarketplaceCourse,
  getMyCourseReview,
  listCourseReviews,
  deleteCourseReview,
  purchaseCourse,
  createCourseGatewayPurchase,
  getCourseGatewayPurchaseStatus,
  saveMarketplaceCourse,
  submitCourseReview,
  unsaveMarketplaceCourse,
  type CoursePurchaseQuote,
  type CourseRatingDistribution,
  type CourseRecommendations,
  type CourseReview,
  type CourseReviewSort,
  type CourseWalletAffordability,
  type InstructorProfile,
  type MarketplaceCourse,
  type CourseInstallmentPlan,
  type CourseConversionMeta,
  type CourseConversionDiscount,
} from "../services/courseMarketplaceService";
import {
  clearCoursePurchaseIdempotencyKey,
  getOrCreateCoursePurchaseIdempotencyKey,
} from "../utils/coursePurchaseIdempotency";
import CoursePromoVideo from "../components/courseMarketplace/CoursePromoVideo";
import CoursePurchaseSheet from "../components/courseMarketplace/CoursePurchaseSheet";
import CourseQaPanel from "../components/courseMarketplace/CourseQaPanel";
import CoachRecommendCourseModal from "../components/courseMarketplace/CoachRecommendCourseModal";
import CourseStarRating, { formatReviewDate } from "../components/courseMarketplace/CourseStarRating";
import { useNotification } from "../context/NotificationContext";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { listConnections, type ConnectionItem } from "../services/connectionService";
import CourseMarketplaceCard, { BadgePill } from "../components/courseMarketplace/CourseMarketplaceCard";
import CourseConversionStrip from "../components/courseMarketplace/CourseConversionStrip";
import CourseFlowHeader from "../components/courseMarketplace/CourseFlowHeader";
import {
  clearPendingCoursePurchase,
  getPendingCoursePurchase,
  savePendingCoursePurchase,
} from "../utils/coursePurchasePending";
import { trackCourseFunnel } from "../utils/courseFunnelAnalytics";

function money(n?: number | null) {
  return `฿${Number(n || 0).toLocaleString()}`;
}

function formatUpdated(value?: string | null) {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(new Date(value));
  } catch {
    return null;
  }
}

function RatingBars({ distribution }: { distribution: CourseRatingDistribution | null }) {
  if (!distribution?.total) return null;
  return (
    <div className="space-y-1.5">
      {[5, 4, 3, 2, 1].map((star) => {
        const count = distribution.dist[star] || 0;
        const pct = Math.round((count / distribution.total) * 100);
        return (
          <div key={star} className="flex items-center gap-2 text-xs">
            <span className="w-8 text-amber-300">{star} ★</span>
            <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-amber-400/80" style={{ width: `${pct}%` }} />
            </div>
            <span className="w-8 text-right text-slate-500">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

function RecommendationRail({
  title,
  subtitle,
  courses,
}: {
  title: string;
  subtitle?: string;
  courses: MarketplaceCourse[];
}) {
  if (!courses.length) return null;
  return (
    <section className="luxury-card rounded-3xl p-4 space-y-3">
      <div>
        <h2 className="text-lg font-bold text-slate-100">{title}</h2>
        {subtitle ? <p className="text-sm text-slate-400">{subtitle}</p> : null}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {courses.map((course) => (
          <div key={course.id} className="shrink-0 w-[240px]">
            <CourseMarketplaceCard course={course} compact />
          </div>
        ))}
      </div>
    </section>
  );
}

function CurriculumAccordion({ course }: { course: MarketplaceCourse }) {
  const sections = course.sections || [];
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set(sections.slice(0, 1).map((s) => String(s.id || "default"))));

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {sections.map((section) => {
        const sid = String(section.id || "default");
        const open = openIds.has(sid);
        return (
          <div key={sid} className="rounded-2xl border border-slate-700 overflow-hidden">
            <button
              type="button"
              onClick={() => toggle(sid)}
              className="course-curriculum-header w-full px-4 py-3 bg-slate-800/70 font-semibold text-slate-100 flex items-center justify-between"
            >
              <span>{section.title}</span>
              <span className="inline-flex items-center gap-2 text-xs text-slate-400">
                {section.lessons.length} บท
                <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} />
              </span>
            </button>
            {open
              ? section.lessons.map((lesson) => (
                  <div key={lesson.id} className="px-4 py-3 border-t border-slate-700 flex items-center justify-between text-sm">
                    <span className="inline-flex items-center gap-2 text-slate-300">
                      <BookOpen size={15} /> {lesson.title}
                    </span>
                    {lesson.isPreview ? (
                      <span className="text-emerald-300 text-xs">Preview ฟรี</span>
                    ) : (
                      <span className="text-slate-500">{lesson.durationMin || 0} นาที</span>
                    )}
                  </div>
                ))
              : null}
          </div>
        );
      })}
    </div>
  );
}

function InstructorCard({
  course,
  profile,
}: {
  course: MarketplaceCourse;
  profile: InstructorProfile | null;
}) {
  const avatar = profile?.avatarUrl || profile?.avatar_url;
  const bio = profile?.bio || "";
  const headline = profile?.headline || "";
  return (
    <section className="luxury-card rounded-3xl p-5 space-y-3">
      <h2 className="text-lg font-bold text-slate-100">ผู้สอน</h2>
      <div className="flex items-start gap-4">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 grid place-items-center overflow-hidden shrink-0">
          {avatar ? (
            <img src={avatar} alt={course.instructorName || "instructor"} className="w-full h-full object-cover" />
          ) : (
            <Users className="text-emerald-300" size={28} />
          )}
        </div>
        <div className="min-w-0">
          <p className="font-bold text-slate-100">{course.instructorName}</p>
          {headline ? <p className="text-sm text-emerald-300 mt-0.5">{headline}</p> : null}
          <div className="flex flex-wrap gap-2 mt-2 text-xs">
            {course.trust?.instructorVerified ? (
              <span className="px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-300">Verified Provider</span>
            ) : null}
            {course.trust?.isCoachInstructor ? (
              <span className="px-2 py-1 rounded-full bg-indigo-500/15 text-indigo-300">Coach</span>
            ) : null}
          </div>
        </div>
      </div>
      {bio ? <p className="text-sm text-slate-400 leading-relaxed">{bio}</p> : null}
      {course.trust?.providerSocialProof ? (
        <p className="text-sm text-slate-400 inline-flex items-start gap-2">
          <Award size={16} className="text-blue-300 shrink-0 mt-0.5" /> {course.trust.providerSocialProof}
        </p>
      ) : null}
    </section>
  );
}

export default function CourseDetailMarketplace() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { notify } = useNotification();
  const { user } = useAuth();
  const { isCoach } = useTheme();
  const [course, setCourse] = useState<MarketplaceCourse | null>(null);
  const [quote, setQuote] = useState<CoursePurchaseQuote | null>(null);
  const [wallet, setWallet] = useState<CourseWalletAffordability | null>(null);
  const [ratingDistribution, setRatingDistribution] = useState<CourseRatingDistribution | null>(null);
  const [recommendations, setRecommendations] = useState<CourseRecommendations | null>(null);
  const [reviews, setReviews] = useState<CourseReview[]>([]);
  const [reviewSort, setReviewSort] = useState<CourseReviewSort>("newest");
  const [reviewsTotal, setReviewsTotal] = useState(0);
  const [reviewsHasMore, setReviewsHasMore] = useState(false);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [hasMyReview, setHasMyReview] = useState(false);
  const [deletingReview, setDeletingReview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [buying, setBuying] = useState(false);
  const [gatewayPaying, setGatewayPaying] = useState(false);
  const [gatewayPending, setGatewayPending] = useState<{
    chargeId: string;
    qrCodeUrl?: string | null;
    amount: number;
    paymentMethod: string;
  } | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [pendingResume, setPendingResume] = useState(false);
  const [saved, setSaved] = useState(false);
  const [instructorProfile, setInstructorProfile] = useState<InstructorProfile | null>(null);
  const [isCoachDirect, setIsCoachDirect] = useState(false);
  const [purchaseSheetOpen, setPurchaseSheetOpen] = useState(false);
  const [installment, setInstallment] = useState<CourseInstallmentPlan | null>(null);
  const [canReview, setCanReview] = useState(false);
  const [reviewProgressHint, setReviewProgressHint] = useState("");
  const [coachTrainees, setCoachTrainees] = useState<ConnectionItem[]>([]);
  const [recommendOpen, setRecommendOpen] = useState(false);
  const [conversion, setConversion] = useState<CourseConversionMeta | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [purchaseConversion, setPurchaseConversion] = useState<CourseConversionDiscount | null>(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);

  useEffect(() => {
    if (!isCoach || !user?.id) {
      setCoachTrainees([]);
      return;
    }
    let alive = true;
    listConnections()
      .then((list) => {
        if (!alive) return;
        setCoachTrainees((list.as_coach || []).filter((c) => c.status === "active"));
      })
      .catch(() => {
        if (alive) setCoachTrainees([]);
      });
    return () => {
      alive = false;
    };
  }, [isCoach, user?.id]);

  const loadReviews = useCallback(
    async (courseId: string, sort: CourseReviewSort, append = false) => {
      setReviewsLoading(true);
      try {
        const offset = append ? reviews.length : 0;
        const data = await listCourseReviews(courseId, { sort, limit: 10, offset });
        setReviews((prev) => (append ? [...prev, ...data.reviews] : data.reviews));
        setReviewsTotal(data.total);
        setReviewsHasMore(data.hasMore);
        setReviewSort(data.sort);
      } catch {
        if (!append) setReviews([]);
      } finally {
        setReviewsLoading(false);
      }
    },
    [reviews.length],
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!id) return;
      setLoading(true);
      setLoadError("");
      try {
        const pending = getPendingCoursePurchase();
        if (pending?.courseId === id) setPendingResume(true);

        const [detail, reviewData, recs] = await Promise.all([
          getMarketplaceCourse(id),
          listCourseReviews(id, { sort: "newest", limit: 10, offset: 0 }).catch(() => ({
            reviews: [],
            total: 0,
            limit: 10,
            offset: 0,
            hasMore: false,
            sort: "newest" as CourseReviewSort,
          })),
          getCourseRecommendations(id).catch(() => null),
        ]);
        if (!alive) return;
        setCourse(detail.course);
        setQuote(detail.quote);
        setWallet(detail.wallet || null);
        setRatingDistribution(detail.ratingDistribution || null);
        setRecommendations(recs);
        setReviews(reviewData.reviews);
        setReviewsTotal(reviewData.total);
        setReviewsHasMore(reviewData.hasMore);
        setReviewSort(reviewData.sort);
        setSaved(!!detail.course?.saved);
        setInstructorProfile(detail.instructorProfile || null);
        setIsCoachDirect(!!detail.isCoachDirect);
        setConversion(detail.conversion || null);
        if (detail.course?.id) {
          trackCourseFunnel(detail.course.id, "course_detail_view");
        }
        if (detail.course?.enrolled) {
          getMyCourseReview(id)
            .then((mine) => {
              if (!alive) return;
              setCanReview(!!mine.canReview);
              setHasMyReview(!!mine.review);
              if (mine.review) {
                setRating(mine.review.rating);
                setComment(mine.review.comment || "");
              }
              if (!mine.canReview && mine.minProgressPct) {
                setReviewProgressHint(
                  `เรียนไป ${Math.round(mine.progressPct || 0)}% — รีวิวได้เมื่อเรียน ${mine.minProgressPct}% ขึ้นไปหรือจบคอร์ส`,
                );
              } else {
                setReviewProgressHint("");
              }
            })
            .catch(() => {
              if (alive) setCanReview(false);
            });
        } else {
          setCanReview(false);
          setReviewProgressHint("");
        }
      } catch (e: any) {
        if (!alive) return;
        const status = e?.response?.status;
        setLoadError(
          status === 404
            ? "ไม่พบคอร์สนี้ — อาจถูกปิดขายหรือยังไม่ได้ seed ข้อมูล demo"
            : e?.response?.data?.error || "โหลดรายละเอียดคอร์สไม่สำเร็จ",
        );
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  const previewLesson = useMemo(
    () => course?.lessons?.find((l) => l.isPreview) || course?.lessons?.[0],
    [course],
  );

  const priceToPay = Number(quote?.grossAmount ?? course?.priceThb ?? 0);
  const canAfford = wallet ? wallet.canAfford : true;
  const shortfall = wallet?.shortfall ?? 0;

  const completePurchaseSuccess = (result: Awaited<ReturnType<typeof purchaseCourse>>) => {
    clearCoursePurchaseIdempotencyKey(course!.id);
    clearPendingCoursePurchase();
    setPurchaseSheetOpen(false);
    if (result.isGift) {
      notify("ส่งคอร์สเป็นของขวัญสำเร็จ — ผู้รับเริ่มเรียนได้ทันที", "success");
    } else if (result.paymentMode === "gateway") {
      notify("ชำระคอร์สผ่าน PromptPay/บัตรสำเร็จ — เริ่มเรียนได้ทันที", "success");
    } else if (result.paymentMode === "installment") {
      notify("ซื้อแบบผ่อนชำระสำเร็จ — ดาวน์จ่ายแล้ว", "success");
    } else {
      notify("ซื้อคอร์สสำเร็จ เริ่มเรียนได้ทันที", "success");
    }
    if (result.socialProof?.message) {
      setTimeout(() => notify(result.socialProof!.message, "info"), 600);
    }
    if (result.bonusPoints && result.bonusPoints > 0) {
      setTimeout(
        () => notify(`ได้รับแต้มสะสม ${result.bonusPoints} แต้มจากการซื้อคอร์สแรก`, "success"),
        900,
      );
    }
    const orderId = result?.order?.id || result?.orderId;
    if (orderId && !result.isGift) {
      navigate(`/courses/orders/${orderId}/receipt`);
    } else {
      navigate(`/courses/${course!.id}/learn`);
    }
  };

  const runPurchase = async (opts?: {
    paymentMode?: "wallet" | "installment";
    recipientUserId?: string;
    giftMessage?: string;
  }) => {
    if (!course) return;
    setBuying(true);
    const idempotencyKey = getOrCreateCoursePurchaseIdempotencyKey(course.id);
    try {
      const result = await purchaseCourse(course.id, {
        idempotencyKey,
        paymentMode: opts?.paymentMode || "wallet",
        recipientUserId: opts?.recipientUserId,
        giftMessage: opts?.giftMessage,
        installmentCount: installment?.installmentCount,
        couponCode: couponCode.trim() || undefined,
        promoCode: conversion?.promo?.promoCode || undefined,
      });
      if (result.alreadyEnrolled) {
        clearCoursePurchaseIdempotencyKey(course.id);
        notify("มีคอร์สนี้แล้ว", "info");
        navigate(`/courses/${course.id}/learn`);
        return;
      }
      completePurchaseSuccess(result);
    } catch (e: any) {
      if (e?.response?.status === 402) {
        const body = e.response.data || {};
        const need = Number(body.required ?? body.quote?.grossAmount ?? priceToPay);
        const bal = Number(body.balance ?? wallet?.balance ?? 0);
        const gap = Math.max(0, need - bal);
        savePendingCoursePurchase({
          courseId: course.id,
          title: course.title,
          requiredAmount: need,
          shortfall: gap,
        });
        notify(`ยอด Wallet ไม่พอ ขาด ${money(gap)} — เติม Wallet หรือชำระ PromptPay/บัตรใน sheet`, "warning");
        setPurchaseSheetOpen(true);
      } else if (e?.response?.status === 403) {
        notify(e?.response?.data?.error || "ไม่สามารถซื้อคอร์สนี้ได้", "warning");
      } else if (e?.response?.status === 409) {
        notify("คำขอซ้ำ — กำลังใช้ผลลัพธ์เดิม", "info");
      } else {
        notify(e?.response?.data?.error || "ซื้อคอร์สไม่สำเร็จ กรุณาลองใหม่", "error");
      }
    } finally {
      setBuying(false);
    }
  };

  const runGatewayPurchase = async (
    method: "promptpay" | "card",
    opts?: { recipientUserId?: string; giftMessage?: string },
  ) => {
    if (!course) return;
    setGatewayPaying(true);
    try {
      const result = await createCourseGatewayPurchase(course.id, {
        paymentMethod: method,
        returnUrl: `${window.location.origin}/courses/${course.id}`,
        recipientUserId: opts?.recipientUserId,
        giftMessage: opts?.giftMessage,
        couponCode: couponCode.trim() || undefined,
        promoCode: conversion?.promo?.promoCode || undefined,
      });
      if (result.authorization_uri) {
        window.location.href = result.authorization_uri;
        return;
      }
      setGatewayPending({
        chargeId: result.chargeId,
        qrCodeUrl: result.qr_code_url,
        amount: result.amount,
        paymentMethod: method,
      });
      notify("สแกน QR หรือชำระแล้วกดตรวจสอบ", "info");
    } catch (e: any) {
      notify(e?.response?.data?.error || "สร้างรายการชำระไม่สำเร็จ", "error");
    } finally {
      setGatewayPaying(false);
    }
  };

  const pollGatewayPurchase = async () => {
    if (!course || !gatewayPending) return;
    setGatewayPaying(true);
    try {
      const status = await getCourseGatewayPurchaseStatus(gatewayPending.chargeId);
      if (status.status === "success" && status.purchase) {
        setGatewayPending(null);
        completePurchaseSuccess({
          ...status.purchase,
          paymentMode: "gateway",
          ok: true,
        } as Awaited<ReturnType<typeof purchaseCourse>>);
        return;
      }
      notify("ยังไม่พบการชำระ — ลองอีกครั้งหลังโอน/ชำระแล้ว", "warning");
    } catch (e: any) {
      notify(e?.response?.data?.error || "ตรวจสอบการชำระไม่สำเร็จ", "error");
    } finally {
      setGatewayPaying(false);
    }
  };

  const openPurchaseSheet = async () => {
    if (!course) return;
    if (course.enrolled) {
      navigate(`/courses/${course.id}/learn`);
      return;
    }
    if (Number(priceToPay) <= 0) {
      await runPurchase({ paymentMode: "wallet" });
      return;
    }
    trackCourseFunnel(course.id, "course_purchase_intent", { price: priceToPay });
    try {
      const fresh = await getCoursePurchaseQuote(course.id, {
        couponCode: couponCode.trim() || undefined,
        promoCode: conversion?.promo?.promoCode || undefined,
      });
      setQuote(fresh.quote);
      setWallet(fresh.wallet || null);
      setInstallment(fresh.installment || null);
      setPurchaseConversion(fresh.conversion || null);
      setIsCoachDirect(!!fresh.isCoachDirect);
      if (fresh.enrolled) {
        notify("คุณมีคอร์สนี้แล้ว", "info");
        navigate(`/courses/${course.id}/learn`);
        return;
      }
      if (fresh.isFree || Number(fresh.quote?.grossAmount || 0) <= 0) {
        await runPurchase({ paymentMode: "wallet" });
        return;
      }
      setPurchaseSheetOpen(true);
    } catch (e: any) {
      const is404 = e?.response?.status === 404;
      if (is404 && quote) {
        if (Number(quote.grossAmount || 0) <= 0) {
          await runPurchase({ paymentMode: "wallet" });
          return;
        }
        notify("ใช้ราคาจากหน้ารายละเอียด — restart backend เพื่อ purchase-quote API", "warning");
        setPurchaseSheetOpen(true);
        return;
      }
      const msg = e?.response?.data?.error || (is404 ? "purchase API ยังไม่พร้อม — ลอง restart backend" : "โหลดราคาซื้อไม่สำเร็จ");
      notify(msg, is404 ? "warning" : "error");
    }
  };

  const handlePurchase = async (opts: {
    paymentMode: "wallet" | "installment";
    recipientUserId?: string;
    giftMessage?: string;
  }) => {
    await runPurchase(opts);
  };

  const handleGatewayFromSheet = async (
    method: "promptpay" | "card",
    opts: { recipientUserId?: string; giftMessage?: string },
  ) => {
    await runGatewayPurchase(method, opts);
  };

  const handleTopUpFromSheet = () => {
    if (!course) return;
    savePendingCoursePurchase({
      courseId: course.id,
      title: course.title,
      requiredAmount: priceToPay,
      shortfall,
    });
    setPurchaseSheetOpen(false);
    navigate("/profile?tab=wallet&openDeposit=1");
  };

  const handleToggleSave = async () => {
    if (!course) return;
    try {
      if (saved) {
        await unsaveMarketplaceCourse(course.id);
        setSaved(false);
        notify("ลบออกจากที่บันทึกแล้ว", "info");
      } else {
        await saveMarketplaceCourse(course.id);
        setSaved(true);
        notify("บันทึกคอร์สแล้ว", "success");
      }
    } catch (e: any) {
      if (e?.response?.status === 401) notify("เข้าสู่ระบบก่อนบันทึกคอร์ส", "warning");
      else notify("บันทึกคอร์สไม่สำเร็จ", "error");
    }
  };

  const handleReview = async () => {
    if (!course) return;
    try {
      const result = await submitCourseReview(course.id, rating, comment);
      notify(hasMyReview ? "อัปเดตรีวิวแล้ว" : "บันทึกรีวิวแล้ว", "success");
      setHasMyReview(true);
      await loadReviews(course.id, reviewSort);
      if (result.ratingAvg != null) {
        setCourse((c) =>
          c
            ? {
                ...c,
                ratingAvg: result.ratingAvg,
                ratingCount: result.ratingCount ?? c.ratingCount,
              }
            : c,
        );
      }
      if (result.review) {
        setRating(result.review.rating);
        setComment(result.review.comment || "");
      }
    } catch (e: any) {
      notify(e?.response?.data?.error || "รีวิวได้หลังเรียนคอร์สตามเงื่อนไข", "warning");
    }
  };

  const handleDeleteReview = async () => {
    if (!course || deletingReview) return;
    if (!window.confirm("ลบรีวิวของคุณ?")) return;
    setDeletingReview(true);
    try {
      const result = await deleteCourseReview(course.id);
      notify("ลบรีวิวแล้ว", "info");
      setHasMyReview(false);
      setRating(5);
      setComment("");
      await loadReviews(course.id, reviewSort);
      if (result.ratingAvg != null) {
        setCourse((c) =>
          c
            ? {
                ...c,
                ratingAvg: result.ratingAvg,
                ratingCount: result.ratingCount ?? c.ratingCount,
              }
            : c,
        );
      }
    } catch (e: any) {
      notify(e?.response?.data?.error || "ลบรีวิวไม่สำเร็จ", "error");
    } finally {
      setDeletingReview(false);
    }
  };

  const handleApplyCoupon = async () => {
    if (!course || !couponCode.trim()) return;
    setApplyingCoupon(true);
    try {
      const fresh = await getCoursePurchaseQuote(course.id, { couponCode: couponCode.trim() });
      setQuote(fresh.quote);
      setWallet(fresh.wallet || null);
      setPurchaseConversion(fresh.conversion || null);
      if (fresh.conversion?.coupon) {
        notify(`ใช้โค้ด ${fresh.conversion.coupon.code} สำเร็จ`, "success");
      } else {
        notify("โค้ดไม่ถูกต้องหรือใช้ไม่ได้", "warning");
      }
    } catch {
      notify("ตรวจโค้ดไม่สำเร็จ", "error");
    } finally {
      setApplyingCoupon(false);
    }
  };

  const handleReviewSortChange = async (sort: CourseReviewSort) => {
    if (!course || sort === reviewSort) return;
    setReviewSort(sort);
    await loadReviews(course.id, sort);
  };

  if (loading) {
    return <div className="aqond-trust-theme course-flow-theme min-h-screen pb-24"><div className="luxury-card rounded-3xl h-96 animate-pulse" /></div>;
  }

  if (loadError || !course) {
    return (
      <div className="aqond-trust-theme course-flow-theme min-h-screen pb-24 space-y-4">
        <CourseFlowHeader title="รายละเอียดคอร์ส" backTo="/courses" backLabel="ตลาดคอร์ส" />
        <div className="luxury-card rounded-3xl p-8 text-center">
          <BookOpen className="mx-auto text-slate-400" size={32} />
          <h2 className="text-xl font-bold text-slate-100 mt-3">ไม่พบคอร์ส</h2>
          <p className="text-slate-400 text-sm mt-1">{loadError || "คอร์สนี้อาจถูกลบหรือยังไม่เปิดขาย"}</p>
          <Link to="/courses" className="inline-flex mt-4 px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold">
            กลับตลาดคอร์ส
          </Link>
        </div>
      </div>
    );
  }

  const updatedLabel = formatUpdated(course.trust?.lastUpdated);

  return (
    <div className="aqond-trust-theme course-flow-theme course-flow-has-bar min-h-screen space-y-6">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <CourseFlowHeader title={course.title} backTo="/courses" backLabel="ตลาดคอร์ส" />
        </div>
        {!course.enrolled ? (
          <button
            type="button"
            onClick={handleToggleSave}
            aria-label={saved ? "ลบออกจากที่บันทึก" : "บันทึกคอร์ส"}
            className="mr-4 p-3 rounded-2xl bg-slate-900 border border-slate-700 text-slate-200 shrink-0"
          >
            <Bookmark size={20} className={saved ? "fill-rose-400 text-rose-400" : ""} />
          </button>
        ) : null}
      </div>
      {pendingResume && !course.enrolled ? (
        <section className="course-pending-banner rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 flex items-start gap-3">
          <RefreshCw className="text-amber-300 shrink-0 mt-0.5" size={18} />
          <div className="flex-1">
            <p className="font-bold text-amber-100">คุณค้างซื้อคอร์สนี้อยู่</p>
            <p className="text-sm text-amber-100/80 mt-1">เติม Wallet แล้วกดซื้อต่อได้ทันที — Wallet 1-tap</p>
          </div>
          <button onClick={() => runPurchase({ paymentMode: "wallet" })} className="px-3 py-2 rounded-xl bg-amber-500 text-slate-950 text-sm font-bold">
            ซื้อต่อ
          </button>
        </section>
      ) : null}

      <section className="course-flow-dark rounded-[32px] overflow-hidden bg-slate-950 border border-emerald-400/20 shadow-xl">
        <div className="aspect-video bg-emerald-500/10 relative">
          {course.imageUrl ? (
            <img src={course.imageUrl} alt={course.title} className="w-full h-full object-cover opacity-90" />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
          {previewLesson ? (
            <Link
              to={course.enrolled ? `/courses/${course.id}/learn` : `/courses/${course.id}/learn?preview=1`}
              className="absolute inset-0 grid place-items-center"
              onClick={() => trackCourseFunnel(course.id, "course_preview_play")}
            >
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/90 text-slate-900 font-bold">
                <PlayCircle size={22} /> ดูตัวอย่างฟรี
              </span>
            </Link>
          ) : null}
        </div>
        <div className="p-5 space-y-4">
          <div className="flex flex-wrap gap-2 text-xs">
            {(course.badges || []).map((badge) => (
              <BadgePill key={badge.id} badge={badge} />
            ))}
            {isCoachDirect ? (
              <span className="px-2 py-1 rounded-full bg-indigo-500/15 text-indigo-300">ส่วนลดศิษย์โค้ช</span>
            ) : null}
            <span className="px-2 py-1 rounded-full bg-amber-500/15 text-amber-300">{course.language?.toUpperCase()}</span>
          </div>
          <div>
            <h1 className="text-3xl font-black text-white leading-tight">{course.title}</h1>
            <p className="text-slate-300 mt-2">{course.subtitle || course.description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-400">
            <span className="inline-flex items-center gap-1"><Star className="text-amber-300 fill-current" size={16} /> {Number(course.ratingAvg || 0).toFixed(1)} ({course.ratingCount || 0})</span>
            <span className="inline-flex items-center gap-1"><Users size={16} /> {course.totalEnrolled || 0} ผู้เรียน</span>
            <span className="inline-flex items-center gap-1"><Clock size={16} /> {course.duration || 0} นาที</span>
            {updatedLabel ? <span>อัปเดต {updatedLabel}</span> : null}
          </div>
          <p className="text-sm text-slate-400">
            ผู้สอน: <span className="text-emerald-300 font-semibold">{course.instructorName}</span>
            {course.trust?.instructorVerified ? <span className="ml-2 text-emerald-400">· Verified Provider</span> : null}
            {course.trust?.isCoachInstructor ? <span className="ml-2 text-indigo-300">· Coach</span> : null}
          </p>
        </div>
      </section>

      {course.promoVideoUrl ? <CoursePromoVideo url={course.promoVideoUrl} title={course.title} /> : null}

      <InstructorCard course={course} profile={instructorProfile} />

      {isCoach && coachTrainees.length > 0 ? (
        <section className="luxury-card rounded-3xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-indigo-200">โค้ชแนะนำให้ศิษย์</p>
            <p className="text-xs text-slate-400 mt-0.5">ศิษย์จะเห็นคอร์สนี้ในแท็บ &quot;โค้ชแนะนำ&quot; บนตลาดคอร์ส</p>
          </div>
          <button
            type="button"
            onClick={() => setRecommendOpen(true)}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-sm"
          >
            แนะนำคอร์ส
          </button>
        </section>
      ) : null}

      <CoachRecommendCourseModal
        courseId={course.id}
        courseTitle={course.title}
        trainees={coachTrainees}
        open={recommendOpen}
        onClose={() => setRecommendOpen(false)}
        notify={notify}
      />

      {!course.enrolled ? (
        <CourseConversionStrip
          conversion={conversion}
          couponCode={couponCode}
          onCouponCodeChange={setCouponCode}
          onApplyCoupon={handleApplyCoupon}
          applyingCoupon={applyingCoupon}
        />
      ) : null}

      <section className="luxury-card rounded-3xl p-5 space-y-3">
        <h2 className="text-lg font-bold text-slate-100 inline-flex items-center gap-2">
          <ShieldCheck size={18} className="text-emerald-300" /> ทำไมซื้อได้มั่นใจ
        </h2>
        <div className="grid gap-2 sm:grid-cols-2 text-sm">
          <div className="rounded-2xl bg-emerald-500/10 border border-emerald-400/20 p-3 text-emerald-100">
            การันตีคืนเงิน {course.trust?.guaranteeDays || 7} วัน (ก่อนเรียนเกิน 20%)
          </div>
          <div className="rounded-2xl bg-slate-900/70 p-3 text-slate-300">
            {course.trust?.hasPreview ? "มีบทเรียนตัวอย่างฟรีให้ลองก่อนซื้อ" : "ดูรายละเอียดและ curriculum ก่อนตัดสินใจ"}
          </div>
          {course.trust?.socialProof ? (
            <div className="rounded-2xl bg-slate-900/70 p-3 text-slate-300 inline-flex items-start gap-2">
              <Sparkles size={16} className="text-amber-300 shrink-0 mt-0.5" /> {course.trust.socialProof}
            </div>
          ) : null}
          {course.trust?.providerSocialProof ? (
            <div className="rounded-2xl bg-slate-900/70 p-3 text-slate-300 inline-flex items-start gap-2">
              <Award size={16} className="text-blue-300 shrink-0 mt-0.5" /> {course.trust.providerSocialProof}
            </div>
          ) : null}
        </div>
      </section>

      <section className="luxury-card rounded-3xl p-5">
        <h2 className="text-xl font-bold text-slate-100 mb-3">คุณจะได้อะไรจากคอร์สนี้</h2>
        <div className="grid gap-2">
          {(course.learningOutcomes || []).map((o) => (
            <div key={o} className="flex items-start gap-2 text-sm text-slate-300">
              <CheckCircle2 size={18} className="text-emerald-300 shrink-0 mt-0.5" /> {o}
            </div>
          ))}
        </div>
      </section>

      {(course.requirements || []).length ? (
        <section className="luxury-card rounded-3xl p-5">
          <h2 className="text-xl font-bold text-slate-100 mb-3">ควรมีพื้นฐาน</h2>
          <div className="grid gap-2">
            {(course.requirements || []).map((req) => (
              <div key={req} className="flex items-start gap-2 text-sm text-slate-300">
                <CheckCircle2 size={18} className="text-slate-500 shrink-0 mt-0.5" /> {req}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="luxury-card rounded-3xl p-5">
        <h2 className="text-xl font-bold text-slate-100 mb-3">หลักสูตร</h2>
        <CurriculumAccordion course={course} />
      </section>

      <section className="luxury-card rounded-3xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-xl font-bold text-slate-100">รีวิวจากผู้เรียน</h2>
          {reviewsTotal > 0 ? (
            <span className="text-xs text-slate-500">{reviewsTotal} รีวิว</span>
          ) : null}
        </div>
        {ratingDistribution?.total ? (
          <div className="mb-4">
            <RatingBars distribution={ratingDistribution} />
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2 mb-4">
          {(
            [
              ["newest", "ล่าสุด"],
              ["rating_high", "คะแนนสูง"],
              ["rating_low", "คะแนนต่ำ"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => handleReviewSortChange(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                reviewSort === key
                  ? "bg-emerald-600 border-emerald-500 text-white"
                  : "border-slate-600 text-slate-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {reviews.length === 0 && !reviewsLoading ? (
            <p className="text-sm text-slate-400">ยังไม่มีรีวิว เป็นคนแรกที่ให้คะแนนหลังเรียนได้เลย</p>
          ) : null}
          {reviews.map((r) => (
            <div key={r.id} className="rounded-2xl bg-slate-800/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-amber-300">
                  {"★".repeat(r.rating)}
                  <span className="text-slate-600">{"★".repeat(5 - r.rating)}</span>
                </p>
                {r.created_at ? (
                  <span className="text-xs text-slate-500">{formatReviewDate(r.created_at)}</span>
                ) : null}
              </div>
              <p className="text-sm text-slate-200 mt-1">{r.comment}</p>
              <p className="text-xs text-slate-500 mt-1">{r.full_name || "ผู้เรียน"}</p>
            </div>
          ))}
        </div>
        {reviewsHasMore ? (
          <button
            type="button"
            disabled={reviewsLoading}
            onClick={() => course && loadReviews(course.id, reviewSort, true)}
            className="mt-4 w-full py-2 rounded-xl border border-slate-600 text-slate-200 text-sm font-semibold disabled:opacity-50"
          >
            {reviewsLoading ? "กำลังโหลด..." : "โหลดรีวิวเพิ่ม"}
          </button>
        ) : null}
        {course.enrolled && canReview ? (
          <div className="mt-4 rounded-2xl border border-slate-700 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MessageCircle size={16} className="text-emerald-300" />
                <span className="font-semibold text-slate-100">
                  {hasMyReview ? "แก้ไขรีวิวของคุณ" : "ให้รีวิวคอร์ส"}
                </span>
              </div>
              {hasMyReview ? (
                <button
                  type="button"
                  onClick={handleDeleteReview}
                  disabled={deletingReview}
                  className="text-xs text-rose-300 font-semibold disabled:opacity-50"
                >
                  {deletingReview ? "กำลังลบ..." : "ลบรีวิว"}
                </button>
              ) : null}
            </div>
            <CourseStarRating value={rating} onChange={setRating} />
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="คอร์สนี้ช่วยคุณอย่างไร"
              className="w-full min-h-24 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 px-3 py-2"
            />
            <button onClick={handleReview} className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold">
              {hasMyReview ? "อัปเดตรีวิว" : "ส่งรีวิว"}
            </button>
          </div>
        ) : course.enrolled && reviewProgressHint ? (
          <p className="mt-4 text-sm rounded-2xl border border-amber-200 bg-amber-50 p-3 text-slate-700">
            {reviewProgressHint}
          </p>
        ) : null}
      </section>

      <CourseQaPanel
        courseId={course.id}
        canPost={!!course.enrolled}
        instructorUserId={course.instructorUserId}
        currentUserId={user?.id || null}
        compact={false}
      />

      <RecommendationRail
        title="คอร์สในหมวดเดียวกัน"
        subtitle="คนที่ดูคอร์สนี้มักสนใจ"
        courses={recommendations?.sameCategory || []}
      />
      <RecommendationRail
        title="โค้ชของคุณแนะนำ"
        subtitle="คอร์สที่โค้ช assign ให้ศิษย์"
        courses={recommendations?.fromCoach || []}
      />
      <RecommendationRail
        title="เพิ่มโอกาสได้งาน"
        subtitle="คอร์สทักษะที่ช่วยปิดงานบริการ"
        courses={recommendations?.careerBoost || []}
      />

      <div className="course-flow-bar fixed left-0 right-0 bottom-0 z-50 bg-slate-950/95 backdrop-blur border-t border-slate-800 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="flex-1 min-w-0">
            {quote && quote.anchorPrice > quote.grossAmount ? (
              <p className="text-xs text-slate-500 line-through">{money(quote.anchorPrice)}</p>
            ) : null}
            <p className="text-2xl font-black text-emerald-300">{money(priceToPay)}</p>
            <p className="text-xs text-slate-500 truncate">
              {wallet ? (
                <>
                  Wallet ฿{wallet.balance.toLocaleString()}
                  {!canAfford && !course.enrolled ? ` · ขาด ${money(shortfall)}` : " · 1-tap"}
                </>
              ) : (
                <span className="inline-flex items-center gap-1"><ShieldCheck size={13} /> Wallet 1-tap</span>
              )}
            </p>
          </div>
          {!course.enrolled && wallet && !canAfford ? (
            <button
              onClick={() => {
                savePendingCoursePurchase({
                  courseId: course.id,
                  title: course.title,
                  requiredAmount: priceToPay,
                  shortfall,
                });
                navigate("/profile?tab=wallet&openDeposit=1");
              }}
              className="px-4 py-3 rounded-2xl bg-amber-500 text-slate-950 font-black text-sm"
            >
              เติม {money(shortfall)}
            </button>
          ) : null}
          <button
            onClick={() => {
              if (course.enrolled) navigate(`/courses/${course.id}/learn`);
              else openPurchaseSheet();
            }}
            disabled={buying}
            className="px-5 py-3 rounded-2xl bg-emerald-600 text-white font-black disabled:opacity-60 inline-flex items-center gap-2 shrink-0"
          >
            <WalletCards size={18} /> {course.enrolled ? "เรียนต่อ" : buying ? "กำลังซื้อ..." : "ซื้อคอร์ส"}
          </button>
        </div>
      </div>

      <CoursePurchaseSheet
        open={purchaseSheetOpen}
        title={course.title}
        quote={quote}
        wallet={wallet}
        installment={installment}
        isCoachDirect={isCoachDirect}
        conversion={purchaseConversion}
        buying={buying}
        onClose={() => setPurchaseSheetOpen(false)}
        onConfirm={handlePurchase}
        onTopUp={handleTopUpFromSheet}
        onPayGateway={handleGatewayFromSheet}
        gatewayPaying={gatewayPaying}
        gatewayPending={gatewayPending}
        onPollGateway={pollGatewayPurchase}
      />
    </div>
  );
}
