import type {
  TalentAiHistoryEntry,
  TalentAiIncubationBriefPlaceholder,
  TalentAiJobSuggestionPlaceholder,
  TalentAiPromptTemplate,
  TalentAiResumeDraftPlaceholder,
} from '@/lib/talent/talentAiTypes';

/** Static placeholder content — replace with integration port in TOS-5 */

export const PLACEHOLDER_RESUME_DRAFT: TalentAiResumeDraftPlaceholder = {
  headline: 'ช่างไฟฟ้า · งานบ้านและ condo',
  summary:
    'Placeholder — ร่างจาก ai-core `/v1/talent/resume-draft` จะแสดงที่นี่หลัง RFC อนุมัติ runtime',
  skills: ['เดินสายไฟ', 'ติดตั้ง breaker', 'แก้ไขฉุกเฉิน'],
  journey: 'เริ่มจากงานเล็กในชุมชน → รับงาน Match ภาคสนาม → ขยาย Booking คิวเย็น',
};

export const PLACEHOLDER_JOB_SUGGESTIONS: TalentAiJobSuggestionPlaceholder[] = [
  {
    id: 'sug-match',
    profession: 'ช่างไฟ',
    surface: 'match',
    reason: 'งานด่วนในพื้นที่ — Match Job',
    href: '/m/services/match',
  },
  {
    id: 'sug-board',
    profession: 'ช่างไฟ',
    surface: 'board',
    reason: 'โปรเจกต์ Renovate — Job Board',
    href: '/m/services/board',
  },
  {
    id: 'sug-booking',
    profession: 'ช่างไฟ',
    surface: 'booking',
    reason: 'ลูกค้าจองคิว — Booking',
    href: '/m/services/booking/talents',
  },
  {
    id: 'sug-video',
    profession: 'ช่างไฟ',
    surface: 'video',
    reason: 'โชว์ผลงาน — Video Feed',
    href: '/m/services/video',
  },
];

export const PLACEHOLDER_INCUBATION_BRIEF: TalentAiIncubationBriefPlaceholder = {
  weekLabel: 'สัปดาห์นี้ (placeholder)',
  hook: '3 วินาทีแรก: โชว์เครื่องมือ + ปัญหาที่แก้ได้',
  script:
    '「สวัสดีครับ วันนี้มาแก้ไฟดับทั้งบ้านให้ลูกค้า…」 — สคริปต์จริงจาก incubation-brief.js หลังเชื่อม AI',
  cta: 'ปิดท้าย: จองคิวผ่าน Booking · ลิงก์ในโปรไฟล์',
};

export const PLACEHOLDER_AI_HISTORY: TalentAiHistoryEntry[] = [
  {
    id: 'hist-1',
    panel: 'resume',
    title: 'Resume draft preview',
    preview: 'Placeholder session — ไม่มี LLM call',
    status: 'placeholder',
    createdAt: '2026-07-19T09:00:00+07:00',
  },
  {
    id: 'hist-2',
    panel: 'jobs',
    title: 'Routing matrix suggest',
    preview: 'Match + Board surfaces for ช่างไฟ',
    status: 'placeholder',
    createdAt: '2026-07-18T14:30:00+07:00',
  },
  {
    id: 'hist-3',
    panel: 'incubation',
    title: 'Weekly clip brief',
    preview: '15s script placeholder',
    status: 'placeholder',
    createdAt: '2026-07-17T10:00:00+07:00',
  },
];

export const PLACEHOLDER_PROMPT_TEMPLATES: TalentAiPromptTemplate[] = [
  {
    id: 'tpl-resume',
    label: 'Resume',
    prompt: 'ช่วยร่างประสบการณ์ทำงานสำหรับช่างไฟที่รับงานบ้านและ condo',
  },
  {
    id: 'tpl-jobs',
    label: 'Find work',
    prompt: 'แนะนำว่าควรหางานผ่าน Match, Board หรือ Booking สำหรับ profession ช่างไฟ',
  },
  {
    id: 'tpl-incubation',
    label: 'Clip script',
    prompt: 'เขียนสคริปต์คลิป 15 วินาทีโชว์ฝีมือและปิดท้ายด้วย CTA จอง',
  },
];
