'use client';

import Link from 'next/link';

const LINKS = [
  {
    href: '/m/services/booking/talents',
    icon: '👷',
    title: 'ค้นหา Talent',
    description: 'ดูโปรไฟล์ช่างและผู้เชี่ยวชาญ — จองคิวตามเวลาว่าง',
  },
  {
    href: '/m/services/booking/mine',
    icon: '📋',
    title: 'การจองของฉัน',
    description: 'คำขอจองที่ส่ง / คิวที่รอรับงาน + ชำระมัดจำ',
  },
] as const;

export function BookingHubView() {
  return (
    <div className="tt-services-hub">
      <p className="tt-services-hub-intro">
        จองคิวช่าง / ผู้เชี่ยวชาญ — เวลาและสถานที่ชัดเจน (AXS Theme V2)
      </p>
      <div className="tt-services-hub-grid">
        {LINKS.map((item) => (
          <Link key={item.href} href={item.href} className="tt-services-hub-card">
            <div className="tt-services-hub-card-head">
              <span className="tt-services-hub-card-icon" aria-hidden>
                {item.icon}
              </span>
              <h2>{item.title}</h2>
            </div>
            <p>{item.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
