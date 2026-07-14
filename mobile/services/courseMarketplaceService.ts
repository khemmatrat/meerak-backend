import { api } from "./api";

export type MarketplaceCourse = {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  category?: string;
  duration?: number;
  level?: string;
  imageUrl?: string;
  instructorUserId?: string | null;
  instructorName?: string;
  priceThb?: number;
  originalPriceThb?: number | null;
  currency?: string;
  status?: string;
  promoVideoUrl?: string;
  thumbnailVariants?: Record<string, string>;
  language?: string;
  learningOutcomes?: string[];
  requirements?: string[];
  totalEnrolled?: number;
  ratingAvg?: number;
  ratingCount?: number;
  enrolled?: boolean;
  saved?: boolean;
  progressPct?: number;
  completedAt?: string | null;
  lastLessonId?: string | null;
  learningStreakDays?: number;
  lastActivityAt?: string | null;
  sequentialUnlock?: boolean;
  sections?: CourseSection[];
  lessons?: CourseLesson[];
  badges?: CourseBadge[];
  trust?: CourseTrustMeta;
};

export type CourseBadge = {
  id: string;
  label: string;
};

export type CourseTrustMeta = {
  guaranteeDays: number;
  hasPreview: boolean;
  previewCount: number;
  instructorVerified: boolean;
  isCoachInstructor: boolean;
  lastUpdated?: string | null;
  categoryEnrolled: number;
  socialProof?: string;
  providerSocialProof?: string | null;
};

export type CourseWalletAffordability = {
  balance: number;
  required: number;
  canAfford: boolean;
  shortfall: number;
  creditLineLimit?: number;
  creditLineUsed?: number;
};

export type CourseInstallmentPlan = {
  eligible: boolean;
  reason?: string | null;
  minGrossThb?: number;
  installmentCount?: number;
  targetDownPayment?: number;
  walletDown?: number;
  creditPrincipal?: number;
  creditAvailable?: number;
  installmentAmount?: number;
  totalGross?: number;
};

export type CoursePurchaseSocialProof = {
  todayRank: number;
  message: string;
};

export type CoursePromoUrgency = {
  bannerId?: string;
  title?: string;
  promoCode?: string | null;
  description?: string | null;
  endsAt?: string;
  countdownSeconds?: number;
};

export type CourseLimitedSeats = {
  seatsRemaining: number;
  urgencyLabel: string;
};

export type CourseRecentBuyer = {
  displayName: string;
  purchasedAt?: string | null;
};

export type CourseBundleOffer = {
  id: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  bundlePriceThb: number;
  originalPriceThb: number;
  savingsThb: number;
  courses: Array<{ courseId: string; title: string; priceThb?: number }>;
};

export type CourseConversionMeta = {
  promo?: CoursePromoUrgency | null;
  limitedSeats?: CourseLimitedSeats | null;
  recentBuyers?: CourseRecentBuyer[];
  bundles?: CourseBundleOffer[];
  firstPurchaseEligible?: boolean;
  firstPurchaseDiscountRate?: number;
  firstPurchaseBonusPoints?: number;
};

export type CourseConversionDiscount = {
  coupon?: { id: string; code: string; discountPercent: number } | null;
  voucher?: { id: string; promoCode: string; discountThb: number } | null;
  firstPurchaseApplied?: boolean;
  firstPurchaseBonusPoints?: number;
  discountBreakdown?: {
    couponDiscountRate?: number;
    firstPurchaseDiscountRate?: number;
    voucherDiscountThb?: number;
    totalSavings?: number;
  };
};

export type CoursePurchaseOptions = {
  recipientUserId?: string;
  giftMessage?: string;
  paymentMode?: "wallet" | "installment";
  installmentCount?: number;
  idempotencyKey?: string;
  couponCode?: string;
  voucherId?: string;
  promoCode?: string;
};

export type CourseRatingDistribution = {
  dist: Record<number, number>;
  total: number;
};

export type CourseRecommendations = {
  sameCategory: MarketplaceCourse[];
  fromCoach: MarketplaceCourse[];
  careerBoost: MarketplaceCourse[];
};

export type CourseSection = {
  id: string | null;
  title: string;
  sortOrder?: number;
  lessons: CourseLesson[];
};

export type CourseLesson = {
  id: string;
  sectionId?: string | null;
  title: string;
  sortOrder?: number;
  stepType?: string;
  videoUrl?: string;
  textContent?: string;
  durationMin?: number;
  isPreview?: boolean;
  resourceUrls?: string[];
  quizPassPercent?: number;
  watchedSecondsRequired?: number;
  hasVideo?: boolean;
};

export type CourseLessonProgress = {
  watchedSeconds: number;
  completed: boolean;
  completedAt?: string | null;
  updatedAt?: string | null;
};

export type CourseProgressState = {
  enrolled: boolean;
  progressPct: number;
  completedAt?: string | null;
  lastLessonId?: string | null;
  learningStreakDays: number;
  lastActivityAt?: string | null;
  sequentialUnlock: boolean;
  completedLessonIds: string[];
  lessonProgress: Record<string, CourseLessonProgress>;
  notes: Record<string, { body: string; updatedAt?: string }>;
  certificate?: {
    id: string;
    verifyCode: string;
    issuedAt: string;
  } | null;
};

export type ContinueLearningCourse = {
  courseId: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  instructorName?: string;
  progressPct: number;
  lastLessonId?: string | null;
  learningStreakDays?: number;
  lastActivityAt?: string | null;
};

export type CourseCompletionBadge = {
  courseId: string;
  courseTitle: string;
  completedAt?: string | null;
  verifyCode?: string | null;
  outcomes: string[];
};

export type CoachTraineeCourseProgress = {
  traineeId: string;
  traineeName: string;
  traineeEmail?: string;
  connectionId: string;
  courses: Array<{
    courseId: string;
    courseTitle: string;
    progressPct: number;
    completedAt?: string | null;
    lastLessonId?: string | null;
    lastActivityAt?: string | null;
    learningStreakDays?: number;
  }>;
};

export type CoursePurchaseQuote = {
  currency: string;
  listPrice: number;
  anchorPrice: number;
  discountRate: number;
  grossAmount: number;
  platformRate: number;
  platformFee: number;
  instructorNet: number;
  savingsAmount: number;
};

export type CourseReview = {
  id: string;
  userId?: string;
  rating: number;
  comment?: string;
  full_name?: string;
  created_at?: string;
  updated_at?: string;
};

export type CourseReviewList = {
  reviews: CourseReview[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  sort: "newest" | "rating_high" | "rating_low";
};

export type CourseReviewSort = CourseReviewList["sort"];

export type CourseReviewMine = {
  review: {
    id: string;
    rating: number;
    comment: string;
    createdAt?: string;
    updatedAt?: string;
  } | null;
  canReview: boolean;
  progressPct: number;
  minProgressPct?: number;
  code?: string;
};

export type CourseQaMessage = {
  id: string;
  courseId: string;
  lessonId?: string | null;
  userId: string;
  userName: string;
  parentId?: string | null;
  body: string;
  isInstructor?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type CourseQaThread = CourseQaMessage & {
  replies?: CourseQaMessage[];
};

export type CourseOrderReceipt = {
  id: string;
  orderId: string;
  receiptNo: string;
  transactionNo?: string;
  ledgerId?: string | null;
  payoutLedgerId?: string | null;
  status: string;
  refundStatus?: string;
  payoutStatus?: string;
  payoutReleaseAt?: string | null;
  payoutReleasedAt?: string | null;
  refundedAt?: string | null;
  currency: string;
  gateway: string;
  createdAt?: string;
  grossAmount: number;
  platformFee: number;
  instructorNet: number;
  whtWithheld?: number;
  whtRatePercent?: number;
  netReleasedAfterWht?: number;
  whtEligibility?: string | null;
  course: {
    id: string;
    title: string;
    subtitle?: string;
    imageUrl?: string;
  };
  buyer: {
    id?: string;
    name: string;
  };
  instructor: {
    id?: string | null;
    name: string;
  };
};

export type CourseTaxDocument = {
  id: string;
  documentType: string;
  documentNo?: string | null;
  status: string;
  purpose: string;
  label: string;
  issuedAt?: string | null;
  downloadable: boolean;
};

export type CourseOrderTaxDocumentsPayload = {
  orderId: string;
  courseTitle?: string;
  payoutStatus?: string;
  wht?: {
    withheld?: number;
    ratePercent?: number;
    netReleased?: number;
    eligibility?: string | null;
  };
  taxProfileHint?: {
    code?: string;
    message?: string;
  } | null;
  documents: CourseTaxDocument[];
};

export type CourseRefundEligibility = {
  orderId: string;
  status: string;
  refundStatus: string;
  payoutStatus?: string;
  payoutReleaseAt?: string | null;
  eligibility: {
    eligible: boolean;
    code: string;
    reason: string;
    progressPct?: number;
    ageDays?: number;
  };
  policy: {
    guaranteeDays: number;
    maxProgressPct: number;
  };
};

export type InstructorWalletSnapshot = {
  pending: number;
  balance: number;
  withdrawable: number;
};

export type InstructorEarningsSummary = {
  orders?: number;
  gross?: number;
  platform_fee?: number;
  instructor_net?: number;
  gross_today?: number;
  gross_month?: number;
  instructor_net_today?: number;
  instructor_net_month?: number;
  payouts_pending?: number;
  payouts_released?: number;
  payouts_blocked?: number;
  pending_net?: number;
  released_net?: number;
};

export type InstructorCourseEarnings = {
  summary: InstructorEarningsSummary;
  wallet: InstructorWalletSnapshot;
  recent: CourseOrderReceipt[];
};

export type InstructorPayoutForecast = {
  nextReleaseAt?: string | null;
  nextFutureReleaseAt?: string | null;
  releasableNowNet?: number;
  heldUntilFutureNet?: number;
  heldOrders?: number;
};

export type InstructorSalesDashboard = {
  summary: InstructorEarningsSummary;
  wallet: InstructorWalletSnapshot;
  forecast?: InstructorPayoutForecast;
  topCourses: Array<Record<string, unknown>>;
  recent: CourseOrderReceipt[];
};

export type BuyerCourseOrdersPage = {
  orders: CourseOrderReceipt[];
  total: number;
  limit: number;
  offset: number;
};

export type AdminCoursePayoutSummary = {
  held?: number;
  released?: number;
  blocked?: number;
  held_net?: number;
  blocked_net?: number;
};

export type CourseQualityItem = {
  id: string;
  label: string;
  ok: boolean;
  required: boolean;
};

export type CourseQualityChecklist = {
  items: CourseQualityItem[];
  ready: boolean;
  score: number;
  stats?: {
    previewCount: number;
    paidCount: number;
    duration: number;
    outcomeCount: number;
    sectionCount?: number;
  };
};

export type CourseQuizQuestion = {
  id: string;
  courseId?: string;
  questionText: string;
  options: Array<{ id: string; text: string }>;
  correctOptionId: string;
  sortOrder?: number;
};

export type CourseRevenueProjection = {
  units: number;
  gross: number;
  platformFee: number;
  instructorNet: number;
};

export type InstructorProfile = {
  userId?: string | null;
  user_id?: string;
  headline?: string;
  bio?: string;
  avatarUrl?: string;
  avatar_url?: string;
  payoutEligible?: boolean;
  payout_eligible?: boolean;
};

export type CourseStudioWizard = {
  course: MarketplaceCourse;
  quote: CoursePurchaseQuote;
  checklist: CourseQualityChecklist;
  projections: CourseRevenueProjection[];
  questions?: CourseQuizQuestion[];
  instructorProfile: InstructorProfile;
};

export async function listMarketplaceCourses(params: Record<string, string> = {}) {
  const { data } = await api.get("/courses/marketplace", { params });
  return (data?.courses || []) as MarketplaceCourse[];
}

export type CourseMarketplaceEmptyReason = "api_unavailable" | "empty_catalog" | "filter_no_match";

export type CourseMarketplaceHealth = {
  ok?: boolean;
  hint?: string;
  publishedCourses?: number;
  previewLessons?: number;
  emptyCatalogReason?: CourseMarketplaceEmptyReason | null;
  demoCourseIds?: { paid?: string; free?: string };
  freeDemoCourseId?: string;
  paidDemoCourseId?: string;
  marketplaceRoutes?: boolean;
  studioRoutes?: boolean;
  purchaseRoutes?: boolean;
  devRestartChecklist?: string[];
};

export async function getCourseMarketplaceHealth() {
  const { data } = await api.get("/course-marketplace/health");
  return data as CourseMarketplaceHealth;
}

export async function listSavedMarketplaceCourseIds() {
  const { data } = await api.get("/courses/marketplace/saved-ids");
  return (data?.ids || []) as string[];
}

export async function listSavedMarketplaceCourses() {
  const { data } = await api.get("/courses/marketplace/saved");
  return (data?.courses || []) as MarketplaceCourse[];
}

export async function saveMarketplaceCourse(id: string) {
  const { data } = await api.post(`/courses/marketplace/${encodeURIComponent(id)}/save`, {});
  return data as { ok: boolean; saved: boolean };
}

export async function unsaveMarketplaceCourse(id: string) {
  const { data } = await api.delete(`/courses/marketplace/${encodeURIComponent(id)}/save`);
  return data as { ok: boolean; saved: boolean };
}

export async function getMarketplaceCourse(id: string) {
  const { data } = await api.get(`/courses/marketplace/${encodeURIComponent(id)}`);
  return data as {
    course: MarketplaceCourse;
    quote: CoursePurchaseQuote;
    ratingDistribution?: CourseRatingDistribution;
    wallet?: CourseWalletAffordability | null;
    isCoachDirect?: boolean;
    instructorProfile?: InstructorProfile | null;
    conversion?: CourseConversionMeta | null;
  };
}

export async function listCourseBundles() {
  const { data } = await api.get("/courses/marketplace/bundles");
  return (data?.bundles || []) as CourseBundleOffer[];
}

export async function getCourseRecommendations(id: string) {
  const { data } = await api.get(`/courses/marketplace/${encodeURIComponent(id)}/recommendations`);
  return data as CourseRecommendations;
}

export async function recommendCourseToTrainee(courseId: string, traineeId: string, note = "") {
  const { data } = await api.post(`/courses/${encodeURIComponent(courseId)}/recommend`, {
    traineeId,
    note,
  });
  return data as { recommendation: Record<string, unknown>; courseTitle?: string };
}

export async function getCoursePurchaseQuote(
  id: string,
  opts?: { recipientUserId?: string; couponCode?: string; voucherId?: string; promoCode?: string },
) {
  const params: Record<string, string> = {};
  if (opts?.recipientUserId) params.recipientUserId = opts.recipientUserId;
  if (opts?.couponCode) params.couponCode = opts.couponCode;
  if (opts?.voucherId) params.voucherId = opts.voucherId;
  if (opts?.promoCode) params.promoCode = opts.promoCode;
  const { data } = await api.get(`/courses/${encodeURIComponent(id)}/purchase-quote`, {
    params: Object.keys(params).length ? params : undefined,
  });
  return data as {
    courseId: string;
    title: string;
    quote: CoursePurchaseQuote;
    isCoachDirect?: boolean;
    wallet?: CourseWalletAffordability | null;
    installment?: CourseInstallmentPlan | null;
    conversion?: CourseConversionDiscount | null;
    enrolled?: boolean;
    isFree?: boolean;
    guaranteeDays?: number;
  };
}

export async function purchaseCourse(id: string, options: CoursePurchaseOptions = {}) {
  const headers: Record<string, string> = {};
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
  const { data } = await api.post(
    `/courses/${encodeURIComponent(id)}/purchase`,
    {
      recipientUserId: options.recipientUserId,
      giftMessage: options.giftMessage,
      paymentMode: options.paymentMode || "wallet",
      installmentCount: options.installmentCount,
      couponCode: options.couponCode,
      voucherId: options.voucherId,
      promoCode: options.promoCode,
    },
    { headers },
  );
  return data as {
    ok: boolean;
    alreadyEnrolled?: boolean;
    orderId?: string;
    enrollUserId?: string;
    order?: CourseOrderReceipt & { id?: string };
    quote?: CoursePurchaseQuote;
    isCoachDirect?: boolean;
    isGift?: boolean;
    paymentMode?: string;
    socialProof?: CoursePurchaseSocialProof;
    conversion?: CourseConversionDiscount | null;
    bonusPoints?: number;
  };
}

export type CourseGatewayPurchaseResponse = {
  ok: boolean;
  chargeId: string;
  courseId: string;
  amount: number;
  grossAmount: number;
  paymentMethod: string;
  purpose: "course_purchase";
  status: string;
  qr_code_url?: string | null;
  authorization_uri?: string | null;
  quote?: CoursePurchaseQuote;
};

export type CourseGatewayPurchaseStatus = {
  chargeId: string;
  courseId: string;
  amount: number;
  grossAmount: number;
  status: string;
  paymentMethod?: string;
  orderId?: string | null;
  purpose: "course_purchase";
  purchase?: {
    ok?: boolean;
    orderId?: string;
    order?: CourseOrderReceipt & { id?: string };
    socialProof?: CoursePurchaseSocialProof;
  } | null;
};

export async function createCourseGatewayPurchase(
  courseId: string,
  options: {
    paymentMethod?: "promptpay" | "card";
    returnUrl?: string;
    recipientUserId?: string;
    giftMessage?: string;
    couponCode?: string;
    voucherId?: string;
    promoCode?: string;
  } = {},
) {
  const { data } = await api.post(`/courses/${encodeURIComponent(courseId)}/purchase/gateway`, {
    paymentMethod: options.paymentMethod || "promptpay",
    returnUrl: options.returnUrl,
    recipientUserId: options.recipientUserId,
    giftMessage: options.giftMessage,
    couponCode: options.couponCode,
    voucherId: options.voucherId,
    promoCode: options.promoCode,
  });
  return data as CourseGatewayPurchaseResponse;
}

export async function getCourseGatewayPurchaseStatus(chargeId: string) {
  const { data } = await api.get(`/courses/purchase/gateway/status/${encodeURIComponent(chargeId)}`);
  return data as CourseGatewayPurchaseStatus;
}

export async function reconcileCourseGatewayPurchase(chargeId: string) {
  const { data } = await api.post(`/courses/purchase/gateway/reconcile/${encodeURIComponent(chargeId)}`);
  return data as { paid?: boolean; fulfilled?: boolean; response?: Awaited<ReturnType<typeof purchaseCourse>> };
}

export async function listMyCourses() {
  const { data } = await api.get("/my/courses");
  return (data?.courses || []) as MarketplaceCourse[];
}

export async function saveCourseProgress(courseId: string, lessonId: string, watchedSeconds = 0, completed = true) {
  const { data } = await api.post(`/courses/${encodeURIComponent(courseId)}/progress`, {
    lessonId,
    watchedSeconds,
    completed,
  });
  return data as {
    ok: boolean;
    progressPct: number;
    newlyCompleted?: boolean;
    certificate?: CourseProgressState["certificate"];
  };
}

export async function getCourseProgress(courseId: string) {
  const { data } = await api.get(`/courses/${encodeURIComponent(courseId)}/progress`);
  return (data?.progress || null) as CourseProgressState | null;
}

export async function getContinueLearningCourses(limit = 6) {
  const { data } = await api.get(`/courses/continue-learning?limit=${limit}`);
  return (data?.courses || []) as ContinueLearningCourse[];
}

export async function getMyCourseBadges() {
  const { data } = await api.get("/my/course-badges");
  return (data?.badges || []) as CourseCompletionBadge[];
}

export async function getCourseCertificate(courseId: string) {
  const { data } = await api.get(`/courses/${encodeURIComponent(courseId)}/certificate`);
  return data?.certificate as {
    id: string;
    courseId: string;
    courseTitle: string;
    learnerName: string;
    verifyCode: string;
    issuedAt: string;
  };
}

export async function getLessonPlayback(courseId: string, lessonId: string) {
  const { data } = await api.get(
    `/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/playback`,
  );
  return data as {
    provider: "youtube" | "direct" | "none";
    embedUrl: string;
    videoId?: string | null;
    expiresAt: string;
    playbackToken?: string | null;
    access?: string;
    lessonTitle?: string;
  };
}

export async function verifyCourseCertificate(code: string) {
  const { data } = await api.get(`/courses/certificates/verify/${encodeURIComponent(code.trim().toUpperCase())}`);
  return data as {
    valid: boolean;
    courseTitle: string;
    learnerName: string;
    issuedAt: string;
    verifyCode: string;
  };
}

export async function syncCourseWatchProgress(courseId: string, lessonId: string, watchedSeconds: number) {
  const { data } = await api.post(`/courses/${encodeURIComponent(courseId)}/progress`, {
    lessonId,
    watchedSeconds,
    completed: false,
  });
  return data as { ok: boolean; progressPct?: number };
}

export async function getLessonQuiz(courseId: string, lessonId: string) {
  const { data } = await api.get(
    `/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/quiz`,
  );
  return data?.quiz;
}

export async function submitLessonQuiz(courseId: string, lessonId: string, answers: Record<string, unknown>) {
  const { data } = await api.post(
    `/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/quiz/submit`,
    { answers },
  );
  return data as {
    score: number;
    passed: boolean;
    passThreshold: number;
    attempts: number;
    progress?: { progressPct?: number; newlyCompleted?: boolean; certificate?: CourseProgressState["certificate"] };
  };
}

export async function saveLessonNote(courseId: string, lessonId: string, body: string) {
  const { data } = await api.put(
    `/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/notes`,
    { body },
  );
  return data as { ok: boolean };
}

export async function getCoachTraineeCourseProgress() {
  const { data } = await api.get("/coach/trainees/course-progress");
  return (data?.trainees || []) as CoachTraineeCourseProgress[];
}

export async function listCourseReviews(
  courseId: string,
  opts?: { limit?: number; offset?: number; sort?: CourseReviewSort },
): Promise<CourseReviewList> {
  const params = new URLSearchParams();
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.offset != null) params.set("offset", String(opts.offset));
  if (opts?.sort) params.set("sort", opts.sort);
  const qs = params.toString();
  const { data } = await api.get(
    `/courses/${encodeURIComponent(courseId)}/reviews${qs ? `?${qs}` : ""}`,
  );
  return {
    reviews: (data?.reviews || []) as CourseReview[],
    total: Number(data?.total || 0),
    limit: Number(data?.limit || 10),
    offset: Number(data?.offset || 0),
    hasMore: !!data?.hasMore,
    sort: (data?.sort || "newest") as CourseReviewSort,
  };
}

export async function getMyCourseReview(courseId: string) {
  const { data } = await api.get(`/courses/${encodeURIComponent(courseId)}/reviews/mine`);
  return data as CourseReviewMine;
}

export async function submitCourseReview(courseId: string, rating: number, comment: string) {
  const { data } = await api.post(`/courses/${encodeURIComponent(courseId)}/reviews`, { rating, comment });
  return data as {
    ok: boolean;
    review?: CourseReviewMine["review"];
    ratingAvg?: number;
    ratingCount?: number;
  };
}

export async function updateCourseReview(courseId: string, rating: number, comment: string) {
  const { data } = await api.patch(`/courses/${encodeURIComponent(courseId)}/reviews/mine`, { rating, comment });
  return data as {
    ok: boolean;
    review?: CourseReviewMine["review"];
    ratingAvg?: number;
    ratingCount?: number;
  };
}

export async function deleteCourseReview(courseId: string) {
  const { data } = await api.delete(`/courses/${encodeURIComponent(courseId)}/reviews/mine`);
  return data as { ok: boolean; ratingAvg?: number; ratingCount?: number };
}

export async function listCourseQa(
  courseId: string,
  opts?: { lessonId?: string; limit?: number },
) {
  const params = new URLSearchParams();
  if (opts?.lessonId) params.set("lessonId", opts.lessonId);
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  const { data } = await api.get(`/courses/${encodeURIComponent(courseId)}/qa${qs ? `?${qs}` : ""}`);
  return data as {
    threads: CourseQaThread[];
    total: number;
    instructorUserId?: string | null;
  };
}

export async function postCourseQa(
  courseId: string,
  payload: { body: string; lessonId?: string; parentId?: string },
) {
  const { data } = await api.post(`/courses/${encodeURIComponent(courseId)}/qa`, payload);
  return data as { message: CourseQaMessage };
}

export async function updateCourseQa(courseId: string, messageId: string, body: string) {
  const { data } = await api.patch(
    `/courses/${encodeURIComponent(courseId)}/qa/${encodeURIComponent(messageId)}`,
    { body },
  );
  return data as { message: CourseQaMessage };
}

export async function deleteCourseQa(courseId: string, messageId: string) {
  const { data } = await api.delete(
    `/courses/${encodeURIComponent(courseId)}/qa/${encodeURIComponent(messageId)}`,
  );
  return data as { ok: boolean };
}

export async function listStudioCourses() {
  const { data } = await api.get("/course-studio/courses");
  return (data?.courses || []) as MarketplaceCourse[];
}

export async function createStudioCourse(payload: Partial<MarketplaceCourse>) {
  const { data } = await api.post("/course-studio/courses", payload);
  return data?.course as MarketplaceCourse;
}

export async function updateStudioCourse(id: string, payload: Partial<MarketplaceCourse>) {
  const { data } = await api.patch(`/course-studio/courses/${encodeURIComponent(id)}`, payload);
  return data?.course as MarketplaceCourse;
}

export async function submitStudioCourse(id: string) {
  const { data } = await api.post(`/course-studio/courses/${encodeURIComponent(id)}/submit`, {});
  return data?.course as MarketplaceCourse;
}

export async function createCourseSection(courseId: string, title: string, sortOrder = 0) {
  const { data } = await api.post(`/course-studio/courses/${encodeURIComponent(courseId)}/sections`, { title, sortOrder });
  return data?.section;
}

export async function createCourseLesson(courseId: string, payload: Partial<CourseLesson>) {
  const { data } = await api.post(`/course-studio/courses/${encodeURIComponent(courseId)}/lessons`, payload);
  return data?.lesson;
}

export async function updateCourseLesson(courseId: string, lessonId: string, payload: Partial<CourseLesson>) {
  const { data } = await api.patch(
    `/course-studio/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}`,
    payload,
  );
  return data?.lesson as CourseLesson;
}

export async function deleteCourseLesson(courseId: string, lessonId: string) {
  const { data } = await api.delete(
    `/course-studio/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}`,
  );
  return data as { ok: boolean };
}

export async function updateCourseSection(courseId: string, sectionId: string, payload: { title?: string; sortOrder?: number }) {
  const { data } = await api.patch(
    `/course-studio/courses/${encodeURIComponent(courseId)}/sections/${encodeURIComponent(sectionId)}`,
    payload,
  );
  return data?.section;
}

export async function deleteCourseSection(courseId: string, sectionId: string) {
  const { data } = await api.delete(
    `/course-studio/courses/${encodeURIComponent(courseId)}/sections/${encodeURIComponent(sectionId)}`,
  );
  return data as { ok: boolean };
}

export async function unlistStudioCourse(courseId: string) {
  const { data } = await api.post(`/course-studio/courses/${encodeURIComponent(courseId)}/unlist`, {});
  return data?.course as MarketplaceCourse;
}

export async function listStudioCourseQuestions(courseId: string) {
  const { data } = await api.get(`/course-studio/courses/${encodeURIComponent(courseId)}/questions`);
  return (data?.questions || []) as CourseQuizQuestion[];
}

export async function createStudioCourseQuestion(
  courseId: string,
  payload: { questionText: string; options: Array<{ id: string; text: string }>; correctOptionId: string },
) {
  const { data } = await api.post(`/course-studio/courses/${encodeURIComponent(courseId)}/questions`, payload);
  return data?.question as CourseQuizQuestion;
}

export async function deleteStudioCourseQuestion(courseId: string, questionId: string) {
  const { data } = await api.delete(
    `/course-studio/courses/${encodeURIComponent(courseId)}/questions/${encodeURIComponent(questionId)}`,
  );
  return data as { ok: boolean };
}

export async function getInstructorEarnings() {
  const { data } = await api.get("/instructor/dashboard", { params: { recentLimit: 30 } });
  return data as InstructorCourseEarnings & { forecast?: InstructorPayoutForecast; topCourses?: unknown[] };
}

export async function getCourseOrderReceipt(orderId: string) {
  const { data } = await api.get(`/courses/orders/${encodeURIComponent(orderId)}/receipt`);
  return {
    receipt: data?.receipt as CourseOrderReceipt,
    taxDocuments: (data?.taxDocuments || null) as CourseOrderTaxDocumentsPayload | null,
  };
}

export async function getCourseOrderTaxDocuments(orderId: string) {
  const { data } = await api.get(`/courses/orders/${encodeURIComponent(orderId)}/tax-documents`);
  return data as CourseOrderTaxDocumentsPayload;
}

export async function downloadCourseOrderTaxDocumentPdf(orderId: string, documentId: string) {
  const { data } = await api.get(
    `/courses/orders/${encodeURIComponent(orderId)}/tax-documents/${encodeURIComponent(documentId)}/pdf`,
    { responseType: "blob" },
  );
  return data as Blob;
}

export async function getCourseRefundEligibility(orderId: string) {
  const { data } = await api.get(`/courses/orders/${encodeURIComponent(orderId)}/refund-eligibility`);
  return data as CourseRefundEligibility;
}

export async function requestCourseRefund(orderId: string, payload: { reasonCode?: string; reasonNote?: string } = {}) {
  const { data } = await api.post(`/courses/orders/${encodeURIComponent(orderId)}/refund`, payload);
  return data as { ok: boolean; refundLedgerId?: string; grossAmount?: number };
}

export async function getInstructorSalesDashboard() {
  const { data } = await api.get("/instructor/dashboard");
  return data as InstructorSalesDashboard;
}

export async function getMyCourseOrders(params?: { limit?: number; offset?: number }) {
  const { data } = await api.get("/my/course-orders", { params });
  return data as BuyerCourseOrdersPage;
}

export async function downloadCourseOrderReceiptPdf(orderId: string, opts?: { preferFiscal?: boolean; documentId?: string }) {
  const params: Record<string, string> = {};
  if (opts?.preferFiscal !== false) params.preferFiscal = "1";
  if (opts?.documentId) params.documentId = opts.documentId;
  const { data } = await api.get(`/courses/orders/${encodeURIComponent(orderId)}/receipt.pdf`, {
    responseType: "blob",
    params,
  });
  return data as Blob;
}

export async function getAdminCoursePayoutSummary() {
  const { data } = await api.get("/admin/courses/payouts/summary");
  return data?.summary as AdminCoursePayoutSummary;
}

export async function getAdminCoursePayoutOrders(params?: {
  payoutStatus?: string;
  limit?: number;
  offset?: number;
}) {
  const { data } = await api.get("/admin/courses/revenue/orders", { params });
  return data as { orders: CourseOrderReceipt[]; total: number; limit: number; offset: number };
}

export async function runAdminCoursePayoutRelease(body?: { limit?: number; orderId?: string }) {
  const { data } = await api.post("/admin/courses/payouts/release", body || {});
  return data as { ok: boolean; count?: number; released?: unknown[]; blocked?: unknown[] };
}

export type CourseQualityChecklist = {
  ok: boolean;
  items: Array<{ id: string; label: string; pass: boolean; hint?: string }>;
  score: number;
};

export type AdminReviewQueueItem = {
  course: MarketplaceCourse;
  checklist: CourseQualityChecklist;
  instructorEmail?: string | null;
};

export type CourseFunnelReport = {
  funnel: Record<string, number>;
  conversion: Record<string, number | null>;
  counts: Array<{ event_type: string; events: number; unique_actors: number }>;
};

export type AdminCourseRevenueReport = {
  policy: {
    platformRate: number;
    platformRatePct: number;
    coachDirectDiscountRate: number;
    coachDirectPlatformRate: number;
  };
  orders: {
    total_orders: number;
    completed_orders: number;
    gross_completed: number;
    platform_fee_orders: number;
    instructor_net_orders: number;
  };
  topCourses?: Array<{ course_id: string; course_title: string; orders: number; gross: number; platform_fee: number }>;
};

export type AdminModerationReview = {
  id: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  isHidden: boolean;
  createdAt?: string;
};

export type AdminModerationQa = {
  id: string;
  userName: string;
  body: string;
  isHidden: boolean;
  isClosed: boolean;
  createdAt?: string;
};

export async function getAdminCourseReviewQueue(status = "in_review") {
  const { data } = await api.get("/admin/courses/marketplace/review-queue", { params: { status } });
  return data as { status: string; courses: AdminReviewQueueItem[] };
}

export async function runAdminCourseReviewAction(
  courseId: string,
  body: {
    action: "approve" | "reject" | "unlist" | "takedown" | "feature" | "unfeature";
    reason?: string;
    platformRateOverride?: number;
    clearPlatformRateOverride?: boolean;
    createBanner?: boolean;
  },
) {
  const { data } = await api.patch(`/admin/courses/marketplace/${encodeURIComponent(courseId)}/review`, body);
  return data as { course: MarketplaceCourse; action: string; banner?: unknown };
}

export async function getAdminCourseFunnelReport(params?: { from?: string; to?: string; courseId?: string }) {
  const { data } = await api.get("/admin/courses/analytics/funnel", { params });
  return data as CourseFunnelReport;
}

export async function getAdminCourseRevenueReport(params?: { from?: string; to?: string }) {
  const { data } = await api.get("/admin/courses/revenue", { params });
  return data as AdminCourseRevenueReport;
}

export async function getAdminCourseModeration(courseId: string) {
  const { data } = await api.get(`/admin/courses/marketplace/${encodeURIComponent(courseId)}/moderation`);
  return data as { reviews: AdminModerationReview[]; qa: AdminModerationQa[] };
}

export async function moderateAdminCourseReview(
  courseId: string,
  reviewId: string,
  action: "hide" | "unhide" | "delete",
  reason?: string,
) {
  const { data } = await api.patch(
    `/admin/courses/marketplace/${encodeURIComponent(courseId)}/reviews/${encodeURIComponent(reviewId)}`,
    { action, reason },
  );
  return data;
}

export async function moderateAdminCourseQa(
  courseId: string,
  messageId: string,
  action: "hide" | "unhide" | "close" | "reopen" | "delete",
  reason?: string,
) {
  const { data } = await api.patch(
    `/admin/courses/marketplace/${encodeURIComponent(courseId)}/qa/${encodeURIComponent(messageId)}`,
    { action, reason },
  );
  return data;
}

export async function getAdminCourseAuditLog(params?: { courseId?: string; limit?: number }) {
  const { data } = await api.get("/admin/courses/marketplace/audit-log", { params });
  return data as { rows: Array<{ id: string; courseId: string; action: string; reason?: string; createdAt?: string }> };
}

export async function getStudioCourse(id: string) {
  const { data } = await api.get(`/course-studio/courses/${encodeURIComponent(id)}`);
  return data?.course as MarketplaceCourse;
}

export async function getCourseStudioWizard(id: string) {
  const { data } = await api.get(`/course-studio/courses/${encodeURIComponent(id)}/wizard`);
  return data as CourseStudioWizard;
}

export async function getInstructorProfile() {
  const { data } = await api.get("/course-studio/profile");
  return (data?.profile || {}) as InstructorProfile;
}

export async function updateInstructorProfile(payload: Partial<InstructorProfile>) {
  const { data } = await api.patch("/course-studio/profile", payload);
  return (data?.profile || {}) as InstructorProfile;
}

export async function uploadCourseImage(file: File) {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
  const { data } = await api.post<{ url?: string; secure_url?: string }>("/upload/image", { file: base64 });
  return data.url || data.secure_url || "";
}

export async function uploadCourseVideo(file: File) {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
  const { data } = await api.post<{ url?: string; secure_url?: string }>("/upload/video", { file: base64 });
  return data.url || data.secure_url || "";
}
