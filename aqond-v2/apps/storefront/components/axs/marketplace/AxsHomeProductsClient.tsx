'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EmptyState } from '@aqond/ui';
import { FtxHomePersonalizedModules } from '@/components/experience/FtxHomePersonalizedModules';
import { recordHomeTelemetry } from '@/lib/experience/scenarioTelemetry';
import type { HomeConnectionStatus } from '@/lib/server/homeProducts';

const CACHE_KEY = 'aqond:home:products:v1';

type HomeProductsPayload = {
  freshProducts: any[];
  restProducts: any[];
  products: any[];
  promos: any[];
  connectionStatus: HomeConnectionStatus;
};

type AxsHomeProductsClientProps = HomeProductsPayload;

function readCache(): HomeProductsPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as HomeProductsPayload) : null;
  } catch {
    return null;
  }
}

export function AxsHomeProductsClient({
  freshProducts,
  restProducts,
  products,
  promos,
  connectionStatus,
}: AxsHomeProductsClientProps) {
  const router = useRouter();
  const wasOffline = useRef(false);
  const [online, setOnline] = useState(true);
  const cache = readCache();

  const retry = useCallback(() => {
    recordHomeTelemetry({
      retry: true,
      error: connectionStatus === 'unavailable' ? 'connection_unavailable' : null,
      productCount: products.length,
      cacheHit: Boolean(readCache()?.products?.length),
    });
    router.refresh();
  }, [router, connectionStatus, products.length]);

  useEffect(() => {
    setOnline(navigator.onLine);
  }, []);

  useEffect(() => {
    if (products.length > 0) {
      const payload: HomeProductsPayload = {
        freshProducts,
        restProducts,
        products,
        promos,
        connectionStatus,
      };
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    }
  }, [freshProducts, restProducts, products, promos, connectionStatus]);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      if (wasOffline.current) {
        wasOffline.current = false;
        router.refresh();
      }
    };
    const onOffline = () => {
      setOnline(false);
      wasOffline.current = true;
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [router]);

  useEffect(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const loadMs = nav ? Math.round(nav.domContentLoadedEventEnd) : undefined;
    const renderMs = Math.round(performance.now());
    const cacheHit = Boolean(readCache()?.products?.length) && connectionStatus !== 'unavailable';

    recordHomeTelemetry({
      loadMs,
      renderMs,
      productCount: products.length,
      cacheHit,
      error: connectionStatus === 'unavailable' && products.length === 0 ? 'empty_catalog' : null,
    });
  }, [connectionStatus, products.length]);

  const cachedProducts = cache?.products?.length ? cache : null;
  const useCache = !online && Boolean(cachedProducts);

  if (connectionStatus === 'unavailable' && products.length === 0) {
    if (useCache && cachedProducts) {
      return (
        <>
          <p className="axs-home-offline-banner" data-testid="home-offline-banner">
            แสดงข้อมูลที่บันทึกไว้ — ออฟไลน์
          </p>
          <FtxHomePersonalizedModules
            freshProducts={cachedProducts.freshProducts}
            restProducts={cachedProducts.restProducts}
            products={cachedProducts.products}
            promos={cachedProducts.promos}
          />
        </>
      );
    }

    if (!online) {
      return (
        <div data-testid="home-offline-empty">
          <EmptyState
            icon="📡"
            title="คุณออฟไลน์อยู่"
            description="เชื่อมต่ออินเทอร์เน็ตเพื่อโหลดสินค้า"
          />
        </div>
      );
    }

    return (
      <div data-testid="home-connection-empty">
        <EmptyState
          icon="🔗"
          title="กำลังเชื่อมต่อข้อมูล"
          description="ไม่สามารถดึงสินค้าได้ในขณะนี้"
          actionLabel="ลองใหม่"
          onAction={retry}
        />
      </div>
    );
  }

  const display = useCache && cachedProducts ? cachedProducts : { freshProducts, restProducts, products, promos };

  return (
    <>
      {useCache && (
        <p className="axs-home-offline-banner" data-testid="home-offline-banner">
          แสดงข้อมูลที่บันทึกไว้ — ออฟไลน์
        </p>
      )}
      <FtxHomePersonalizedModules
        freshProducts={display.freshProducts}
        restProducts={display.restProducts}
        products={display.products}
        promos={display.promos}
      />
    </>
  );
}
