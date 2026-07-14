'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { readStoredAuth } from '@/lib/meerakAuth';
import { recordStorefrontAppOpen } from '@/lib/intentDwell';

type Banner = { title: string; subtitle: string; href: string };

export function ContextualHomeBanner({ className = '' }: { className?: string }) {
  const [banner, setBanner] = useState<Banner | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = readStoredAuth();
    if (!auth?.userId) {
      setLoading(false);
      return;
    }
    let alive = true;
    void recordStorefrontAppOpen();
    fetch(
      `/api/growth/home-personalized?userId=${encodeURIComponent(auth.userId)}&surface=storefront`,
      { cache: 'no-store' },
    )
      .then((r) => r.json())
      .then((data) => {
        if (alive) setBanner(data.banner || null);
      })
      .catch(() => {
        if (alive) setBanner(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (loading || !banner) return null;

  return (
    <Link
      href={banner.href}
      className={`tt-context-banner ${className}`.trim()}
    >
      <span className="tt-context-banner-icon" aria-hidden>
        ✨
      </span>
      <div className="tt-context-banner-text">
        <strong>{banner.title}</strong>
        <span>{banner.subtitle}</span>
      </div>
      <span className="tt-context-banner-go" aria-hidden>
        ›
      </span>
    </Link>
  );
}
