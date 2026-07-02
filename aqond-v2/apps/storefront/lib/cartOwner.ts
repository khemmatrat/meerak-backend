'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { readStoredAuth } from '@/lib/meerakAuth';

export const GUEST_OWNER_KEY = 'aqond-cart-owner-id';
const CART_SCOPE_KEY = 'aqond-last-cart-scope';

export type CartScope = 'food' | 'shop';

function stableGuestOwnerId(): string {
  if (typeof window === 'undefined') return 'guest';
  let id = localStorage.getItem(GUEST_OWNER_KEY);
  if (!id) {
    id = `guest-${crypto.randomUUID().slice(0, 8)}`;
    localStorage.setItem(GUEST_OWNER_KEY, id);
  }
  return id;
}

/** Stable owner for cart APIs — logged-in user or persistent guest id (not bare "guest"). */
export function resolveCartOwnerId(authUserId?: string | null): string {
  if (authUserId) return authUserId;
  const stored = readStoredAuth();
  if (stored?.userId) return stored.userId;
  return stableGuestOwnerId();
}

export function markCartScope(scope: CartScope) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(CART_SCOPE_KEY, scope);
  } catch {
    /* ignore */
  }
}

export function readCartScope(): CartScope {
  if (typeof window === 'undefined') return 'shop';
  try {
    const v = sessionStorage.getItem(CART_SCOPE_KEY);
    return v === 'food' ? 'food' : 'shop';
  } catch {
    return 'shop';
  }
}

/** Wait for auth hydration before cart fetch — avoids guest vs user split. */
export function useCartOwner() {
  const { auth } = useAuth();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const ownerId = useMemo(() => {
    if (!hydrated) return null;
    return resolveCartOwnerId(auth?.userId);
  }, [auth?.userId, hydrated]);

  return { ownerId, ready: hydrated && ownerId != null };
}
