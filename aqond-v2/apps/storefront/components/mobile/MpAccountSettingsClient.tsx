'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { IconLuxChat } from '@/components/mobile/TtLuxuryIcons';

type Row =
  | { type: 'link'; label: string; href: string; value?: string }
  | { type: 'static'; label: string; value: string };

type Section = {
  title: string;
  rows: Row[];
};

const SECTIONS: Section[] = [
  {
    title: 'บัญชีของฉัน',
    rows: [
      { type: 'link', label: 'บัญชีและความปลอดภัยของบัญชี', href: '/m/account/settings/security' },
      { type: 'link', label: 'ที่อยู่ของฉัน', href: '/m/account/addresses' },
      { type: 'link', label: 'ข้อมูลบัญชีธนาคาร/บัตร', href: '/m/account/settings/payment' },
    ],
  },
  {
    title: 'ตั้งค่า',
    rows: [
      { type: 'link', label: 'ตั้งค่าการแชท', href: '/m/chats' },
      { type: 'link', label: 'ตั้งค่าคำสั่งซื้อ', href: '/m/orders' },
      { type: 'link', label: 'ตั้งค่าการแจ้งเตือน', href: '/m/account/notifications' },
      { type: 'link', label: 'การตั้งค่าความเป็นส่วนตัว', href: '/settings' },
      { type: 'link', label: 'ผู้ใช้ที่ถูกระงับ', href: '/m/account/settings/blocked' },
      { type: 'static', label: 'ภาษา / Language', value: 'ไทย' },
    ],
  },
  {
    title: 'ช่วยเหลือ',
    rows: [
      { type: 'link', label: 'ศูนย์ช่วยเหลือ', href: '/m/account/settings/help' },
      { type: 'link', label: 'กฎระเบียบในการใช้', href: '/m/account/settings/terms' },
      { type: 'link', label: 'นโยบายของ AQOND', href: '/m/account/settings/privacy' },
      { type: 'link', label: 'ชอบใช้งาน AQOND? ให้คะแนนแอปเลย!', href: '/m/account/settings/rate' },
      { type: 'link', label: 'เกี่ยวกับ', href: '/m/account/settings/about' },
      { type: 'link', label: 'คำขอลบบัญชีผู้ใช้', href: '/m/account/settings/delete-account' },
    ],
  },
];

function SettingsRow({ row, hrefWithEmbed }: { row: Row; hrefWithEmbed: (path: string) => string }) {
  if (row.type === 'static') {
    return (
      <div className="tt-mp-settings-row tt-mp-settings-row-static">
        <span>{row.label}</span>
        <span className="tt-mp-settings-value">{row.value}</span>
      </div>
    );
  }
  return (
    <Link href={hrefWithEmbed(row.href)} className="tt-mp-settings-row">
      <span>{row.label}</span>
      <span className="tt-mp-settings-chevron" aria-hidden>
        ›
      </span>
    </Link>
  );
}

export function MpAccountSettingsClient() {
  const router = useRouter();
  const params = useSearchParams();
  const embed = params.get('embed') === '1';
  const hrefWithEmbed = (path: string) => (embed ? `${path}${path.includes('?') ? '&' : '?'}embed=1` : path);
  const chatHref = hrefWithEmbed('/m/chats');

  return (
    <div className="tt-mp-settings">
      <header className="tt-mp-settings-header">
        <button type="button" className="tt-mp-settings-back" onClick={() => router.back()} aria-label="กลับ">
          ‹
        </button>
        <h1>ตั้งค่าบัญชี</h1>
        <Link href={chatHref} className="tt-mp-settings-chat" aria-label="แชท">
          <IconLuxChat size={22} />
        </Link>
      </header>

      <div className="tt-mp-settings-body">
        {SECTIONS.map((section) => (
          <section key={section.title} className="tt-mp-settings-section">
            <h2>{section.title}</h2>
            <div className="tt-mp-settings-card">
              {section.rows.map((row) => (
                <SettingsRow key={row.label} row={row} hrefWithEmbed={hrefWithEmbed} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
