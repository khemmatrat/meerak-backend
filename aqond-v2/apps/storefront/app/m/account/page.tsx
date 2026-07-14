'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { SkeletonCard, StatusChip } from '@aqond/ui';
import { bffGet } from '@/lib/bff';
import { useAuth } from '@/lib/auth';
import { AUTH_BRAND, AUTH_LOGIN, HUB } from '@/lib/authMessaging';
import {
  capabilityStatusLabel,
  loadPartnerCapabilities,
  type PartnerCapability,
} from '@/lib/partnerCapabilities';
import { MpPurchasesSection } from '@/components/mobile/MpPurchasesSection';
import { MpAccountHeader } from '@/components/mobile/MpAccountHeader';
import {
  MpAccountMenu,
  MpEmailBanner,
  MpFinanceSection,
  MpPromoBanner,
  MpServiceRows,
  MpWalletHub,
} from '@/components/mobile/MpMeHubSections';
import { HubCapabilityIcon } from '@/components/mobile/TtLuxuryIcons';
import { countOrdersByTab } from '@/lib/ordersHub';

function StatusPill({ status }: { status: PartnerCapability['status'] }) {
  if (status === 'locked') return null;
  const label = capabilityStatusLabel(status);
  const tone =
    status === 'active' ? 'online' : status === 'pending' ? 'pending' : 'default';
  return <StatusChip tone={tone}>{label}</StatusChip>;
}

export default function MobileAccountPage() {
  const { auth, user, logout } = useAuth();
  const owner = auth?.userId || '';
  const [wallet, setWallet] = useState<any>(null);
  const [caps, setCaps] = useState<PartnerCapability[]>([]);
  const [capsLoading, setCapsLoading] = useState(true);
  const [orderCounts, setOrderCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!auth) {
      setWallet(null);
      return;
    }
    bffGet<any>(`/v1/wallet?user_id=${owner}`, auth)
      .then(setWallet)
      .catch(() => setWallet(null));
  }, [auth, owner]);

  useEffect(() => {
    if (!owner) {
      setOrderCounts({});
      return;
    }
    fetch(`/api/orders?buyer_id=${encodeURIComponent(owner)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setOrderCounts(countOrdersByTab(d.orders || [])))
      .catch(() => setOrderCounts({}));
  }, [owner]);

  useEffect(() => {
    setCapsLoading(true);
    loadPartnerCapabilities(auth?.userId)
      .then(setCaps)
      .finally(() => setCapsLoading(false));
  }, [auth?.userId]);

  const coins = wallet?.coins ?? 0;
  const couponCount = Array.isArray(wallet?.coupons) ? wallet.coupons.length : 0;
  const balance = wallet?.balance_micro ?? 0;
  const shopCap = caps.find((c) => c.id === 'shop');
  const shopHref = shopCap?.status === 'active' ? '/m/merchant/orders' : '/m/sell';

  return (
    <div className="tt-mp-me-page">
      <Suspense fallback={<header className="tt-mp-account-header" />}>
        <MpAccountHeader auth={auth} user={user} shopHref={shopHref} />
      </Suspense>

      {auth ? (
        <>
          <MpEmailBanner user={user} />
          <MpPurchasesSection counts={orderCounts} />
          <MpServiceRows />
          <MpPromoBanner />
          <MpWalletHub balanceMicro={balance} coins={coins} couponCount={couponCount} />
          <MpFinanceSection />
        </>
      ) : (
        <div className="tt-account-hero" style={{ paddingTop: 0 }}>
          <Link href="/m/login" className="tt-btn-primary" style={{ maxWidth: 220, margin: '12px auto', display: 'block', textAlign: 'center' }}>
            {AUTH_LOGIN.title}
          </Link>
          <p className="tt-hint" style={{ marginTop: 8, textAlign: 'center' }}>
            {AUTH_LOGIN.noAccount}{' '}
            <Link href="/m/register">{AUTH_LOGIN.register}</Link>
          </p>
        </div>
      )}

      <section className="tt-hub-section" aria-labelledby="hub-cap-title" style={{ display: auth ? undefined : 'none' }}>
        <h2 id="hub-cap-title" className="tt-hub-section-title">{HUB.sectionTitle}</h2>
        <p className="tt-hub-section-sub">{AUTH_BRAND.identityDetail}</p>

        {capsLoading ? (
          <div className="axs-marketplace-loading" aria-busy>
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : (
          <div className="tt-hub-grid">
            {caps.map((cap) => {
              const className = `tt-hub-card tt-hub-card--${cap.id}${cap.status === 'active' ? ' is-active' : ''}`;
              const inner = (
                <>
                  <div className="tt-hub-card-top">
                    <span className={`tt-hub-icon tt-hub-icon--${cap.id}`} aria-hidden>
                      <HubCapabilityIcon id={cap.id} size={28} />
                    </span>
                    <StatusPill status={cap.status} />
                  </div>
                  <strong className="tt-hub-card-title">{cap.label}</strong>
                  {cap.detail && <p className="tt-hub-card-detail">{cap.detail}</p>}
                  <span className="tt-hub-cta">{cap.cta} →</span>
                </>
              );
              if (cap.external) {
                return (
                  <a key={cap.id} href={cap.href} className={className} target="_blank" rel="noopener noreferrer">
                    {inner}
                  </a>
                );
              }
              return (
                <Link key={cap.id} href={cap.href} className={className}>
                  {inner}
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {auth && (
        <>
          <MpAccountMenu />
          <div className="tt-mp-logout-wrap">
            <button type="button" className="tt-btn-ghost" onClick={() => logout()}>
              ออกจากระบบ
            </button>
          </div>
        </>
      )}
    </div>
  );
}
