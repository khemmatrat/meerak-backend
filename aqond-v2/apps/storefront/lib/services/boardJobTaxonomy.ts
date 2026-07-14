/** Job Board taxonomy — subset of mobile/constants/workTaxonomy.ts */

export const BOARD_CATEGORY_GROUPS: { group: string; categories: string[] }[] = [
  {
    group: 'AI & Data',
    categories: [
      'AI Development',
      'Data Analysis',
      'Data Science & AI',
      'Dashboard & BI',
      'Chatbot',
    ],
  },
  {
    group: 'Marketing',
    categories: [
      'Digital Marketing',
      'SEO',
      'Social Media Ads',
      'Creative & Content Marketing',
      'Branding',
    ],
  },
  {
    group: 'Design',
    categories: [
      'Graphic Design',
      'Logo Design',
      'UI/UX Design',
      'Illustration',
      'Video Editing',
    ],
  },
  {
    group: 'Programming',
    categories: [
      'Web Development',
      'Mobile App Development',
      'WordPress Development',
      'E-commerce Development',
      'IT Support',
    ],
  },
  {
    group: 'Business',
    categories: [
      'Business Consulting',
      'Accounting',
      'Legal Consulting',
      'Translation',
      'Virtual Assistant',
    ],
  },
];

export const ALL_BOARD_CATEGORIES = BOARD_CATEGORY_GROUPS.flatMap((g) => g.categories);

export const BOARD_EMPLOYMENT_TYPES: { id: string; label: string }[] = [
  { id: 'one_time', label: 'จ้างครั้งเดียว' },
  { id: 'urgent', label: 'งานด่วน' },
  { id: 'project', label: 'โปรเจกต์ระยะสั้น' },
  { id: 'contract', label: 'สัญญารายเดือน' },
  { id: 'part_time', label: 'พาร์ทไทม์' },
  { id: 'full_time', label: 'ฟูลไทม์' },
];

export const BOARD_PROVINCES = [
  'กรุงเทพมหานคร',
  'นนทบุรี',
  'ปทุมธานี',
  'สมุทรปราการ',
  'เชียงใหม่',
  'ขอนแก่น',
  'ภูเก็ต',
  'ชลบุรี',
  'นครราชสีมา',
  'สงขลา',
];

export const BOARD_SORT_OPTIONS: { value: 'newest' | 'budget_high' | 'applicants'; label: string }[] = [
  { value: 'newest', label: 'ใหม่ล่าสุด' },
  { value: 'budget_high', label: 'งบสูงสุด' },
  { value: 'applicants', label: 'ผู้สมัครมาก' },
];

export const BOARD_STATUS_LABELS: Record<string, string> = {
  open: 'เปิดรับ',
  pending: 'รอดำเนินการ',
  closed: 'ปิดรับ',
  completed: 'เสร็จสิ้น',
  interested: 'สนใจ',
  shortlisted: 'คัดเลือกแล้ว',
  hired: 'จ้างแล้ว',
  rejected: 'ปฏิเสธ',
};

export const PREMIUM_BUDGET_THRESHOLD = 15000;

export function boardCategoryLabel(category: string): string {
  return category.replace(/_/g, ' ');
}

export function boardEmploymentLabel(id: string): string {
  return BOARD_EMPLOYMENT_TYPES.find((e) => e.id === id)?.label || id;
}

export function boardStatusLabel(status: string): string {
  return BOARD_STATUS_LABELS[String(status || '').toLowerCase()] || status;
}

export function formatBoardBudget(min: number, max: number): string {
  return `฿${Number(min || 0).toLocaleString('th-TH')}–${Number(max || 0).toLocaleString('th-TH')}`;
}
