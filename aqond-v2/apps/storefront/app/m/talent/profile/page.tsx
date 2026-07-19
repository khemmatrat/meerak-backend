import { TalentPlaceholderPage } from '@/components/talent/TalentPlaceholderPage';

export default function TalentProfilePage() {
  return (
    <TalentPlaceholderPage
      title="Profile"
      module="TOS-2"
      icon="👤"
      description="โปรไฟล์ Talent — portfolio, clips, skills และการตั้งค่า"
      deepLinks={[
        { href: '/m/account', label: 'บัญชี AQOND', note: 'การตั้งค่าบัญชี' },
        { href: '/m/services/booking/talents', label: 'Browse Talents', note: 'ตัวอย่างโปรไฟล์สาธารณะ' },
      ]}
    />
  );
}
