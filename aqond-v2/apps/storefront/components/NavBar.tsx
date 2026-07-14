'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';

const links = [
  { href: '/', label: 'Home' },
  { href: '/shop', label: 'Shop' },
  { href: '/search', label: 'Search' },
  { href: '/feed', label: 'Feed' },
  { href: '/cart', label: 'Cart' },
  { href: '/account', label: 'Account' },
  { href: '/m/home', label: 'Mobile' },
];

export function NavBar() {
  const { auth, logout } = useAuth();
  return (
    <nav className="nav" role="navigation" aria-label="Main">
      <Link href="/" className="nav-brand">AQOND</Link>
      <div className="nav-links">
        {links.map((l) => (
          <Link key={l.href} href={l.href}>{l.label}</Link>
        ))}
        {auth ? (
          <button type="button" className="nav-link-btn" onClick={() => logout()}>Logout</button>
        ) : (
          <Link href="/login">Login</Link>
        )}
      </div>
    </nav>
  );
}
