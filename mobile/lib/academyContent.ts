/**
 * AQOND Academy — Senior Professional Onboarding (Employer / Talent).
 * Command-center briefings: money / time / risk, policies, strategic ops.
 */

import type { TourPillar } from "../context/TutorialContext";

export type BriefingMode = "summary" | "detailed";

/** Pillar tours + strategic topics (no guided tour for the latter). */
export type AcademyTopicId =
  | TourPillar
  | "financial_flow"
  | "video_portfolio"
  | "advanced_booking";

export type AcademyLink = { label: string; path: string };

export type AcademyCard = {
  id: AcademyTopicId;
  /** Short label for segmented progress (no index prefix in data). */
  segment_label: string;
  /** Pipe-separated key ideas, e.g. "Escrow | Settlement | Fees" */
  learn_about: string;
  bullets: { money: string[]; time: string[]; risk: string[] };
  title: string;
  subtitle: string;
  summary: string;
  detail: string;
  pro_tips: string[];
  policy_links: AcademyLink[];
  footer_links: AcademyLink[];
  route: string;
  /** When set, primary action starts this guided tour. */
  guided_tour: TourPillar | null;
};

export type AcademyHubStrings = {
  skip: string;
  page_title: string;
  page_sub_employer: string;
  page_sub_talent: string;
  mode_employer: string;
  mode_talent: string;
  summary: string;
  detailed: string;
  badge_30: string;
  badge_5: string;
  cta: string;
  cta_continue: string;
  in_this_section: string;
  learn_about_prefix: string;
  outline_title: string;
  outline_open: string;
  labels_money: string;
  labels_time: string;
  labels_risk: string;
  pro_tips: string;
  policies_refs: string;
  credential: string;
  footer_employer: string;
  footer_talent: string;
  reminder_title: string;
  reminder_body: string;
  prev: string;
  next: string;
  of: string;
  glossary_title: string;
  employer_cards: AcademyCard[];
  talent_cards: AcademyCard[];
};

export const ACADEMY_GLOSSARY_EN: Record<string, string> = {
  SLA:
    "Service Level Agreement — the time window in which you must accept or respond to an Instant Match offer.",
  Escrow:
    "Funds held by the platform until work is verified; protects both parties per policy.",
  "Instant Match":
    "AQOND’s fast-matching flow: the system pairs a job with a Professional; you must accept within the stated window.",
  KYC: "Know Your Customer — identity verification required for payouts and certain bookings.",
  "QR check-in": "On-site QR scan used to confirm attendance or start of service for coverage and settlement.",
};

export const ACADEMY_GLOSSARY_TH: Record<string, string> = {
  SLA:
    "ข้อตกลงระดับบริการ — ช่วงเวลาที่ต้องตอบรับหรือตอบสนองข้อเสนอ Instant Match",
  Escrow: "เงินที่แพลตฟอร์มถือไว้จนกว่าจะยืนยันงาน — ป้องกันทั้งสองฝ่ายตามนโยบาย",
  "Instant Match":
    "ระบบจับคู่ด่วน: แพลตฟอร์มจับคู่งานกับผู้ให้บริการ — ต้องยอมรับภายในช่วงเวลาที่กำหนด",
  KYC: "การยืนยันตัวตน — จำเป็นต่อการจ่ายเงินและการจองบางประเภท",
  "QR check-in": "สแกน QR ณ สถานที่เพื่อยืนยันการเริ่มงานหรือการเข้าร่วม — เกี่ยวกับความคุ้มครองและการชำระเงิน",
};

function E(partial: AcademyCard): AcademyCard {
  return partial;
}

/* ——— Employer (EN) ——— */
const EN_EMP: AcademyCard[] = [
  E({
    id: "financial_flow",
    segment_label: "Escrow & Wallet",
    learn_about: "Authorization · Escrow · Release · Wallet",
    bullets: {
      money: [
        "Employer funds are authorized into Escrow before work is released for execution.",
        "Payout to the Professional and platform fees follow verified completion and policy.",
      ],
      time: [
        "Wallet reflects settled balances after job closure and any cooling-off rules.",
        "Top-ups and statements are available from Wallet and profile payment settings.",
      ],
      risk: [
        "Chargebacks and disputes follow Legal; refunds are not automatic once service has started unless policy allows.",
      ],
    },
    title: "Financial flow: Escrow to Wallet",
    subtitle: "Employer view — where money sits at each stage",
    summary:
      "Money moves from your authorized payment into Escrow, then to settlement — not directly hand-to-hand.",
    detail:
      "Treat Escrow as the single source of truth for job-tied funds. After you confirm completion (or the workflow closes per policy), settlement routes to the Professional’s Wallet net of fees. Always review Wallet and Legal for the latest fee and refund tables.",
    pro_tips: [
      "Keep KYC and payment methods current to avoid release delays.",
      "Use in-app records for every scope change — it strengthens dispute resolution.",
    ],
    policy_links: [
      { label: "Terms & refund context", path: "/legal?type=terms" },
      { label: "Refund policy", path: "/legal?type=refund" },
    ],
    footer_links: [
      { label: "Open Wallet", path: "/dashboard/wallet" },
      { label: "Top up Wallet", path: "/wallet/topup" },
      { label: "KYC status", path: "/kyc" },
    ],
    route: "/dashboard/wallet",
    guided_tour: null,
  }),
  E({
    id: "cleaning",
    segment_label: "Cleaning scope",
    learn_about: "Checklist · Escrow · Verification",
    bullets: {
      money: ["Escrow holds the job budget until you confirm completion."],
      time: ["Scope is locked via the property checklist before dispatch."],
      risk: ["Off-platform agreements weaken dispute support."],
    },
    title: "Cleaning & scope governance",
    subtitle: "Category → diagnostic checklist → job creation",
    summary:
      "Post under Cleaning; complete the property checklist; escrow holds funds until you confirm completion.",
    detail:
      "Select category, review scope and equipment, create the job with clear deliverables. Funds remain in escrow until you verify completion per platform policy.",
    pro_tips: [
      "Photograph baseline condition when useful — it clarifies acceptance.",
    ],
    policy_links: [{ label: "Terms", path: "/legal?type=terms" }],
    footer_links: [
      { label: "Create job", path: "/create-job" },
      { label: "Settings", path: "/settings" },
    ],
    route: "/",
    guided_tour: "cleaning",
  }),
  E({
    id: "party",
    segment_label: "Hospitality",
    learn_about: "Vibe · Deposit · Audit trail",
    bullets: {
      money: ["Deposit terms secure the slot before travel or attendance."],
      time: ["Party Vibe encodes timing and expectations in one flow."],
      risk: ["Last-minute changes should be confirmed in-app."],
    },
    title: "Hospitality & events",
    subtitle: "Vibe selection → booking → deposit",
    summary:
      "Use Party Vibe to structure the request; deposit terms secure the booking before service starts.",
    detail:
      "Pre-filled forms reduce errors. Confirm deposit, expectations, and timing. Communicate through the booking record for auditability.",
    pro_tips: ["Align dress code and access rules in writing before the event window."],
    policy_links: [{ label: "Terms", path: "/legal?type=terms" }],
    footer_links: [
      { label: "Party Vibe", path: "/party-vibe" },
      { label: "My bookings", path: "/my-bookings" },
    ],
    route: "/party-vibe",
    guided_tour: "party",
  }),
  E({
    id: "driver",
    segment_label: "Transport",
    learn_about: "Route · Fare rules · Completion",
    bullets: {
      money: ["Fares follow published rates shown before you confirm."],
      time: ["Pickup and destination define the service window."],
      risk: ["Cancellation charges may apply after lock-in — see Terms."],
    },
    title: "Transport & routing",
    subtitle: "Destination → vehicle class → confirmation",
    summary:
      "Set pickup and destination; select vehicle tier; fares follow published rules before you confirm.",
    detail:
      "Review route estimate, safety prompts, and cancellation terms. Payment follows trip completion per transport policy.",
    pro_tips: ["Verify pin drops — they anchor pricing and ETA."],
    policy_links: [{ label: "Terms", path: "/legal?type=terms" }],
    footer_links: [{ label: "Transport hub", path: "/transport" }],
    route: "/transport",
    guided_tour: "driver",
  }),
  E({
    id: "technical",
    segment_label: "Technical",
    learn_about: "Credentials · Fixed scope · Evidence",
    bullets: {
      money: ["Fixed-price categories reduce ambiguity when shown."],
      time: ["Diagnosis and scope should be agreed before on-site spend."],
      risk: ["Off-platform quotes are outside platform protections."],
    },
    title: "Technical services",
    subtitle: "Credentials → diagnosis → fixed scope",
    summary:
      "Verify provider certification where shown; use fixed-price scope when the category requires it.",
    detail:
      "Posting flow includes evidence and warranty expectations. Align on scope before work starts to avoid disputes.",
    pro_tips: ["Ask for warranty terms in the job thread for traceability."],
    policy_links: [{ label: "Terms", path: "/legal?type=terms" }],
    footer_links: [
      { label: "Find talent", path: "/talents" },
      { label: "Create job", path: "/create-job" },
    ],
    route: "/",
    guided_tour: "technical",
  }),
  E({
    id: "advance_jobs",
    segment_label: "AdvanceJob",
    learn_about: "Bids · Milestones · Award",
    bullets: {
      money: ["Compare bids against total cost and deliverables, not headline price alone."],
      time: ["Milestones should match your operational timeline."],
      risk: ["Award in-app; verbal awards lack audit trail."],
    },
    title: "AdvanceJob & bidding",
    subtitle: "Structured post → bids → selection",
    summary:
      "Publish a scoped Advance Job; compare bids; select against your criteria and timeline.",
    detail:
      "Job Board workflow supports negotiation and milestones. Record decisions in-app for traceability.",
    pro_tips: ["Weight reliability and clarity of bids, not only the lowest number."],
    policy_links: [{ label: "Terms", path: "/legal?type=terms" }],
    footer_links: [{ label: "Job Board", path: "/job-board" }],
    route: "/job-board",
    guided_tour: "advance_jobs",
  }),
  E({
    id: "match_job",
    segment_label: "Instant Match",
    learn_about: "SLA · Acceptance · Escrow",
    bullets: {
      money: ["Escrow still applies — speed does not bypass fund safety."],
      time: ["Accept within the SLA or the offer may lapse."],
      risk: ["Declining repeatedly may affect future match priority."],
    },
    title: "Instant Match",
    subtitle: "System match → acceptance window",
    summary:
      "Match Job prioritizes speed; accept within the stated window or the offer may lapse.",
    detail:
      "Understand matching criteria, budget limits, and cancellation policy before posting or accepting.",
    pro_tips: ["Keep notifications on during Instant Match windows."],
    policy_links: [{ label: "Terms", path: "/legal?type=terms" }],
    footer_links: [{ label: "Home", path: "/" }],
    route: "/",
    guided_tour: "match_job",
  }),
  E({
    id: "video_portfolio",
    segment_label: "Talent clips",
    learn_about: "Discovery · Portfolio · Hiring",
    bullets: {
      money: ["Escrow-backed hiring when you proceed from a clip to a formal job."],
      time: ["Short clips surface fit faster than text-only profiles."],
      risk: ["Always confirm scope in the job record before work starts."],
    },
    title: "Video portfolio: hiring with confidence",
    subtitle: "High-signal clips → structured hire",
    summary:
      "Use the video feed to assess presence and execution style; move to a scoped job with Escrow.",
    detail:
      "Talent clips are vertical, mobile-first previews. Prefer creators who show real work context. When you hire, route through the standard job flow so Escrow and policies apply.",
    pro_tips: [
      "Watch for clarity of deliverables and on-time energy — they correlate with match quality.",
    ],
    policy_links: [{ label: "Terms", path: "/legal?type=terms" }],
    footer_links: [
      { label: "Watch clips", path: "/video-feed" },
      { label: "Talent directory", path: "/talents" },
    ],
    route: "/video-feed",
    guided_tour: null,
  }),
  E({
    id: "advanced_booking",
    segment_label: "Bookings",
    learn_about: "Slots · Overlap · Grace",
    bullets: {
      money: ["Deposits and cancellations follow the booking record and Terms."],
      time: ["Calendar and availability windows prevent double-booking when used consistently."],
      risk: ["Overlapping commitments without buffer increases no-show risk."],
    },
    title: "Advanced booking & time discipline",
    subtitle: "Slots · overlaps · check-in grace",
    summary:
      "Manage bookings in My Bookings; respect posted windows and grace rules for QR check-ins.",
    detail:
      "Set realistic availability. When multiple jobs are possible, stagger buffers for travel and handover. Grace periods for check-in and cancellation are defined in Legal — read the current Terms before accepting tight stacks.",
    pro_tips: [
      "Sync your operating hours with Party and transport expectations.",
      "If a conflict emerges, resolve in the booking thread first.",
    ],
    policy_links: [
      { label: "Terms (grace & cancellation)", path: "/legal?type=terms" },
      { label: "Refund policy", path: "/legal?type=refund" },
    ],
    footer_links: [{ label: "My bookings", path: "/my-bookings" }],
    route: "/my-bookings",
    guided_tour: null,
  }),
];

/* ——— Talent (EN) ——— */
const EN_TAL: AcademyCard[] = [
  E({
    id: "financial_flow",
    segment_label: "Escrow & Wallet",
    learn_about: "Delivery · Settlement · Fees",
    bullets: {
      money: [
        "Client funds sit in Escrow while you perform; release follows verified completion.",
        "Your Wallet shows net earnings after platform fees.",
      ],
      time: ["Settlement typically follows job closure and policy holds — check Wallet after each job."],
      risk: ["Off-platform payments forfeit protection and audit trails."],
    },
    title: "Financial flow: Escrow to Wallet",
    subtitle: "Professional view — payouts and fees",
    summary:
      "Escrow protects both sides; your payout lands in Wallet after successful closure per policy.",
    detail:
      "Complete required steps (including QR check-in where mandated). Fees and taxes are disclosed in Wallet statements. Disputes route through platform support with your in-app evidence.",
    pro_tips: [
      "Keep KYC and bank details current to avoid payout holds.",
      "Screenshot or export key milestones from chat when needed.",
    ],
    policy_links: [
      { label: "Terms", path: "/legal?type=terms" },
      { label: "Refund policy", path: "/legal?type=refund" },
    ],
    footer_links: [
      { label: "Wallet", path: "/dashboard/wallet" },
      { label: "Top up (if applicable)", path: "/wallet/topup" },
      { label: "KYC", path: "/kyc" },
    ],
    route: "/dashboard/wallet",
    guided_tour: null,
  }),
  E({
    id: "cleaning",
    segment_label: "Cleaning",
    learn_about: "Checklist · QR · Escrow release",
    bullets: {
      money: ["Escrow releases after verified completion and policy checks."],
      time: ["Scope is defined before you start — changes need client alignment."],
      risk: ["Skipping checklist steps increases rework risk."],
    },
    title: "Cleaning delivery",
    subtitle: "Job details → property checklist → execution",
    summary:
      "Open Job Details; confirm residence type and equipment; align scope before starting.",
    detail:
      "Follow the checklist, document handover where required, and close the job for escrow release per policy.",
    pro_tips: ["Photo evidence at handover reduces disputes."],
    policy_links: [{ label: "Terms", path: "/legal?type=terms" }],
    footer_links: [{ label: "Provider dashboard", path: "/provider/dashboard" }],
    route: "/provider/dashboard",
    guided_tour: "cleaning",
  }),
  E({
    id: "party",
    segment_label: "Hospitality",
    learn_about: "Vibe · Deposit · On-platform",
    bullets: {
      money: ["Deposits and milestones follow the booking record."],
      time: ["Confirm before travel or arrival windows."],
      risk: ["Off-platform promises are not enforceable by the platform."],
    },
    title: "Hospitality assignments",
    subtitle: "Vibe alignment → confirmation → deposit",
    summary:
      "Review vibe and client expectations; confirm acceptance before travel or attendance.",
    detail:
      "Deposit and timing rules apply. Keep communications on-platform for dispute resolution.",
    pro_tips: ["Dress code and access rules belong in the thread before you depart."],
    policy_links: [{ label: "Terms", path: "/legal?type=terms" }],
    footer_links: [{ label: "Dashboard", path: "/provider/dashboard" }],
    route: "/provider/dashboard",
    guided_tour: "party",
  }),
  E({
    id: "driver",
    segment_label: "Transport",
    learn_about: "Trip record · Payout · Safety",
    bullets: {
      money: ["Trip completion unlocks payout eligibility."],
      time: ["Arrival and completion timestamps matter for ratings."],
      risk: ["Incomplete trip records weaken payout defense."],
    },
    title: "Transport execution",
    subtitle: "Navigation → arrival → completion",
    summary:
      "Start navigation to pickup; confirm arrival and destination per trip workflow.",
    detail:
      "Follow safety prompts; complete the trip record for payout and rating eligibility.",
    pro_tips: ["Confirm destination changes in-app when possible."],
    policy_links: [{ label: "Terms", path: "/legal?type=terms" }],
    footer_links: [{ label: "Transport", path: "/transport" }],
    route: "/provider/dashboard",
    guided_tour: "driver",
  }),
  E({
    id: "technical",
    segment_label: "Credentials",
    learn_about: "Proof · Quotes · Trust",
    bullets: {
      money: ["Quotes should align with fixed-price rules for the category."],
      time: ["Update credentials before peak seasons."],
      risk: ["Stale credentials reduce trust signals."],
    },
    title: "Technical proof & profile",
    subtitle: "Evidence → upgrades → trust",
    summary:
      "Upload certifications and past work to strengthen hireability and category fit.",
    detail:
      "Maintain accurate credentials; align quotes with fixed-price rules where applicable.",
    pro_tips: ["Before/after sets in chat help warranty claims."],
    policy_links: [{ label: "Terms", path: "/legal?type=terms" }],
    footer_links: [{ label: "Profile", path: "/profile" }],
    route: "/profile",
    guided_tour: "technical",
  }),
  E({
    id: "advance_jobs",
    segment_label: "AdvanceJob",
    learn_about: "Bids · SLAs · Award",
    bullets: {
      money: ["Bid totals should include your full cost to deliver."],
      time: ["Respond within client SLAs and board deadlines."],
      risk: ["Ambiguous bids lose to clearer competitors."],
    },
    title: "AdvanceJob bidding",
    subtitle: "Bid → negotiation → award",
    summary:
      "Place competitive bids; clarify deliverables before the client awards the job.",
    detail:
      "Track milestones and messages in Job Board; comply with acceptance deadlines.",
    pro_tips: ["Lead with deliverables, not just price."],
    policy_links: [{ label: "Terms", path: "/legal?type=terms" }],
    footer_links: [{ label: "Job Board", path: "/job-board" }],
    route: "/job-board",
    guided_tour: "advance_jobs",
  }),
  E({
    id: "match_job",
    segment_label: "Instant Match",
    learn_about: "SLA · Acceptance · Escrow",
    bullets: {
      money: ["Know the fee and gross before you slide to accept."],
      time: ["SLA windows are short — treat as real-time commitments."],
      risk: ["Timeouts may affect future match priority."],
    },
    title: "Instant Match acceptance",
    subtitle: "Offer window → slide to accept",
    summary:
      "Respond within the SLA; declining or timing out may affect future match priority.",
    detail:
      "Review fee, location, and cancellation terms before accepting.",
    pro_tips: ["Keep notifications on during standby windows."],
    policy_links: [{ label: "Terms", path: "/legal?type=terms" }],
    footer_links: [{ label: "Dashboard", path: "/provider/dashboard" }],
    route: "/provider/dashboard",
    guided_tour: "match_job",
  }),
  E({
    id: "video_portfolio",
    segment_label: "Video clips",
    learn_about: "9:16 · Duration · Match rate",
    bullets: {
      money: [
        "Strong clips increase conversion to paid jobs — still route hires through Escrow.",
      ],
      time: ["Keep clips concise; front-load your best proof in the first seconds."],
      risk: ["Misleading edits erode trust and ratings."],
    },
    title: "Maximizing presence: high-impact clips",
    subtitle: "Vertical video · limits · discovery",
    summary:
      "Upload vertical (9:16) clips that show real execution; clear lighting and stable audio beat filters.",
    detail:
      "Platform limits apply to upload length and size — stay within them to avoid processing failures. Clips that show scope, punctuality, and professionalism improve Instant Match and AdvanceJob visibility. Refresh your reel periodically.",
    pro_tips: [
      "Show one hero skill per clip — specificity beats generic montages.",
      "End with a clear CTA: what work you want next.",
    ],
    policy_links: [{ label: "Terms", path: "/legal?type=terms" }],
    footer_links: [
      { label: "Video feed", path: "/video-feed" },
      { label: "Profile", path: "/profile" },
    ],
    route: "/video-feed",
    guided_tour: null,
  }),
  E({
    id: "advanced_booking",
    segment_label: "Bookings",
    learn_about: "Availability · Overlap · Grace",
    bullets: {
      money: ["No-show and late fees follow Terms and booking state."],
      time: ["Stack jobs with buffer for travel and setup."],
      risk: ["Double-booking overlapping windows increases cancellation exposure."],
    },
    title: "Time-slot management & overlaps",
    subtitle: "Availability · stacked jobs · Grace",
    summary:
      "Publish accurate availability; avoid overlapping slots without travel buffers.",
    detail:
      "Use My Bookings and calendar discipline. When multiple clients book adjacent times, add realistic buffers. Grace periods for check-in and cancellation are defined in Legal — read the current Terms before accepting tight stacks.",
    pro_tips: [
      "Block admin time between heavy jobs.",
      "If a conflict emerges, notify the client in-app immediately.",
    ],
    policy_links: [
      { label: "Terms & grace", path: "/legal?type=terms" },
      { label: "Refund policy", path: "/legal?type=refund" },
    ],
    footer_links: [{ label: "My bookings", path: "/my-bookings" }],
    route: "/my-bookings",
    guided_tour: null,
  }),
];

export const ACADEMY_HUB_EN: AcademyHubStrings = {
  skip: "Skip to Dashboard",
  page_title: "Senior Professional Onboarding",
  page_sub_employer:
    "Command-center briefings — compliance, Escrow, and booking execution.",
  page_sub_talent: "Command-center briefings — delivery, verification, and payouts.",
  mode_employer: "Employer",
  mode_talent: "Professional",
  summary: "Executive summary",
  detailed: "Detailed briefing",
  badge_30: "~30 sec scan",
  badge_5: "~5 min read",
  cta: "Start guided walkthrough",
  cta_continue: "Continue to workspace",
  in_this_section: "In this section",
  learn_about_prefix: "Learn about",
  outline_title: "Quick jump",
  outline_open: "Open",
  labels_money: "Money",
  labels_time: "Time",
  labels_risk: "Risk",
  pro_tips: "Pro tips",
  policies_refs: "Policies & references",
  credential:
    "Completing a path may unlock digital credentials or a verified badge on your profile, subject to policy.",
  footer_employer:
    "Platform governance: Escrow protects funds until work is confirmed. Review KYC and payment rules in Settings.",
  footer_talent:
    "Governance: QR check-in may be required for coverage. Settlement and fees appear in Wallet after job closure.",
  reminder_title: "Post-completion",
  reminder_body:
    "QR check-in where required for eligibility. Review earnings and fees in Wallet after settlement.",
  prev: "Previous",
  next: "Next",
  of: "of",
  glossary_title: "Key terms",
  employer_cards: EN_EMP,
  talent_cards: EN_TAL,
};

/* ——— Thai cards ——— */
const TH_EMP: AcademyCard[] = [
  E({
    id: "financial_flow",
    segment_label: "เอสโครว์ & Wallet",
    learn_about: "การอนุมัติ · เอสโครว์ · การปล่อยเงิน · Wallet",
    bullets: {
      money: [
        "เงินฝั่งจ้างถูกอนุมัติเข้าเอสโครว์ก่อนเริ่มปฏิบัติงานจริง",
        "การจ่ายให้ผู้ให้บริการและค่าธรรมเนียมเป็นไปตามการยืนยันปิดงานและนโยบาย",
      ],
      time: [
        "ยอดใน Wallet สะท้อนหลังปิดงานและกติการอคูลดาวน์ (ถ้ามี)",
        "เติมเงินและรายการดูได้จาก Wallet และการตั้งค่าชำระเงิน",
      ],
      risk: [
        "ข้อพิพาทและการคืนเงินเป็นไปตามข้อกำหนดทางกฎหมาย — ไม่ใช่เพียงคำร้องขออัตโนมัติเมื่อเริ่มบริการแล้ว",
      ],
    },
    title: "กระแสเงิน: จากเอสโครว์สู่ Wallet",
    subtitle: "มุมมองฝั่งจ้าง — เงินอยู่ตรงไหนในแต่ละขั้น",
    summary:
      "เงินเคลื่อนจากการอนุมัติชำระเข้าเอสโครว์ แล้วจึงไปสู่การชำระจริง — ไม่ส่งต่อกันเป็นเงินสดนอกระบบ",
    detail:
      "ถือเอสโครว์เป็นหลักฐานการถือเงินสำหรับงาน หลังคุณยืนยันปิดงาน (หรือตามขั้นตอนที่นโยบายกำหนด) ระบบจะจ่ายให้ผู้ให้บริการหลังหักค่าธรรมเนียม ตรวจสอบ Wallet และข้อกำหนดล่าสุดเสมอ",
    pro_tips: [
      "อัปเดต KYC และช่องทางชำระเงินให้พร้อม เพื่อลดความล่าช้าในการปล่อยเงิน",
      "เปลี่ยนขอบเขตงานผ่านแชทในแอปเพื่อให้มีหลักฐานตรวจสอบ",
    ],
    policy_links: [
      { label: "ข้อกำหนด & การคืนเงิน", path: "/legal?type=terms" },
      { label: "นโยบายคืนเงิน", path: "/legal?type=refund" },
    ],
    footer_links: [
      { label: "เปิด Wallet", path: "/dashboard/wallet" },
      { label: "เติม Wallet", path: "/wallet/topup" },
      { label: "สถานะ KYC", path: "/kyc" },
    ],
    route: "/dashboard/wallet",
    guided_tour: null,
  }),
  E({
    id: "cleaning",
    segment_label: "แม่บ้าน & ขอบเขต",
    learn_about: "เช็กลิสต์ · เอสโครว์ · การยืนยัน",
    bullets: {
      money: ["เอสโครว์ถืองบจนกว่าคุณจะยืนยันปิดงาน"],
      time: ["ขอบเขตถูกล็อกผ่านเช็กลิสต์ก่อนเริ่มงาน"],
      risk: ["ข้อตกลงนอกแอปได้รับการสนับสนุนข้อพิพาทน้อยลง"],
    },
    title: "มาตรฐานแม่บ้านและขอบเขตงาน",
    subtitle: "หมวดหมู่ → เช็กลิสต์ → สร้างงาน",
    summary:
      "โพสต์ในหมวดทำความสะอาด กรอกเช็กลิสต์ทรัพย์สิน เงินค้ำในเอสโครว์จนกว่าจะยืนยันปิดงาน",
    detail:
      "เลือกหมวด ตรวจขอบเขตและอุปกรณ์ สร้างงานให้ชัดเจน เงินจะอยู่ในเอสโครว์ตามนโยบายจนกว่าจะยืนยันผลงาน",
    pro_tips: ["ถ่ายภาพสภาพต้นทางเมื่อจำเป็น — ช่วยให้รับงานชัดเจน"],
    policy_links: [{ label: "ข้อกำหนด", path: "/legal?type=terms" }],
    footer_links: [
      { label: "สร้างงาน", path: "/create-job" },
      { label: "การตั้งค่า", path: "/settings" },
    ],
    route: "/",
    guided_tour: "cleaning",
  }),
  E({
    id: "party",
    segment_label: "งานเลี้ยง",
    learn_about: "สไตล์ · มัดจำ · หลักฐานในระบบ",
    bullets: {
      money: ["มัดจำล็อกสล็อตก่อนเดินทางหรือเข้างาน"],
      time: ["Party Vibe รวมเวลาและความคาดหวังในฟอร์มเดียว"],
      risk: ["การเปลี่ยนแปลงนาทีสุดท้ายควรยืนยันในแอป"],
    },
    title: "งานเลี้ยงและการบริการ",
    subtitle: "เลือกสไตล์ → จอง → มัดจำ",
    summary:
      "ใช้ Party Vibe เพื่อโครงสร้างคำขอ เงื่อนไขมัดจำล็อกการจองก่อนเริ่มบริการ",
    detail:
      "ฟอร์มเติมอัตโนมัติลดความผิดพลาด ยืนยันมัดจำ เวลา และความคาดหวัง สื่อสารผ่านระบบเพื่อตรวจสอบย้อนหลังได้",
    pro_tips: ["ระบุดรสแต่งกติกาเข้าพื้นที่เป็นหนังสือก่อนกิจกรรม"],
    policy_links: [{ label: "ข้อกำหนด", path: "/legal?type=terms" }],
    footer_links: [
      { label: "Party Vibe", path: "/party-vibe" },
      { label: "การจองของฉัน", path: "/my-bookings" },
    ],
    route: "/party-vibe",
    guided_tour: "party",
  }),
  E({
    id: "driver",
    segment_label: "ขนส่ง",
    learn_about: "เส้นทาง · ค่าโดยสาร · ปิดเที่ยว",
    bullets: {
      money: ["ค่าโดยสารตามอัตราที่แสดงก่อนยืนยัน"],
      time: ["จุดรับ-ส่งกำหนดหน้าต่างบริการ"],
      risk: ["การยกเลิกหลังล็อกอาจมีค่าตามข้อกำหนด"],
    },
    title: "ขนส่งและเส้นทาง",
    subtitle: "จุดรับ-ส่ง → ประเภทรถ → ยืนยัน",
    summary:
      "ระบุต้นทางและปลายทาง เลือกระดับรถ ค่าโดยสารตามกติกาก่อนยืนยัน",
    detail:
      "ตรวจสอบประมาณการ เส้นทาง และเงื่อนไขยกเลิก การชำระเงินตามนโยบายหลังจบเที่ยว",
    pro_tips: ["ตรวจหมุดให้ตรง — เป็นฐานราคาและเวลา"],
    policy_links: [{ label: "ข้อกำหนด", path: "/legal?type=terms" }],
    footer_links: [{ label: "ขนส่ง", path: "/transport" }],
    route: "/transport",
    guided_tour: "driver",
  }),
  E({
    id: "technical",
    segment_label: "ช่างเทคนิค",
    learn_about: "ใบรับรอง · ขอบเขตราคา · หลักฐาน",
    bullets: {
      money: ["หมวดราคาคงที่ลดความคลุมเครือเมื่อมีการแสดง"],
      time: ["วินิจฉัยและขอบเขตควรตกลงก่อนเริ่มใช้จ่ายจริง"],
      risk: ["เสนอราคานอกแอปไม่ได้รับความคุ้มครองแพลตฟอร์ม"],
    },
    title: "บริการช่างเทคนิค",
    subtitle: "ใบรับรอง → วินิจฉัย → ขอบเขตราคา",
    summary:
      "ตรวจสอบใบรับรองผู้ให้บริการ ใช้ราคาคงที่เมื่อหมวดกำหนด",
    detail:
      "การโพสต์ครอบคลุมหลักฐานและการรับประกันที่คาดหวัง สอดคล้องขอบเขตก่อนเริ่มงาน",
    pro_tips: ["ถามเงื่อนไขรับประกันในเธรดงานเพื่อมีหลักฐาน"],
    policy_links: [{ label: "ข้อกำหนด", path: "/legal?type=terms" }],
    footer_links: [
      { label: "ค้นหา Talent", path: "/talents" },
      { label: "สร้างงาน", path: "/create-job" },
    ],
    route: "/",
    guided_tour: "technical",
  }),
  E({
    id: "advance_jobs",
    segment_label: "AdvanceJob",
    learn_about: "บิด · ไมล์สโตน · การคัดเลือก",
    bullets: {
      money: ["เปรียบเทียบบิดจากต้นทุนจริงและ deliverables ไม่ใช่แค่ตัวเลขหัวข้อ"],
      time: ["ไมล์สโตนควรสอดคล้องไทม์ไลน์คุณ"],
      risk: ["การคัดเลือกนอกแอปไม่มีหลักฐานตรวจสอบ"],
    },
    title: "AdvanceJob และการประมูลราคา",
    subtitle: "โพสต์มีโครง → รับบิด → เลือกผู้รับ",
    summary:
      "เผยแพร่งานที่มีขอบเขตชัด เปรียบเทียบบิด เลือกตามเกณฑ์และไทม์ไลน์",
    detail:
      "Job Board รองรับการเจรจาและ milestone บันทึกการตัดสินใจในแอป",
    pro_tips: ["ถ่วงน้ำหนักความชัดเจนและความน่าเชื่อถือ ไม่ใช่แค่ราคาต่ำสุด"],
    policy_links: [{ label: "ข้อกำหนด", path: "/legal?type=terms" }],
    footer_links: [{ label: "Job Board", path: "/job-board" }],
    route: "/job-board",
    guided_tour: "advance_jobs",
  }),
  E({
    id: "match_job",
    segment_label: "Instant Match",
    learn_about: "SLA · การยอมรับ · เอสโครว์",
    bullets: {
      money: ["เอสโครว์ยังใช้บังคับ — ความเร็วไม่ตัดความปลอดภัยด้านเงิน"],
      time: ["ยอมรับภายใน SLA ไม่เช่นนั้นข้อเสนออาจหมดอายุ"],
      risk: ["การปฏิเสธซ้ำอาจกระทบลำดับการจับคู่ในอนาคต"],
    },
    title: "Instant Match",
    subtitle: "ระบบจับคู่ → หน้าต่างยอมรับ",
    summary:
      "Match Job เน้นความเร็ว ต้องยอมรับภายในช่วงเวลาที่กำหนด",
    detail:
      "ทำความเข้าใจเกณฑ์จับคู่ งบ และนโยบายยกเลิกก่อนโพสต์หรือรับงาน",
    pro_tips: ["เปิดการแจ้งเตือนในช่วง Instant Match"],
    policy_links: [{ label: "ข้อกำหนด", path: "/legal?type=terms" }],
    footer_links: [{ label: "หน้าแรก", path: "/" }],
    route: "/",
    guided_tour: "match_job",
  }),
  E({
    id: "video_portfolio",
    segment_label: "คลิป Talent",
    learn_about: "การค้นหา · ผลงาน · การจ้าง",
    bullets: {
      money: ["การจ้างต่อจากคลิปควรย้ายไปสู่งานที่มีเอสโครว์"],
      time: ["คลิปสั้นช่วยประเมินคนได้เร็วกว่าข้อความล้วน"],
      risk: ["ขอบเขตงานต้องยืนยันในระบบก่อนเริ่มงานจริง"],
    },
    title: "คลิปวิดีโอ: จ้างงานอย่างมั่นใจ",
    subtitle: "สัญญาณจากคลิป → สู่การจ้างมีโครง",
    summary:
      "ใช้ฟีดวิดีโอประเมินบุคลิกและสไตล์การทำงาน แล้วย้ายไปสร้างงานที่มีเอสโครว์",
    detail:
      "คลิป Talent เป็นแนวตั้งเหมาะมือถือ เน้นบริบทและผลงานจริง เมื่อจ้างให้ใช้ขั้นตอนงานมาตรฐานเพื่อให้เอสโครว์และนโยบายคุ้มครอง",
    pro_tips: ["ดูความชัดเจนของ deliverables และความตรงเวลาในคลิป"],
    policy_links: [{ label: "ข้อกำหนด", path: "/legal?type=terms" }],
    footer_links: [
      { label: "ดูคลิป", path: "/video-feed" },
      { label: "Talent", path: "/talents" },
    ],
    route: "/video-feed",
    guided_tour: null,
  }),
  E({
    id: "advanced_booking",
    segment_label: "การจอง",
    learn_about: "สล็อต · ซ้อน · Grace",
    bullets: {
      money: ["มัดจำและการยกเลิกตามสถานะการจองและข้อกำหนด"],
      time: ["ปฏิทินและช่วงว่างช่วยลดการจองซ้อนเมื่อใช้สม่ำเสมอ"],
      risk: ["งานซ้อนโดยไม่มี buffer เพิ่มความเสี่ยงไม่มาตามนัด"],
    },
    title: "การจองขั้นสูงและการจัดการเวลา",
    subtitle: "สล็อต · งานซ้อน · Grace",
    summary:
      "จัดการในการจองของฉัน เคารพหน้าต่างเวลาและกติกา Grace สำหรับเช็กอิน",
    detail:
      "ตั้งเวลาให้สมจริง เมื่อมีหลายงานติดกันให้เว้น buffer การเดินทาง ช่วง Grace สำหรับเช็กอินและยกเลิกระบุในข้อกำหนด — อ่านล่าสุดก่อนรับงานแน่น",
    pro_tips: [
      "ซิงค์เวลาทำงานกับความคาดหวัง Party และขนส่ง",
      "หากมีความขัดแย้ง แจ้งในเธรดการจองก่อน",
    ],
    policy_links: [
      { label: "ข้อกำหนด (Grace)", path: "/legal?type=terms" },
      { label: "คืนเงิน", path: "/legal?type=refund" },
    ],
    footer_links: [{ label: "การจองของฉัน", path: "/my-bookings" }],
    route: "/my-bookings",
    guided_tour: null,
  }),
];

const TH_TAL: AcademyCard[] = [
  E({
    id: "financial_flow",
    segment_label: "เอสโครว์ & Wallet",
    learn_about: "การส่งมอบ · การชำระ · ค่าธรรมเนียม",
    bullets: {
      money: [
        "เงินลูกค้าอยู่ในเอสโครว์ระหว่างคุณปฏิบัติงานจนกว่าจะยืนยันปิดงาน",
        "Wallet แสดงรายได้สุทธิหลังหักค่าธรรมเนียมแพลตฟอร์ม",
      ],
      time: ["การชำระมักตามหลังปิดงานและกติการอ (ถ้ามี) — ตรวจ Wallet หลังแต่ละงาน"],
      risk: ["รับเงินนอกแอปเสียการคุ้มครองและหลักฐาน"],
    },
    title: "กระแสเงิน: จากเอสโครว์สู่ Wallet",
    subtitle: "มุมมองผู้ให้บริการ — การจ่ายและค่าธรรมเนียม",
    summary:
      "เอสโครว์คุ้มครองทั้งสองฝ่าย การจ่ายเข้า Wallet หลังปิดงานสำเร็จตามนโยบาย",
    detail:
      "ทำขั้นตอนให้ครบ (รวมเช็กอิน QR หากบังคับ) ค่าธรรมเนียมแสดงใน Wallet ข้อพิพาทดำเนินผ่านฝ่ายสนับสนุนพร้อมหลักฐานในแอป",
    pro_tips: [
      "อัปเดต KYC และบัญชีรับเงินให้พร้อม",
      "เก็บ milestone สำคัญจากแชทเมื่อจำเป็น",
    ],
    policy_links: [
      { label: "ข้อกำหนด", path: "/legal?type=terms" },
      { label: "คืนเงิน", path: "/legal?type=refund" },
    ],
    footer_links: [
      { label: "Wallet", path: "/dashboard/wallet" },
      { label: "เติมเงิน (ถ้ามี)", path: "/wallet/topup" },
      { label: "KYC", path: "/kyc" },
    ],
    route: "/dashboard/wallet",
    guided_tour: null,
  }),
  E({
    id: "cleaning",
    segment_label: "แม่บ้าน",
    learn_about: "เช็กลิสต์ · QR · ปล่อยเอสโครว์",
    bullets: {
      money: ["เงินปล่อยหลังยืนยันปิดงานและนโยบาย"],
      time: ["ขอบเขตถูกกำหนดก่อนเริ่ม — เปลี่ยนต้องผ่านลูกค้า"],
      risk: ["ข้ามเช็กลิสต์เพิ่มความเสี่ยงงานซ้ำ"],
    },
    title: "การส่งมอบงานแม่บ้าน",
    subtitle: "รายละเอียดงาน → เช็กลิสต์ → ปฏิบัติ",
    summary:
      "เปิด Job Details ยืนยันประเภทที่อยู่และอุปกรณ์ สอดคล้องขอบก่อนเริ่ม",
    detail:
      "ทำตามเช็กลิสต์ บันทึกมอบงานตามที่กำหนด ปิดงานเพื่อปล่อยเอสโครว์",
    pro_tips: ["ถ่ายภาพมอบงานเพื่อลดข้อพิพาท"],
    policy_links: [{ label: "ข้อกำหนด", path: "/legal?type=terms" }],
    footer_links: [{ label: "แดชบอร์ดผู้ให้บริการ", path: "/provider/dashboard" }],
    route: "/provider/dashboard",
    guided_tour: "cleaning",
  }),
  E({
    id: "party",
    segment_label: "งานเลี้ยง",
    learn_about: "สไตล์ · มัดจำ · ในแอป",
    bullets: {
      money: ["มัดจำและ milestone ตามบันทึกการจอง"],
      time: ["ยืนยันก่อนช่วงเดินทางหรือเข้างาน"],
      risk: ["ข้อสัญญานอกแอปไม่ถือเป็นหลักฐานแพลตฟอร์ม"],
    },
    title: "งานบริการงานเลี้ยง",
    subtitle: "สไตล์ → ยืนยัน → มัดจำ",
    summary:
      "ทบทวนสไตล์และความคาดหวังของลูกค้า ยืนยันรับงานก่อนเดินทาง",
    detail:
      "เงื่อนไขมัดจำและเวลาใช้บังคับ สื่อสารผ่านระบบเพื่อระงับข้อพิพาท",
    pro_tips: ["ดรสแต่งและกติกาเข้าพื้นที่ควรอยู่ในเธรดก่อนออก"],
    policy_links: [{ label: "ข้อกำหนด", path: "/legal?type=terms" }],
    footer_links: [{ label: "แดชบอร์ด", path: "/provider/dashboard" }],
    route: "/provider/dashboard",
    guided_tour: "party",
  }),
  E({
    id: "driver",
    segment_label: "ขนส่ง",
    learn_about: "บันทึกเที่ยว · การจ่าย · ความปลอดภัย",
    bullets: {
      money: ["ปิดเที่ยวครบถึงมีสิทธิ์ได้รับเงินตามนโยบาย"],
      time: ["เวลาถึงและจบเที่ยวมีผลต่อเรตติ้ง"],
      risk: ["บันทึกเที่ยวไม่ครบอ่อนแอในข้อพิพาท"],
    },
    title: "การให้บริการขนส่ง",
    subtitle: "นำทาง → ถึงจุด → จบเที่ยว",
    summary:
      "เริ่มนำทางไปรับ ยืนยันถึงและปลายทางตามขั้นตอน",
    detail:
      "ปฏิบัติตามคำแนะนำความปลอดภัย บันทึกเที่ยวให้ครบเพื่อการจ่ายเงินและเรตติ้ง",
    pro_tips: ["เปลี่ยนปลายทางควรยืนยันในแอปเมื่อทำได้"],
    policy_links: [{ label: "ข้อกำหนด", path: "/legal?type=terms" }],
    footer_links: [{ label: "ขนส่ง", path: "/transport" }],
    route: "/provider/dashboard",
    guided_tour: "driver",
  }),
  E({
    id: "technical",
    segment_label: "หลักฐาน",
    learn_about: "ใบรับรอง · ใบเสนอราคา · ความน่าเชื่อถือ",
    bullets: {
      money: ["ใบเสนอราคาควรสอดคล้องกฎราคาคงที่ของหมวด"],
      time: ["อัปเดตใบรับรองก่อนช่วงเร่งด่วน"],
      risk: ["ข้อมูลใบรับรองเก่าลดความน่าเชื่อถือ"],
    },
    title: "หลักฐานและโปรไฟล์ช่าง",
    subtitle: "เอกสาร → อัปเกรด → ความน่าเชื่อถือ",
    summary:
      "อัปโหลดใบรับรองและผลงานเพื่อเพิ่มโอกาสได้รับจ้าง",
    detail:
      "รักษาข้อมูลใบรับรองให้ถูกต้อง เสนอราคาสอดคล้องกฎราคาคงที่ของหมวด",
    pro_tips: ["ชุดก่อน-หลังในแชทช่วยเรื่องการรับประกัน"],
    policy_links: [{ label: "ข้อกำหนด", path: "/legal?type=terms" }],
    footer_links: [{ label: "โปรไฟล์", path: "/profile" }],
    route: "/profile",
    guided_tour: "technical",
  }),
  E({
    id: "advance_jobs",
    segment_label: "AdvanceJob",
    learn_about: "บิด · SLA · ได้รับงาน",
    bullets: {
      money: ["ราคาบิดควรรวมต้นทุนจริง"],
      time: ["ตอบภายใน SLA และเดดไลน์บอร์ด"],
      risk: ["บิดคลุมเครือแพ้เสนอที่ชัดกว่า"],
    },
    title: "การประมูล AdvanceJob",
    subtitle: "ยื่นบิด → เจรจา → ได้รับงาน",
    summary:
      "เสนอราคาแข่งขัน ชี้แจง deliverables ก่อนลูกค้าคัดเลือก",
    detail:
      "ติดตาม milestone และข้อความใน Job Board ปฏิบัติตามเวลารับงาน",
    pro_tips: ["นำเสนอ deliverables ก่อนราคาเปล่า"],
    policy_links: [{ label: "ข้อกำหนด", path: "/legal?type=terms" }],
    footer_links: [{ label: "Job Board", path: "/job-board" }],
    route: "/job-board",
    guided_tour: "advance_jobs",
  }),
  E({
    id: "match_job",
    segment_label: "Instant Match",
    learn_about: "SLA · การยอมรับ · เอสโครว์",
    bullets: {
      money: ["รู้ค่าตอบแทนและค่าธรรมเนียมก่อนเลื่อนรับ"],
      time: ["SLA สั้น — ถือเป็นการผูกพันแบบเรียลไทม์"],
      risk: ["หมดเวลาอาจกระทบลำดับการจับคู่"],
    },
    title: "การรับ Instant Match",
    subtitle: "หน้าต่างข้อเสนอ → ยอมรับ",
    summary:
      "ตอบสนองภายใน SLA การปฏิเสธหรือหมดเวลาอาจมีผลต่อลำดับการจับคู่",
    detail:
      "ตรวจค่าตอบแทน พื้นที่ และการยกเลิกก่อนรับงาน",
    pro_tips: ["เปิดการแจ้งเตือนในช่วงสแตนด์บาย"],
    policy_links: [{ label: "ข้อกำหนด", path: "/legal?type=terms" }],
    footer_links: [{ label: "แดชบอร์ด", path: "/provider/dashboard" }],
    route: "/provider/dashboard",
    guided_tour: "match_job",
  }),
  E({
    id: "video_portfolio",
    segment_label: "คลิปวิดีโอ",
    learn_about: "9:16 · ความยาว · อัตราจับคู่",
    bullets: {
      money: [
        "คลิปที่ดีเพิ่มโอกาสได้งานจริง — ยังต้องใช้งานผ่านเอสโครว์เมื่อจ้าง",
      ],
      time: ["คลิปสั้น ใส่จุดแข็งช่วงต้น"],
      risk: ["ตัดต่อเกินจริงเสียความน่าเชื่อถือและเรตติ้ง"],
    },
    title: "เพิ่มการมีอยู่: คลิปที่มีผลสูง",
    subtitle: "วิดีโอแนวตั้ง · ขีดจำกัด · การค้นพบ",
    summary:
      "อัปโหลดคลิปแนวตั้ง 9:16 แสดงการทำงานจริง แสงชัด เสียงนุ่มนวลกว่าฟิลเตอร์ล้น",
    detail:
      "แพลตฟอร์มกำหนดความยาวและขนาดไฟล์ — อยู่ในเงื่อนไขเพื่อไม่ให้ประมวลผลล้มเหลว คลิปที่มีขอบเขต ตรงเวลา และความเป็นมืออาชีพช่วย Instant Match และ Job Board โปรดอัปเดตคลิปเป็นระยะ",
    pro_tips: [
      "หนึ่งคลิปหนึ่งจุดเด่น — ชัดกว่ามอนตาจมาก",
      "จบด้วยคำว่าต้องการรับงานแบบใดต่อ",
    ],
    policy_links: [{ label: "ข้อกำหนด", path: "/legal?type=terms" }],
    footer_links: [
      { label: "ฟีดวิดีโอ", path: "/video-feed" },
      { label: "โปรไฟล์", path: "/profile" },
    ],
    route: "/video-feed",
    guided_tour: null,
  }),
  E({
    id: "advanced_booking",
    segment_label: "การจอง",
    learn_about: "ความว่าง · ซ้อนกัน · Grace",
    bullets: {
      money: ["ค่าปรับและไม่มาตามนัดตามข้อกำหนดและสถานะการจอง"],
      time: ["เรียงงานให้มี buffer การเดินทางและเตรียมตัว"],
      risk: ["จองซ้อนโดยไม่มี buffer เสี่ยงยกเลิก"],
    },
    title: "จัดการสล็อตเวลาและงานซ้อน",
    subtitle: "ความพร้อม · งานเรียง · Grace",
    summary:
      "ประกาศความพร้อมจริง หลีกเลี่ยงสล็อตซ้อนโดยไม่มีเว้นระยะเดินทาง",
    detail:
      "ใช้การจองของฉันและวินัยปฏิทิน หากมีหลายงานติดกันให้เว้น buffer ช่วง Grace สำหรับเช็กอินและยกเลิกระบุในข้อกำหนด — อ่านล่าสุดก่อนรับงานแน่น",
    pro_tips: [
      "เว้นเวลาแอดมินระหว่างงานหนัก",
      "หากเกิดความขัดแย้ง แจ้งลูกค้าในแอปทันที",
    ],
    policy_links: [
      { label: "ข้อกำหนด & Grace", path: "/legal?type=terms" },
      { label: "คืนเงิน", path: "/legal?type=refund" },
    ],
    footer_links: [{ label: "การจองของฉัน", path: "/my-bookings" }],
    route: "/my-bookings",
    guided_tour: null,
  }),
];

export const ACADEMY_HUB_TH: AcademyHubStrings = {
  skip: "ข้ามไปหน้าหลัก",
  page_title: "Senior Professional Onboarding",
  page_sub_employer:
    "ศูนย์บัญชาการสั้น ๆ — การปฏิบัติตามกฎ เอสโครว์ และการจัดการเวลา",
  page_sub_talent:
    "ศูนย์บัญชาการสั้น ๆ — การส่งมอบ การยืนยันตัวตน และการรับเงิน",
  mode_employer: "ฝั่งจ้างงาน",
  mode_talent: "ฝั่งรับงาน",
  summary: "สรุปผู้บริหาร",
  detailed: "รายละเอียดเชิงลึก",
  badge_30: "สแกน ~30 วินาที",
  badge_5: "อ่าน ~5 นาที",
  cta: "เริ่ม walkthrough แนะนำ",
  cta_continue: "ไปยังหน้าทำงาน",
  in_this_section: "ในส่วนนี้",
  learn_about_prefix: "เรียนรู้เรื่อง",
  outline_title: "กระโดดสู่หัวข้อ",
  outline_open: "เปิด",
  labels_money: "เงิน",
  labels_time: "เวลา",
  labels_risk: "ความเสี่ยง",
  pro_tips: "เคล็ดลับ",
  policies_refs: "นโยบายและอ้างอิง",
  credential:
    "เมื่อเรียนจบตามเส้นทาง อาจได้รับเครดิตดิจิทัลหรือแบดจ์ยืนยันบนโปรไฟล์ ตามเงื่อนไขของแพลตฟอร์ม",
  footer_employer:
    "การกำกับแพลตฟอร์ม: เอสโครว์ป้องกันเงินจนกว่าจะยืนยันงาน — ตรวจสอบ KYC และช่องทางชำระเงินในการตั้งค่า",
  footer_talent:
    "มาตรฐานการให้บริการ: การเช็กอิน QR อาจจำเป็นต่อความคุ้มครอง — ยอดและค่าธรรมเนียมดูได้ใน Wallet หลังปิดงาน",
  reminder_title: "หลังปิดงาน",
  reminder_body:
    "เช็กอิน QR ตามที่กำหนด (ถ้ามี) — ตรวจสอบรายได้และค่าธรรมเนียมใน Wallet หลังการชำระ",
  prev: "ก่อนหน้า",
  next: "ถัดไป",
  of: "จาก",
  glossary_title: "คำศัพท์สำคัญ",
  employer_cards: TH_EMP,
  talent_cards: TH_TAL,
};

export function getAcademyHub(lang: string): AcademyHubStrings {
  return lang === "th" ? ACADEMY_HUB_TH : ACADEMY_HUB_EN;
}

export function getAcademyGlossary(lang: string): Record<string, string> {
  return lang === "th" ? ACADEMY_GLOSSARY_TH : ACADEMY_GLOSSARY_EN;
}
