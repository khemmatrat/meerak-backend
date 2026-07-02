'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { readCartScope } from '@/lib/cartOwner';
import { useShopCart } from '@/lib/useShopCart';
import {
  IconHome,
  IconSearch,
  IconTabCart,
  IconTabFeed,
  IconTabUser,
} from '@/components/mobile/TtTrackIcons';

const tabs = [
  { href: '/m/home', label: 'หน้าแรก', Icon: IconHome },
  { href: '/m/feed', label: 'Feed', Icon: IconTabFeed },
  { href: '/m/search', label: 'ค้นหา', Icon: IconSearch },
  { href: '/m/cart', label: 'รถเข็น', Icon: IconTabCart, cart: true },
  { href: '/m/account', label: 'ฉัน', Icon: IconTabUser },
] as const;

function resolveCartHref(path: string): string {
  if (path.startsWith('/m/food')) return '/m/food/cart';
  if (readCartScope() === 'food') return '/m/food/cart';
  return '/m/cart';
}

function isTabActive(path: string, href: string, cartHref: string): boolean {
  if (path === href || path.startsWith(`${href}/`)) return true;
  if (href === '/m/cart') {
    return path === cartHref || path.startsWith('/m/checkout') || path.startsWith('/m/food/cart') || path.startsWith('/m/food/checkout');
  }
  if (
    href === '/m/account' &&
    (path.startsWith('/m/orders') ||
      path.startsWith('/m/account') ||
      path.startsWith('/m/sell') ||
      path.startsWith('/m/studio') ||
      path.startsWith('/m/creator') ||
      path.startsWith('/m/food') ||
      path.startsWith('/m/login') ||
      path.startsWith('/m/register'))
  ) {
    return true;
  }
  return false;
}

export function MobileTabNav() {
  const path = usePathname();
  const params = useSearchParams();
  const [inIframe, setInIframe] = useState(false);
  const [cartHref, setCartHref] = useState('/m/cart');
  const { itemQtyTotal: shopCartCount } = useShopCart();

  useEffect(() => {
    setInIframe(typeof window !== 'undefined' && window.self !== window.top);
    setCartHref(resolveCartHref(path));
  }, [path]);

  const embed = params.get('embed') === '1' || inIframe;

  if (path.startsWith('/m/rider') || path.startsWith('/m/services') || path.startsWith('/m/live') || path.startsWith('/m/product') || path.startsWith('/m/shop') || path.startsWith('/m/checkout') || path.startsWith('/m/chat')) return null;

  const hrefFor = (base: string, isCart?: boolean) => {
    const target = isCart ? cartHref : base;
    return embed ? `${target}?embed=1` : target;
  };

  return (
    <nav className={`tt-tabs${embed ? ' tt-tabs-embed' : ''}`} aria-label="Mobile navigation" data-ftx-tour="tabs">
      {tabs.map(({ href, label, Icon, cart }) => {
        const active = isTabActive(path, href, cartHref);
        return (
          <Link
            key={href}
            href={hrefFor(href, cart)}
            className={active ? 'active' : ''}
            aria-current={active ? 'page' : undefined}
          >
            <span className="tt-tab-icon" aria-hidden>
              <Icon size={22} />
              {cart && shopCartCount > 0 && cartHref === '/m/cart' ? (
                <em className="tt-mp-tool-badge tt-tab-cart-badge" data-testid="tab-cart-badge">
                  {shopCartCount > 99 ? '99+' : shopCartCount}
                </em>
              ) : null}
            </span>
            <span className="tt-tab-label">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
