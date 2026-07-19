import { TalentPlaceholderPage } from '@/components/talent/TalentPlaceholderPage';

export default function TalentWorkPage() {
  return (
    <TalentPlaceholderPage
      title="Work"
      module="TOS-2"
      icon="💼"
      description="งานที่กำลังทำ — Match, Board, Booking และสถานะการสมัคร"
      deepLinks={[
        { href: '/m/services/match', label: 'Match Job', note: 'รายการงาน Match' },
        { href: '/m/services/match/mine', label: 'งาน Match ของฉัน', note: 'งานที่รับ/โพสต์' },
        { href: '/m/services/board', label: 'Job Board', note: 'งานโปรเจกต์' },
        { href: '/m/services/booking/mine', label: 'My Bookings', note: 'การจองเข้า/ออก' },
        { href: '/m/services/create', label: 'สร้างงาน / จ้างงาน', note: 'Create Hub' },
      ]}
    />
  );
}
