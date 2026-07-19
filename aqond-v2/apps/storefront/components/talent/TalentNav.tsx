'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TALENT_NAV, isTalentNavActive } from '@/lib/talent/talentNavConfig';

type Props = {
  variant: 'sidebar' | 'bottom';
};

export function TalentNav({ variant }: Props) {
  const pathname = usePathname();
  const className = variant === 'sidebar' ? 'tt-talent-sidebar-nav' : 'tt-talent-os-nav';

  return (
    <nav className={className} aria-label={variant === 'sidebar' ? 'Talent OS sidebar' : 'Talent OS tabs'}>
      {TALENT_NAV.map((item) => {
        const active = isTalentNavActive(pathname, item.href, item.exact);
        return (
          <Link key={item.href} href={item.href} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>
            <span className="tt-talent-nav-icon" aria-hidden>
              {item.icon}
            </span>
            <span className="tt-talent-nav-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
