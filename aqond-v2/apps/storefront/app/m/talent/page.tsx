import { TalentPlaceholderPage } from '@/components/talent/TalentPlaceholderPage';

export default function TalentTodayPage() {
  return (
    <TalentPlaceholderPage
      title="Today"
      module="TOS-2"
      icon="☀️"
      description="สรุปงานที่ต้องทำวันนี้ — Match, Board, Booking, แจ้งเตือน และปฏิทิน"
      deepLinks={[
        { href: '/m/services', label: 'Services Hub', note: 'ศูนย์รวมงานบริการเดิม' },
        { href: '/m/services/match', label: 'Match Job', note: 'งานจ้างด่วน' },
        { href: '/m/services/board', label: 'Job Board', note: 'งานโปรเจกต์' },
        { href: '/m/services/booking/mine', label: 'My Bookings', note: 'การจองของฉัน' },
      ]}
    />
  );
}
