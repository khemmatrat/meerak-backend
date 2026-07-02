'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useCartOwner } from '@/lib/cartOwner';
import {
  CART_UPDATED_EVENT,
  emptyCartSummary,
  fetchShopCart,
  readCartCache,
  type ShopCartSummary,
  writeCartCache,
} from '@/lib/shopCart';
import {
  recordCartRecoveryTelemetry,
  recordCartRefreshTelemetry,
  recordCartRestoreTelemetry,
} from '@/lib/experience/scenarioTelemetry';

export function useShopCart() {
  const { auth } = useAuth();
  const { ownerId, ready } = useCartOwner();
  const [cart, setCart] = useState<ShopCartSummary>(() => readCartCache() || emptyCartSummary());
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const refreshGen = useRef(0);

  const applyCart = useCallback((next: ShopCartSummary) => {
    setCart(next);
    writeCartCache(next);
  }, []);

  const refresh = useCallback(
    async (opts?: { cacheHit?: boolean; source?: string; telemetry?: boolean }) => {
      if (!ownerId) return emptyCartSummary();
      const gen = ++refreshGen.current;
      const t0 = performance.now();
      const emitTelemetry = opts?.telemetry === true;
      try {
        const next = await fetchShopCart(ownerId, auth);
        if (gen !== refreshGen.current) return next;
        applyCart(next);
        setOffline(false);
        if (emitTelemetry) {
          recordCartRefreshTelemetry({
            loadMs: Math.round(performance.now() - t0),
            cartCount: next.count,
            cacheHit: opts?.cacheHit,
            source: opts?.source || 'network',
          });
        }
        return next;
      } catch {
        const cached = readCartCache();
        if (cached) {
          applyCart(cached);
          setOffline(true);
          if (emitTelemetry) {
            recordCartRestoreTelemetry({
              loadMs: Math.round(performance.now() - t0),
              cartCount: cached.count,
              source: opts?.source || 'session_cache',
            });
          }
          return cached;
        }
        const empty = emptyCartSummary();
        applyCart(empty);
        setOffline(true);
        return empty;
      } finally {
        if (gen === refreshGen.current) setLoading(false);
      }
    },
    [applyCart, auth, ownerId],
  );

  const optimisticBump = useCallback(
    (qtyDelta = 1) => {
      setCart((prev) => {
        const item_qty_total = Math.max(0, (prev.item_qty_total || 0) + qtyDelta);
        const count = Math.max(prev.count || 0, item_qty_total > 0 ? Math.max(1, prev.count || 1) : 0);
        const next = { ...prev, item_qty_total, count: count || (item_qty_total > 0 ? 1 : 0) };
        writeCartCache(next);
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    if (!ready || !ownerId) return;
    const cached = readCartCache();
    if (cached?.count) {
      applyCart(cached);
    }
    void refresh({ cacheHit: Boolean(cached?.count), source: 'mount' });
  }, [applyCart, ownerId, ready, refresh]);

  useEffect(() => {
    const onUpdate = (e: Event) => {
      const detail = (e as CustomEvent<ShopCartSummary>).detail;
      if (detail?.items) applyCart(detail);
      else void refresh({ source: 'event' });
    };
    window.addEventListener(CART_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(CART_UPDATED_EVENT, onUpdate);
  }, [applyCart, refresh]);

  useEffect(() => {
    const onOnline = () => {
      recordCartRecoveryTelemetry({ source: 'online' });
      void refresh({ source: 'reconnect', telemetry: true });
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [refresh]);

  return {
    cart,
    count: cart.count,
    itemQtyTotal: cart.item_qty_total,
    totalMicro: cart.total_micro,
    loading,
    offline,
    ownerId,
    ready,
    refresh,
    optimisticBump,
    applyCart,
  };
}
