'use client';

import { useEffect } from 'react';

type AxsHomeProductsRevealProps = {
  children: React.ReactNode;
};

/** Hides the paint-first skeleton once product modules mount. */
export function AxsHomeProductsReveal({ children }: AxsHomeProductsRevealProps) {
  useEffect(() => {
    document.querySelector('[data-testid="home-skeleton"]')?.remove();
  }, []);

  return <div data-home-products-ready="1">{children}</div>;
}
