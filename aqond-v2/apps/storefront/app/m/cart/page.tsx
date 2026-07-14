'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useCartOwner } from '@/lib/cartOwner';
import { bffGet, bffPost } from '@/lib/bff';
import { useAuth } from '@/lib/auth';
import { fetchFoodCart } from '@/lib/food';
import { formatCatalogPrice } from '@/lib/format';
import { enrichCartItem } from '@/lib/productVisual';
import { dispatchCartUpdated, type ShopCartSummary } from '@/lib/shopCart';
import { useShopCart } from '@/lib/useShopCart';
import { recordCartRemoveTelemetry, recordCartViewTelemetry } from '@/lib/experience/scenarioTelemetry';
import { TtCartLine } from '@/components/mobile/TtCartLine';
import { TtProductGrid, type TtProduct } from '@/components/mobile/TtProductGrid';
import { TtCheckoutStepBar, TtCheckoutNextHint } from '@/components/mobile/TtCheckoutStepBar';
import { IconLuxPin } from '@/components/mobile/TtLuxuryIcons';

async function setCartQty(
  ownerId: string,
  productId: string,
  qty: number,
  auth: ReturnType<typeof useAuth>['auth'],
): Promise<ShopCartSummary> {
  try {
    return await bffPost<ShopCartSummary>(
      '/v1/cart/items/qty',
      { owner_id: ownerId, product_id: productId, qty },
      auth,
    );
  } catch {
    const res = await fetch('/api/cart/items/qty', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner_id: ownerId, product_id: productId, qty }),
    });
    if (!res.ok) throw new Error('cart_qty_failed');
    return res.json();
  }
}

export default function MobileCartPage() {
  const { auth } = useAuth();
  const { ownerId, ready: ownerReady } = useCartOwner();
  const { cart, loading, offline, refresh } = useShopCart();

  useEffect(() => {
    if (!ownerReady || !ownerId) return;
    void refresh({ source: 'cart_page', telemetry: true });
  }, [ownerId, ownerReady, refresh]);
  const [foodCartCount, setFoodCartCount] = useState(0);
  const [catalog, setCatalog] = useState<TtProduct[]>([]);
  const [qtyBusy, setQtyBusy] = useState<string | null>(null);
  const viewStarted = useRef(0);
  const viewTelemetrySent = useRef(false);

  useEffect(() => {
    viewStarted.current = performance.now();
    viewTelemetrySent.current = false;
  }, [ownerId]);

  useEffect(() => {
    if (!ownerReady || !ownerId) return;
    fetchFoodCart(ownerId)
      .then((fc) => setFoodCartCount(fc.count || 0))
      .catch(() => setFoodCartCount(0));
  }, [ownerId, ownerReady]);

  useEffect(() => {
    bffGet<any>('/v1/home')
      .then((d) => setCatalog(d.products?.products || []))
      .catch(() => setCatalog([]));
  }, []);

  const items = useMemo(
    () => (cart?.items || []).map((it) => enrichCartItem(it, catalog)),
    [cart, catalog],
  );
  const recs = catalog.slice(0, 8);
  const lineCount = cart?.count ?? items.length ?? 0;
  const displayCount = cart?.item_qty_total ?? lineCount;
  const isEmpty = !loading && items.length === 0;

  useEffect(() => {
    if (!ownerReady || !ownerId || loading || viewTelemetrySent.current) return;
    viewTelemetrySent.current = true;
    recordCartViewTelemetry({
      loadMs: Math.round(performance.now() - viewStarted.current),
      cartCount: displayCount,
      lineCount: lineCount,
      totalMicro: cart?.total_micro ?? 0,
      empty: isEmpty,
      source: 'cart_page',
    });
  }, [ownerReady, ownerId, loading, displayCount, lineCount, cart?.total_micro, isEmpty]);

  const onQtyChange = useCallback(
    async (productId: string, nextQty: number) => {
      if (!ownerId) return;
      setQtyBusy(productId);
      try {
        const next = await setCartQty(ownerId, productId, nextQty, auth);
        dispatchCartUpdated({
          items: (next.items || []).map((it) => ({
            ...it,
            line_micro: it.line_micro ?? (it.unit_price_micro || 0) * (it.qty || 1),
          })),
          count: next.count ?? 0,
          item_qty_total: next.item_qty_total ?? 0,
          total_micro: next.total_micro ?? 0,
        });
        if (nextQty <= 0) {
          recordCartRemoveTelemetry({ productId, cartCount: next.count });
        }
      } catch {
        await refresh({ source: 'qty_retry' });
      } finally {
        setQtyBusy(null);
      }
    },
    [auth, ownerId, refresh],
  );

  return (
    <>
      <header className="tt-header">
        <div className="tt-header-row">
          <Link href="/m/home" className="tt-back" aria-label="กลับ">‹</Link>
          <span style={{ flex: 1, fontWeight: 700, fontSize: '1rem' }} data-testid="cart-page-count">
            รถเข็นสินค้า ({displayCount})
          </span>
          <span className="tt-icon-btn" title="ที่อยู่" aria-hidden>
            <IconLuxPin size={20} />
          </span>
        </div>
      </header>

      {offline && (
        <p className="tt-warn tt-cart-offline" role="status" data-testid="cart-offline-banner">
          ออฟไลน์ — แสดงรถเข็นที่บันทึกไว้ จะซิงค์เมื่อกลับมาออนไลน์
        </p>
      )}

      {!isEmpty && <TtCheckoutStepBar current={1} labels={['รถเข็น', 'ชำระเงิน · ที่อยู่']} />}

      {loading && <p className="tt-loading" aria-busy="true">กำลังโหลด...</p>}

      {isEmpty && foodCartCount > 0 && (
        <div className="tt-food-cart-crosslink">
          <div className="tt-empty-icon" aria-hidden>🍜</div>
          <h1 className="tt-empty-title">รถเข็นอาหาร ({foodCartCount})</h1>
          <p className="tt-empty-sub">อาหารกับสินค้าแยกรถเข็น — กดด้านล่างเพื่อสั่งอาหารต่อ</p>
          <Link href="/m/food/cart" className="tt-btn-primary">
            ไปรถเข็นอาหาร
          </Link>
        </div>
      )}

      {isEmpty && foodCartCount === 0 && (
        <div className="tt-empty-cart" data-testid="cart-empty-state">
          <div className="tt-empty-icon" aria-hidden>🛍️</div>
          <h1 className="tt-empty-title">รถเข็นของคุณว่างเปล่า</h1>
          <p className="tt-empty-sub">
            เติมให้เต็มด้วยรายการโปรดและดีลที่ยอดเยี่ยมเลย!
          </p>
          <Link href="/m/home" className="tt-btn-primary">
            เริ่มการช้อปปิ้ง
          </Link>
        </div>
      )}

      {!loading && items.length > 0 && (
        <>
          <div className="tt-cart-items">
            {items.map((it: any) => (
              <TtCartLine
                key={it.product_id || it.id}
                item={it}
                priceLabel={formatCatalogPrice(it.line_micro || (it.unit_price_micro || 0) * (it.qty || 1))}
                editable
                busy={qtyBusy === it.product_id}
                onQtyChange={(q) => void onQtyChange(it.product_id, q)}
              />
            ))}
          </div>
          <div className="tt-cart-footer" data-testid="cart-subtotal">
            <p style={{ margin: '0 0 12px', fontWeight: 700 }}>
              รวม {formatCatalogPrice(cart.total_micro || 0)}
            </p>
            <TtCheckoutNextHint scope="shop" />
            <Link
              href="/m/checkout"
              className="tt-btn-primary"
              style={{ textAlign: 'center', marginTop: 12 }}
              data-testid="cart-checkout-cta"
            >
              ดำเนินการชำระเงิน
            </Link>
          </div>
        </>
      )}

      {(isEmpty || items.length > 0) && recs.length > 0 && (
        <>
          <h2 className="tt-section-title">คุณยังอาจชอบ</h2>
          <TtProductGrid products={recs} />
        </>
      )}
    </>
  );
}
