/**
 * Mock Jobs for Apple Store Review — 10 professional jobs with Bangkok addresses.
 * Shown only to test accounts (Employer 0812345601, Talent 0812345602) so reviewers always see a populated Job Board.
 */

import type { JobAdvanceAPI } from "../types/api";

/** Test account phones (Apple demo) — reviewer mode enabled for these users */
export const REVIEWER_TEST_PHONES = ["0812345601", "0812345602", "+66812345601", "+66812345602", "66812345601", "66812345602"];

export function isReviewerMode(user: { phone?: string } | null): boolean {
  if (!user?.phone) return false;
  const normalized = user.phone.replace(/\D/g, "").replace(/^66/, "0");
  return REVIEWER_TEST_PHONES.some((p) => p.replace(/\D/g, "").replace(/^66/, "0") === normalized);
}

const NOW = new Date().toISOString();
const MOCK_IDS = [
  "mock-review-001",
  "mock-review-002",
  "mock-review-003",
  "mock-review-004",
  "mock-review-005",
  "mock-review-006",
  "mock-review-007",
  "mock-review-008",
  "mock-review-009",
  "mock-review-010",
];

export const MOCK_JOBS_FOR_REVIEW: JobAdvanceAPI[] = [
  {
    id: MOCK_IDS[0],
    employer_id: "demo-employer",
    employer_name: "Bangkok Design Studio",
    employer_trust_score: 85,
    title: "Logo Design for New Café Brand",
    description:
      "We need a professional logo design for our new café opening in Sukhumvit. The brand should convey warmth, modern Thai aesthetics, and a cozy atmosphere. Deliverables include primary logo, icon version, and color palette. Experience with F&B branding preferred.",
    scope:
      "• Primary logo (vector)\n• Icon/symbol for social media\n• Color palette (hex codes)\n• 2 rounds of revisions included\n• Final files: AI, PNG, SVG",
    category: "Design & Creative",
    min_budget: 3500,
    max_budget: 6000,
    duration_days: 7,
    status: "open",
    applicant_count: 3,
    view_count: 24,
    created_at: NOW,
    updated_at: NOW,
    published_at: NOW,
    closed_at: null,
  },
  {
    id: MOCK_IDS[1],
    employer_id: "demo-employer",
    employer_name: "Siam Paragon Marketing",
    employer_trust_score: 92,
    title: "Thai–English Translation for Product Catalog",
    description:
      "Translate a 50-page product catalog from Thai to English. Technical products (electronics and home appliances). Must be fluent in both languages with experience in technical translation. Style guide will be provided.",
    scope:
      "• Full translation of 50 pages\n• Glossary of technical terms\n• Consistency check across document\n• Delivery in Word and PDF",
    category: "Writing & Translation",
    min_budget: 8000,
    max_budget: 12000,
    duration_days: 10,
    status: "open",
    applicant_count: 5,
    view_count: 41,
    created_at: NOW,
    updated_at: NOW,
    published_at: NOW,
    closed_at: null,
  },
  {
    id: MOCK_IDS[2],
    employer_id: "demo-employer",
    employer_name: "Silom Tech Co.",
    employer_trust_score: 78,
    title: "Short Promotional Video (60 seconds)",
    description:
      "Create a 60-second promotional video for our mobile app launch. Location: Silom area. We have raw footage; need editing, music, and subtitles. Modern, energetic style. Target audience: young professionals in Bangkok.",
    scope:
      "• 60-second final video (1080p)\n• Music licensing or royalty-free\n• Thai and English subtitles\n• 2 revision rounds",
    category: "Video & Animation",
    min_budget: 12000,
    max_budget: 18000,
    duration_days: 14,
    status: "open",
    applicant_count: 2,
    view_count: 18,
    created_at: NOW,
    updated_at: NOW,
    published_at: NOW,
    closed_at: null,
  },
  {
    id: MOCK_IDS[3],
    employer_id: "demo-employer",
    employer_name: "Startup Hub Thonglor",
    employer_trust_score: 88,
    title: "WordPress Website with Booking System",
    description:
      "Build a WordPress website for a co-working space in Thonglor. Must include: landing page, pricing, room booking calendar, and contact form. Responsive design required. Hosting already set up.",
    scope:
      "• Custom WordPress theme or page builder\n• Booking calendar integration\n• Contact form with email notifications\n• Mobile-responsive design\n• Basic SEO setup",
    category: "Programming & Tech",
    min_budget: 15000,
    max_budget: 25000,
    duration_days: 21,
    status: "open",
    applicant_count: 4,
    view_count: 56,
    created_at: NOW,
    updated_at: NOW,
    published_at: NOW,
    closed_at: null,
  },
  {
    id: MOCK_IDS[4],
    employer_id: "demo-employer",
    employer_name: "Ekkamai Restaurant Group",
    employer_trust_score: 75,
    title: "Social Media Content (Instagram & Facebook)",
    description:
      "Manage social media for 3 restaurant branches in Ekkamai. Create weekly content: photos, captions, stories. Must understand food photography and Thai dining culture. Provide content calendar and analytics summary.",
    scope:
      "• 12 posts per month (4 per branch)\n• 20 stories per month\n• Content calendar in advance\n• Monthly analytics report",
    category: "Marketing",
    min_budget: 6000,
    max_budget: 10000,
    duration_days: 30,
    status: "open",
    applicant_count: 7,
    view_count: 62,
    created_at: NOW,
    updated_at: NOW,
    published_at: NOW,
    closed_at: null,
  },
  {
    id: MOCK_IDS[5],
    employer_id: "demo-employer",
    employer_name: "Phrom Phong Office",
    employer_trust_score: 90,
    title: "Virtual Assistant – Data Entry & Scheduling",
    description:
      "Part-time virtual assistant for a small consulting firm. Tasks: data entry, email management, calendar scheduling, and basic research. Fluent English required. 15–20 hours per week. Work from home.",
    scope:
      "• Daily email triage and responses\n• Calendar management (Google Calendar)\n• Data entry into spreadsheets\n• Weekly summary report",
    category: "Admin & Support",
    min_budget: 4000,
    max_budget: 7000,
    duration_days: 30,
    status: "open",
    applicant_count: 9,
    view_count: 89,
    created_at: NOW,
    updated_at: NOW,
    published_at: NOW,
    closed_at: null,
  },
  {
    id: MOCK_IDS[6],
    employer_id: "demo-employer",
    employer_name: "Ratchaprasong Retail",
    employer_trust_score: 82,
    title: "Product Photography – Fashion Items",
    description:
      "Professional product photography for online store. 50–80 items (clothing and accessories). White background, consistent lighting. Location: Ratchaprasong area. Need high-res images for e-commerce.",
    scope:
      "• 50–80 product photos (white bg)\n• Retouching included\n• 2–3 angles per item\n• Delivery: JPEG + edited PSD if needed",
    category: "Design & Creative",
    min_budget: 10000,
    max_budget: 15000,
    duration_days: 14,
    status: "open",
    applicant_count: 4,
    view_count: 33,
    created_at: NOW,
    updated_at: NOW,
    published_at: NOW,
    closed_at: null,
  },
  {
    id: MOCK_IDS[7],
    employer_id: "demo-employer",
    employer_name: "Ari Community Project",
    employer_trust_score: 70,
    title: "Event Photography – Community Fair",
    description:
      "Document a one-day community fair in Ari. Need candid shots, group photos, and coverage of activities. Deliver edited photos within 3 days. Experience with events preferred.",
    scope:
      "• Full-day coverage (8 hours)\n• Minimum 200 edited photos\n• Online gallery delivery\n• Usage rights for promotional materials",
    category: "Design & Creative",
    min_budget: 5000,
    max_budget: 8000,
    duration_days: 5,
    status: "open",
    applicant_count: 6,
    view_count: 28,
    created_at: NOW,
    updated_at: NOW,
    published_at: NOW,
    closed_at: null,
  },
  {
    id: MOCK_IDS[8],
    employer_id: "demo-employer",
    employer_name: "Asok Business Center",
    employer_trust_score: 95,
    title: "Monthly Bookkeeping & Tax Prep Support",
    description:
      "Monthly bookkeeping for a small trading company. Tasks: reconcile bank statements, prepare P&L, assist with VAT and withholding tax. Must be familiar with Thai accounting standards. 2–3 days per month.",
    scope:
      "• Monthly reconciliation\n• P&L and balance sheet\n• VAT filing support\n• Withholding tax documentation",
    category: "Admin & Support",
    min_budget: 8000,
    max_budget: 12000,
    duration_days: 30,
    status: "open",
    applicant_count: 2,
    view_count: 19,
    created_at: NOW,
    updated_at: NOW,
    published_at: NOW,
    closed_at: null,
  },
  {
    id: MOCK_IDS[9],
    employer_id: "demo-employer",
    employer_name: "Chatuchak Weekend Market",
    employer_trust_score: 68,
    title: "Banner & Signage Design for Stall",
    description:
      "Design eye-catching banners and signage for a food stall at Chatuchak. Must work well in crowded environment. Include: main sign, menu board, and promotional banners. Print-ready files required.",
    scope:
      "• Main stall sign (2m x 1m)\n• Menu board design\n• 2 promotional banners\n• Print-ready PDF (CMYK)",
    category: "Design & Creative",
    min_budget: 2500,
    max_budget: 4500,
    duration_days: 5,
    status: "open",
    applicant_count: 8,
    view_count: 47,
    created_at: NOW,
    updated_at: NOW,
    published_at: NOW,
    closed_at: null,
  },
];

export function getMockJobsForReview(): JobAdvanceAPI[] {
  return [...MOCK_JOBS_FOR_REVIEW];
}

export function getMockJobById(id: string): JobAdvanceAPI | null {
  return MOCK_JOBS_FOR_REVIEW.find((j) => j.id === id) ?? null;
}

/** UUID pattern — real job IDs from backend; never mock */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isMockJobId(id: string): boolean {
  if (!id || typeof id !== "string") return false;
  if (UUID_REGEX.test(id.trim())) return false;
  return MOCK_IDS.includes(id);
}
