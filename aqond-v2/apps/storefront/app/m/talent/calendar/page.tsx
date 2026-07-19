import { TalentPlaceholderPage } from '@/components/talent/TalentPlaceholderPage';

export default function TalentCalendarPage() {
  return (
    <TalentPlaceholderPage
      title="Calendar"
      module="TOS-2"
      icon="📅"
      description="ปฏิทินงาน การจอง และช่วงเวลาว่าง — จนกว่า v2 calendar RFC"
      deepLinks={[
        { href: '/m/services/booking/mine', label: 'My Bookings', note: 'การจองที่มีกำหนดเวลา' },
        { href: '/m/services/match/mine', label: 'Match Jobs', note: 'งานที่มีนัดหมาย' },
      ]}
    />
  );
}
