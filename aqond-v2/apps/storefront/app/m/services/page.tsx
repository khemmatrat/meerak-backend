import Link from 'next/link';
import { TALENT_HUB_TILE } from '@/lib/talent/talentDiscoverability';

const SURFACES = [
  {
    href: '/m/services/match',
    icon: '⚡',
    title: 'Match Job',
    description: 'งานจ้างด่วน / ภาคสนาม — จับคู่ตามพื้นที่และความพร้อม',
    sprint: '28b',
  },
  {
    href: '/m/services/board',
    icon: '💼',
    title: 'Job Board',
    description: 'งานโปรเจกต์ — ขอบเขต งบ และระยะเวลาชัดเจน',
    sprint: '28d',
  },
  {
    href: '/m/services/booking',
    icon: '📅',
    title: 'Booking',
    description: 'จองคิวช่าง / ผู้เชี่ยวชาญ — เวลาและสถานที่ชัดเจน',
    sprint: '28f',
  },
  {
    href: '/m/services/video',
    icon: '🎬',
    title: 'Video Hiring Feed',
    description: 'ดูคลิปผลงานก่อนตัดสินใจจ้าง — โชว์ฝีมือด้วยวิดีโอ',
    sprint: '28g',
  },
  {
    href: '/m/services/create',
    icon: '✏️',
    title: 'สร้างงาน / จ้างงาน',
    description: 'เลือกช่องทาง Match · Board · Booking · Video + Routing Matrix',
    sprint: '28h',
  },
] as const;

export default function ServicesHubPage() {
  return (
    <div className="tt-services-hub">
      <p className="tt-services-hub-intro">
        ศูนย์รวมงานบริการ AQOND — Theme V2 (AXS) · Business logic เดิมจาก mobile · presentation
        migration เท่านั้น
      </p>
      <Link href={TALENT_HUB_TILE.href} className="tt-services-hub-card tt-services-hub-card--talent">
        <div className="tt-services-hub-card-head">
          <span className="tt-services-hub-card-icon" aria-hidden>
            {TALENT_HUB_TILE.icon}
          </span>
          <h2>{TALENT_HUB_TILE.title}</h2>
        </div>
        <p>{TALENT_HUB_TILE.description}</p>
        <span className="tt-services-hub-badge tt-services-hub-badge--talent">{TALENT_HUB_TILE.cta}</span>
      </Link>
      <div className="tt-services-hub-grid">
        {SURFACES.map((s) => (
          <Link key={s.href} href={s.href} className="tt-services-hub-card">
            <div className="tt-services-hub-card-head">
              <span className="tt-services-hub-card-icon" aria-hidden>
                {s.icon}
              </span>
              <h2>{s.title}</h2>
            </div>
            <p>{s.description}</p>
            <span className="tt-services-hub-badge">Sprint {s.sprint}</span>
          </Link>
        ))}
      </div>
      <p className="tt-hint" style={{ marginTop: 16, textAlign: 'center' }}>
        Sprint 28 เสร็จสมบูรณ์ · Sprint 29 ใช้{' '}
        <Link href="/design-system/registry" className="tt-link-accent">
          @aqond/components
        </Link>{' '}
        ใน Services
      </p>
    </div>
  );
}
