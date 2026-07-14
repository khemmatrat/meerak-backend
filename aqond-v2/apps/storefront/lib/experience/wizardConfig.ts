/** Sprint 30c — Smart Entry Wizard config */

export type WizardInterest = {
  id: string;
  label: string;
  emoji: string;
};

export const REFERRAL_SOURCES = [
  { id: 'google', label: 'Google' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'friend', label: 'เพื่อนแนะนำ' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'ads', label: 'โฆษณา' },
  { id: 'other', label: 'อื่นๆ' },
] as const;

export const WIZARD_INTERESTS: WizardInterest[] = [
  { id: 'store', label: 'เปิดร้าน / ขายของ', emoji: '🏪' },
  { id: 'food_merchant', label: 'ร้านอาหาร', emoji: '🍽️' },
  { id: 'rider', label: 'เป็นคนขับ / Rider', emoji: '🛵' },
  { id: 'marketplace', label: 'ซื้อของออนไลน์', emoji: '🛒' },
  { id: 'food_order', label: 'สั่งอาหาร', emoji: '🍜' },
  { id: 'talent', label: 'รับจ้างทักษะ', emoji: '⭐' },
  { id: 'hire', label: 'จ้างงาน / บริการ', emoji: '💼' },
  { id: 'services', label: 'บริการใกล้ตัว', emoji: '🔧' },
  { id: 'travel', label: 'เที่ยว / นัดเจอ', emoji: '✈️' },
  { id: 'courses', label: 'คอร์สเรียน', emoji: '📚' },
  { id: 'videos', label: 'ดูวิดีโอ', emoji: '🎬' },
  { id: 'feeds', label: 'ฟีด / คอมมูนิตี้', emoji: '📱' },
  { id: 'ai_ads', label: 'โฆษณา AI', emoji: '🤖' },
  { id: 'product_images', label: 'สร้างภาพสินค้า', emoji: '🖼️' },
  { id: 'resume', label: 'สร้างเรซูเม่', emoji: '📄' },
  { id: 'other', label: 'อื่นๆ', emoji: '✨' },
];

export const COUNTRY_OPTIONS = [
  { id: 'TH', label: 'ไทย' },
  { id: 'SG', label: 'สิงคโปร์' },
  { id: 'MY', label: 'มาเลเซีย' },
  { id: 'OTHER', label: 'อื่นๆ' },
];

export const WIZARD_STEPS = ['referral', 'profile', 'interests'] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];
