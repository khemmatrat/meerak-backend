'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useCartOwner } from '@/lib/cartOwner';
import { IconLuxCart, IconLuxShield, IconLuxToShip } from '@/components/mobile/TtLuxuryIcons';
import { TtActiveOrderCard } from '@/components/mobile/TtActiveOrderCard';

export default function ActiveOrdersPage() {
  const { auth } = useAuth();
  const { ownerId } = useCartOwner();
  const owner = ownerId || auth?.userId || 'guest';
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/orders?buyer_id=${encodeURIComponent(owner)}&active=1`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setOrders(d.orders || []))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, [owner]);

  const trackHref = (o: any) =>
    o.order_type === 'food' || o.carrier_id === 'aqond-rider'
      ? `/m/food/track/${o.order_id || o.id}`
      : `/m/orders/${o.order_id || o.id}/track`;

  return (
    <div className="tt-active-orders-page">
      <header className="tt-mp-orders-header">
        <Link href="/m/orders" className="tt-mp-orders-back" aria-label="กลับ">‹</Link>
        <h1>ติดตามคำสั่งซื้อ ({orders.length})</h1>
        <Link href="/m/cart" className="tt-mp-orders-cart" aria-label="รถเข็น">
          <IconLuxCart size={22} />
        </Link>
      </header>

      <div className="tt-od-policy-banner tt-active-policy">
        <span className="tt-od-policy-icon" aria-hidden>
          <IconLuxShield size={20} />
        </span>
        <div>
          <strong>เช็กก่อนจ่าย คืนได้ทันที</strong>
          <p className="tt-hint">ติดตามสถานะจัดส่งแบบเรียลไทม์</p>
        </div>
      </div>

      {loading && <p className="tt-loading">กำลังโหลด…</p>}

      {!loading && orders.length === 0 && (
        <div className="tt-empty-cart">
          <div className="tt-empty-icon tt-empty-icon-lux">
            <IconLuxToShip size={56} />
          </div>
          <h1 className="tt-empty-title">ไม่มีออเดอร์ที่กำลังดำเนินการ</h1>
          <p className="tt-empty-sub">สั่งซื้อแล้วติดตามได้ที่นี่</p>
          <Link href="/m/home" className="tt-btn-primary">ไปช้อปปิ้ง</Link>
        </div>
      )}

      <div className="tt-active-order-list">
        {orders.map((o) => (
          <TtActiveOrderCard key={o.order_id || o.id} order={o} trackHref={trackHref(o)} />
        ))}
      </div>
    </div>
  );
}
