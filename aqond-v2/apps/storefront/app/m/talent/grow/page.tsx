import { TalentPlaceholderPage } from '@/components/talent/TalentPlaceholderPage';

export default function TalentGrowPage() {
  return (
    <TalentPlaceholderPage
      title="Grow"
      module="TOS-2"
      icon="🌱"
      description="พัฒนาฝีมือ — คลิปวิดีโอ โปรไฟล์ และเส้นทาง routing matrix"
      deepLinks={[
        { href: '/m/services/video', label: 'Video Hiring Feed', note: 'คลิปผลงาน' },
        { href: '/m/services/create/routing', label: 'Work Routing Matrix', note: 'แนะนำช่องทางงาน' },
        { href: '/m/services/booking/talents', label: 'Browse Talents', note: 'ดูโปรไฟล์ช่าง' },
      ]}
    />
  );
}
