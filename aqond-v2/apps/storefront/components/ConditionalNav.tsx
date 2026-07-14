'use client';

import { usePathname } from 'next/navigation';
import { NavBar } from '@/components/NavBar';

/** Desktop nav — hidden on /m/* mobile shell. */
export function ConditionalNav() {
  const path = usePathname() || '';
  if (path.startsWith('/m')) return null;
  return <NavBar />;
}
