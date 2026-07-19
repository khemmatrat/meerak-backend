import { TalentPlaceholderPage } from '@/components/talent/TalentPlaceholderPage';

export default function TalentMoneyPage() {
  return (
    <TalentPlaceholderPage
      title="Money"
      module="TOS-2"
      icon="💰"
      description="รายได้ กระเป๋าเงิน และสถานะ escrow — อ่านจากระบบเดิมเท่านั้น"
      deepLinks={[
        { href: '/m/services/match/mine', label: 'Match Jobs', note: 'สถานะการชำระต่องาน' },
        { href: '/m/services/board', label: 'Job Board', note: 'Escrow โปรเจกต์' },
        { href: '/m/services/booking/mine', label: 'My Bookings', note: 'มัดจำการจอง' },
      ]}
    />
  );
}
