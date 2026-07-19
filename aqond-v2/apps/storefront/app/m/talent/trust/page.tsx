import { TalentPlaceholderPage } from '@/components/talent/TalentPlaceholderPage';

export default function TalentTrustPage() {
  return (
    <TalentPlaceholderPage
      title="Trust"
      module="TOS-2"
      icon="🛡️"
      description="ความน่าเชื่อถือ — KYC, คะแนนรีวิว, เกรด และทักษะที่รับรอง"
      deepLinks={[
        { href: '/m/services/booking/talents', label: 'Talent Profiles', note: 'โปรไฟล์สาธารณะ' },
      ]}
    />
  );
}
