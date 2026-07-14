'use client';



import Link from 'next/link';

import { usePathname, useRouter } from 'next/navigation';

import { EmptyState } from '@aqond/ui';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useAuth } from '@/lib/auth';

import {

  countUnseenOrders,

  isAlertEnabled,

  playShopAlert,

  playSlaUrgentAlert,

} from '@/lib/merchantAlerts';

import { merchantPollIntervalMs, notifyNewMerchantOrders, notifySlaUrgent } from '@/lib/merchantPush';

import { listenFcmForeground, syncFcmIfPermitted } from '@/lib/fcmWeb';

import { fetchMerchantDashboard, fetchStaffAccess, type StaffPermissions } from '@/lib/merchant';

import { MerchantShopPicker, type ShopOption } from './MerchantShopPicker';
import { MerchantAdJobProvider } from './MerchantAdJobProvider';
import { MerchantAdJobBanner } from './MerchantAdJobBanner';



export const MERCHANT_KEY = 'aqond_merchant_id';



export const DEMO_MERCHANTS = [

  { id: 'demo-merchant', name: 'ร้านค้า Demo', food: false },

  { id: 'food-thai-1', name: 'ครัวบ้านสวน', food: true },

  { id: 'food-jp-1', name: 'ซูชิโฮมุระ', food: true },

  { id: 'food-cafe-1', name: 'Matcha House', food: true },

  { id: 'm-fashion-1', name: 'Fashion Corner', food: false },

];



type MerchantCtx = {

  merchantId: string;

  setMerchantId: (id: string) => void;

  merchantName: string;

  isFoodMerchant: boolean;

  refreshShops: () => void;

  unseenByShop: Record<string, number>;

  slaBreachedByShop: Record<string, number>;

  permissions: StaffPermissions | null;

};



const MerchantContext = createContext<MerchantCtx | null>(null);



export function useMerchant() {

  const ctx = useContext(MerchantContext);

  if (!ctx) throw new Error('useMerchant outside MerchantShell');

  return ctx;

}



const IS_LOCAL_DEV =
  process.env.NEXT_PUBLIC_AQOND_LOCAL_DEV === '1' ||
  process.env.NEXT_PUBLIC_AQOND_ALLOW_LOCAL_ORDERS === '1';

function isLocalDevClient() {
  if (IS_LOCAL_DEV) return true;
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

function mergeDemoShops(apiList: ShopOption[]): ShopOption[] {
  if (!isLocalDevClient()) return apiList;
  const byId = new Map<string, ShopOption>();
  for (const d of DEMO_MERCHANTS) {
    byId.set(d.id, { ...d, badge: 0 });
  }
  for (const s of apiList) {
    const prev = byId.get(s.id);
    byId.set(s.id, { ...s, badge: s.badge ?? prev?.badge ?? 0 });
  }
  return Array.from(byId.values());
}



function loadMerchantId() {

  if (typeof window === 'undefined') return '';

  const saved = localStorage.getItem(MERCHANT_KEY);

  if (saved) return saved;

  return IS_LOCAL_DEV ? DEMO_MERCHANTS[0].id : '';

}



const PRIMARY_TABS = [

  { href: '/m/merchant/orders', label: 'ออเดอร์', icon: '🔔' },

  { href: '/m/merchant/menu', label: 'สินค้า', icon: '📦' },

  { href: '/m/merchant/ad-studio', label: 'วิดีโอ AI', icon: '🎬' },

  { href: '/m/merchant/wallet', label: 'กระเป๋า', icon: '💰' },

  { href: '/m/merchant/sales', label: 'ยอดขาย', icon: '📊' },

];



const MORE_TABS = [

  { href: '/m/merchant/assistant', label: 'ผู้ช่วย AI', icon: '🤖' },

  { href: '/m/merchant/promos', label: 'โปรโมชัน', icon: '🏷️' },

  { href: '/m/merchant/returns', label: 'คืนสินค้า', icon: '↩️' },

  { href: '/m/merchant/status', label: 'สถานะร้าน', icon: '🕐' },

  { href: '/m/merchant/ads', label: 'โฆษณา', icon: '📣' },

  { href: '/m/merchant/tier', label: 'ระดับร้าน', icon: '🏅' },

  { href: '/m/merchant/help', label: 'ช่วยเหลือ', icon: '🛡️' },

];



export function MerchantShell({ children }: { children: ReactNode }) {

  const pathname = usePathname();
  const router = useRouter();

  const { auth } = useAuth();

  const ownerId = auth?.userId || 'guest';

  const [merchantId, setMerchantIdState] = useState(loadMerchantId);

  const [shops, setShops] = useState<ShopOption[]>(() =>
    IS_LOCAL_DEV ? DEMO_MERCHANTS.map((m) => ({ ...m, badge: 0 })) : [],
  );

  const [unseenByShop, setUnseenByShop] = useState<Record<string, number>>({});

  const [slaBreachedByShop, setSlaBreachedByShop] = useState<Record<string, number>>({});

  const [permissions, setPermissions] = useState<StaffPermissions | null>(null);

  const [moreOpen, setMoreOpen] = useState(false);

  const prevUnseenRef = useRef<Record<string, number>>({});

  const prevSlaRef = useRef<Record<string, number>>({});



  const isFocusStudio = pathname.startsWith('/m/merchant/ad-studio');



  const setMerchantId = (id: string) => {

    setMerchantIdState(id);

    localStorage.setItem(MERCHANT_KEY, id);

  };



  useEffect(() => {

    if (!auth?.userId) return;

    void syncFcmIfPermitted(auth);

    let unsub: (() => void) | null | undefined;

    void listenFcmForeground(({ title, body }) => {

      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {

        new Notification(title, { body });

      }

    }).then((fn) => {

      unsub = fn;

    });

    return () => {

      unsub?.();

    };

  }, [auth]);



  useEffect(() => {

    localStorage.setItem(MERCHANT_KEY, merchantId);

  }, [merchantId]);



  useEffect(() => {

    fetchStaffAccess(ownerId, merchantId, ownerId)

      .then((d) => setPermissions(d.permissions))

      .catch(() => setPermissions(null));

  }, [ownerId, merchantId]);



  const refreshShops = useCallback(() => {

    fetchMerchantDashboard(ownerId)

      .then((d) => {

        const pendingIds = d.pending_order_ids || {};

        const slaCounts = (d.sla_breached_counts || {}) as Record<string, number>;

        const unseen: Record<string, number> = {};

        const list: ShopOption[] = mergeDemoShops(
          (d.accessible_shops || []).map((s: any) => {
            const ids = pendingIds[s.id] || [];
            const count = countUnseenOrders(s.id, ids);
            const sla = slaCounts[s.id] || 0;
            unseen[s.id] = count;
            return {
              id: s.id,
              name: s.name,
              food: s.type === 'food' || String(s.id).startsWith('food-'),
              badge: count + sla,
            };
          }),
        );

        if (list.length) {
          setShops(list);

          const owned = list.filter(
            (s) =>
              !String(s.id).startsWith('demo-') &&
              !['food-thai-1', 'food-jp-1', 'food-cafe-1', 'm-fashion-1', 'demo-merchant'].includes(s.id),
          );

          const pick = owned.length ? owned[0] : isLocalDevClient() ? list[0] : null;

          if (pick && pick.id !== merchantId && !isLocalDevClient()) {
            setMerchantId(pick.id);
          } else if (!pick && !isLocalDevClient()) {
            setMerchantId('');
          }
        } else if (isLocalDevClient()) {
          setShops(DEMO_MERCHANTS.map((m) => ({ ...m, badge: unseen[m.id] || 0 })));
        }

        setUnseenByShop(unseen);

        setSlaBreachedByShop(slaCounts);



        const prev = prevUnseenRef.current;

        const newAlerts: string[] = [];

        for (const [sid, n] of Object.entries(unseen)) {

          if (n > (prev[sid] || 0) && isAlertEnabled(sid)) {

            newAlerts.push(sid);

          }

        }

        for (const sid of newAlerts) {

          playShopAlert(sid);

          const shopName = list.find((s) => s.id === sid)?.name || sid;

          const delta = (unseen[sid] || 0) - (prev[sid] || 0);

          if (delta > 0) notifyNewMerchantOrders(shopName, delta);

        }

        prevUnseenRef.current = unseen;



        const prevSla = prevSlaRef.current;

        let slaAlert = false;

        for (const [sid, n] of Object.entries(slaCounts)) {

          if (n > (prevSla[sid] || 0) && isAlertEnabled(sid)) {

            slaAlert = true;

            break;

          }

        }

        if (slaAlert) {

          playSlaUrgentAlert();

          notifySlaUrgent(list.find((s) => s.id === merchantId)?.name || merchantId);

        }

        prevSlaRef.current = slaCounts;

      })

      .catch(() => {
        if (isLocalDevClient()) {
          setShops(DEMO_MERCHANTS.map((m) => ({ ...m, badge: 0 })));
        }
      });

  }, [ownerId, merchantId]);



  useEffect(() => {

    refreshShops();

    const timer = window.setInterval(refreshShops, merchantPollIntervalMs());

    return () => window.clearInterval(timer);

  }, [refreshShops]);



  const meta = useMemo(

    () => shops.find((m) => m.id === merchantId) || shops[0] || (IS_LOCAL_DEV ? DEMO_MERCHANTS[0] : undefined),

    [shops, merchantId],

  );



  const orderBadge = (unseenByShop[merchantId] || 0) + (slaBreachedByShop[merchantId] || 0);



  if (!auth?.userId && !IS_LOCAL_DEV) {

    return (

      <div className="tt-page tt-merchant-gate">

        <header className="tt-merchant-header-bar">

          <Link href="/m/account" className="tt-back" aria-label="กลับ">‹</Link>

          <span className="tt-merchant-header-title">หลังบ้านร้าน</span>

        </header>

        <EmptyState
          icon="🏪"
          title="เข้าสู่ระบบก่อนจัดการร้าน"
          description="กรุณาเข้าสู่ระบบเพื่อจัดการร้านค้าของคุณ"
          actionLabel="เข้าสู่ระบบ"
          onAction={() => router.push('/m/account')}
        />

      </div>

    );

  }



  if (!merchantId && shops.length === 0) {

    return (

      <div className="tt-page tt-merchant-gate">

        <header className="tt-merchant-header-bar">

          <Link href="/m/account" className="tt-back" aria-label="กลับ">‹</Link>

          <span className="tt-merchant-header-title">หลังบ้านร้าน</span>

        </header>

        <EmptyState
          icon="➕"
          title="ยังไม่มีร้านที่อนุมัติ"
          description="สมัครเปิดร้านได้ที่หน้าจัดการร้าน"
          actionLabel="เปิดร้าน"
          onAction={() => router.push('/m/merchant/shops')}
        />

      </div>

    );

  }



  return (

    <MerchantContext.Provider

      value={{

        merchantId,

        setMerchantId,

        merchantName: meta?.name || merchantId,

        isFoodMerchant: meta?.food ?? false,

        refreshShops,

        unseenByShop,

        slaBreachedByShop,

        permissions,

      }}

    >

    <MerchantAdJobProvider>

      <header className="tt-merchant-header-bar">

        <Link href="/m/account" className="tt-back" aria-label="กลับ">‹</Link>

        <div className="tt-merchant-header-center">

          <span className="tt-merchant-header-kicker">หลังบ้านร้าน</span>

          <strong className="tt-merchant-header-shop">{meta?.name || 'ร้านของฉัน'}</strong>

        </div>

        <div className="tt-merchant-header-actions">

          <Link href="/m/merchant/qr" className="tt-merchant-header-icon" title="QR ร้าน" aria-label="QR">📱</Link>

          <Link href="/m/merchant/shops" className="tt-merchant-header-icon" title="ตั้งค่าร้าน" aria-label="ตั้งค่า">⚙️</Link>

        </div>

      </header>



      <section className="tt-merchant-shop-section">

        <span className="tt-merchant-shop-section-label">ร้านที่กำลังจัดการ</span>

        <MerchantShopPicker shops={shops} value={merchantId} onChange={setMerchantId} />

      </section>



      {isFocusStudio ? (

        <nav className="tt-merchant-nav-compact" aria-label="เมนูด่วน">

          <Link href="/m/merchant/orders" className="tt-merchant-nav-compact-link">

            🔔 ออเดอร์

            {orderBadge > 0 && <span className="tt-merchant-nav-badge">{orderBadge}</span>}

          </Link>

          <Link href="/m/merchant/menu" className="tt-merchant-nav-compact-link">📦 สินค้า</Link>

          <span className="tt-merchant-nav-compact-link is-active">🎬 วิดีโอ AI</span>

          <Link href="/m/merchant/wallet" className="tt-merchant-nav-compact-link">💰 กระเป๋า</Link>

        </nav>

      ) : (

        <>

          <nav className="tt-merchant-nav-primary" aria-label="เมนูหลัก">

            {PRIMARY_TABS.map((t) => {

              const active = pathname === t.href || pathname.startsWith(`${t.href}/`);

              const badge = t.href === '/m/merchant/orders' ? orderBadge : 0;

              return (

                <Link key={t.href} href={t.href} className={`tt-merchant-nav-pill${active ? ' active' : ''}`}>

                  <span aria-hidden>{t.icon}</span>

                  {t.label}

                  {badge > 0 && <em className="tt-merchant-nav-pill-badge">{badge > 99 ? '99+' : badge}</em>}

                </Link>

              );

            })}

            <button type="button" className="tt-merchant-nav-pill tt-merchant-nav-more" onClick={() => setMoreOpen(true)}>

              <span>⋯</span>

              อื่นๆ

            </button>

          </nav>

        </>

      )}



      {children}

      <MerchantAdJobBanner />

      {moreOpen && (

        <div className="tt-merchant-more-backdrop" onClick={() => setMoreOpen(false)} role="presentation">

          <div className="tt-merchant-more-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="เมนูเพิ่มเติม">

            <h3>เมนูเพิ่มเติม</h3>

            <div className="tt-merchant-more-grid">

              {MORE_TABS.map((t) => (

                <Link key={t.href} href={t.href} className="tt-merchant-more-item" onClick={() => setMoreOpen(false)}>

                  <span>{t.icon}</span>

                  {t.label}

                </Link>

              ))}

            </div>

            <button type="button" className="tt-btn-ghost" onClick={() => setMoreOpen(false)}>

              ปิด

            </button>

          </div>

        </div>

      )}

    </MerchantAdJobProvider>

    </MerchantContext.Provider>

  );

}

