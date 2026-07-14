'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { AUTH_BRAND, PARTNER_ACTIVATE } from '@/lib/authMessaging';

const INTENTS = [
  {
    id: 'shop',
    icon: '🏪',
    title: 'เปิดร้าน / ขายอาหาร',
    desc: 'หลังบ้านร้าน · รับออเดอร์',
    href: '/m/merchant/shops',
  },
  {
    id: 'delivery',
    icon: '🛵',
    title: PARTNER_ACTIVATE.delivery,
    desc: PARTNER_ACTIVATE.deliveryDesc,
    href: '/m/rider/signup',
  },
  {
    id: 'sell',
    icon: '✨',
    title: PARTNER_ACTIVATE.sell,
    desc: PARTNER_ACTIVATE.sellDesc,
    href: '/m/sell',
  },
  {
    id: 'browse',
    icon: '🛒',
    title: 'ซื้อของ / สั่งอาหาร',
    desc: 'เริ่มช้อปบน Marketplace',
    href: '/m/home',
  },
] as const;

const STORAGE_KEY = 'aqond_onboarding_intent_v1';

export default function OnboardingIntentPage() {
  const { auth } = useAuth();
  const router = useRouter();

  const choose = (href: string, id: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
    router.replace(href);
  };

  if (!auth) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <p className="tt-hint">เข้าสู่ระบบก่อนเลือกบทบาท</p>
        <Link href="/m/login?next=/m/onboarding/intent" className="tt-btn-primary" style={{ display: 'inline-block', marginTop: 12 }}>
          เข้าสู่ระบบ
        </Link>
      </div>
    );
  }

  return (
    <>
      <header className="tt-header">
        <div className="tt-header-row">
          <button type="button" className="tt-back" onClick={() => router.replace('/m/account')}>‹</button>
          <span style={{ flex: 1, fontWeight: 700 }}>เริ่มใช้งาน</span>
        </div>
      </header>
      <div className="tt-hub-section" style={{ paddingTop: 8 }}>
        <h1 className="tt-hub-section-title">ยินดีต้อนรับ {AUTH_BRAND.name}</h1>
        <p className="tt-hub-section-sub">
          {AUTH_BRAND.identityLine} — เลือกสิ่งที่อยากทำก่อน (เปลี่ยนได้ทีหลังที่หน้า ฉัน)
        </p>
        <div className="tt-hub-grid">
          {INTENTS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="tt-hub-card tt-hub-card-btn"
              onClick={() => choose(item.href, item.id)}
            >
              <span className="tt-hub-icon" aria-hidden>{item.icon}</span>
              <strong className="tt-hub-card-title">{item.title}</strong>
              <p className="tt-hub-card-detail">{item.desc}</p>
              <span className="tt-hub-cta">ไปต่อ →</span>
            </button>
          ))}
        </div>
        <p className="tt-hint" style={{ textAlign: 'center', marginTop: 16 }}>
          <button type="button" className="tt-link-accent" style={{ background: 'none', border: 'none' }} onClick={() => router.replace('/m/account')}>
            ข้าม — ไปหน้าฉัน
          </button>
        </p>
      </div>
    </>
  );
}

export function shouldShowOnboardingIntent(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return !localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
}
