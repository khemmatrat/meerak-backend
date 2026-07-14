/** Category hub data — same groups as mobile/lib/jobCategoryHub.ts */

export type JobCategoryGroupId = 'home' | 'lifestyle' | 'health' | 'tech' | 'logistics';

export const JOB_CATEGORY_GROUPS: { id: JobCategoryGroupId; categories: string[] }[] = [
  {
    id: 'home',
    categories: [
      'Cleaning',
      'AC_Cleaning',
      'Plumbing',
      'Electrician',
      'Moving',
      'Gardening',
      'Painting',
      'Pest_Control',
      'Appliance_Repair',
      'Interior_Design',
    ],
  },
  {
    id: 'lifestyle',
    categories: [
      'Dating',
      'Shopping_Buddy',
      'Party_Guest',
      'Model',
      'Consultant',
      'Fortune_Telling',
      'Queue_Service',
      'Private_Chef',
    ],
  },
  {
    id: 'health',
    categories: ['Beauty', 'Massage', 'Physiotherapy', 'Personal_Trainer', 'Pet_Care', 'Caregiving'],
  },
  {
    id: 'tech',
    categories: [
      'IT_Support',
      'Web_Dev',
      'Graphic_Design',
      'Photography',
      'Videography',
      'Translation',
      'Accounting',
      'Legal',
    ],
  },
  {
    id: 'logistics',
    categories: ['Driver', 'Messenger', 'Tutoring', 'General'],
  },
];

export const CATEGORY_EMOJI: Record<string, string> = {
  All: '✨',
  Cleaning: '🧹',
  AC_Cleaning: '❄️',
  Plumbing: '🔧',
  Electrician: '⚡',
  Moving: '📦',
  Gardening: '🌿',
  Painting: '🎨',
  Pest_Control: '🐛',
  Appliance_Repair: '🔩',
  Interior_Design: '🛋️',
  Dating: '💝',
  Shopping_Buddy: '🛍️',
  Party_Guest: '🎉',
  Model: '👤',
  Consultant: '💼',
  Fortune_Telling: '🔮',
  Queue_Service: '📋',
  Private_Chef: '👨‍🍳',
  Beauty: '💄',
  Massage: '💆',
  Physiotherapy: '🏥',
  Personal_Trainer: '🏋️',
  Pet_Care: '🐾',
  Caregiving: '🤝',
  IT_Support: '💻',
  Web_Dev: '🌐',
  Graphic_Design: '🖌️',
  Photography: '📷',
  Videography: '🎥',
  Translation: '🗣️',
  Accounting: '🧮',
  Legal: '⚖️',
  Driver: '🚗',
  Messenger: '🛵',
  Tutoring: '📚',
  General: '📌',
};

export const GROUP_LABELS: Record<JobCategoryGroupId, string> = {
  home: 'บ้าน & ซ่อมบำรุง',
  lifestyle: 'ไลฟ์สไตล์',
  health: 'สุขภาพ & ดูแล',
  tech: 'เทค & โปรเฟสชัน',
  logistics: 'ขนส่ง & ทั่วไป',
};

export function categoryLabel(cat: string): string {
  if (cat === 'All') return 'ทั้งหมด';
  return CATEGORY_EMOJI[cat] ? `${CATEGORY_EMOJI[cat]} ${cat.replace(/_/g, ' ')}` : cat.replace(/_/g, ' ');
}

export const ALL_CATEGORIES = ['All', ...JOB_CATEGORY_GROUPS.flatMap((g) => g.categories)];
