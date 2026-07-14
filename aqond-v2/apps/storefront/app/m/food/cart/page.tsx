'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { EmptyState } from '@aqond/ui';
import { useCartOwner } from '@/lib/cartOwner';
import {
  clearFoodCartApi,
  etaShort,
  fetchFoodCart,
  setFoodDeliveryModeApi,
  updateFoodCartQty,
  type DeliveryMode,
  type FoodCartView,
} from '@/lib/food';
import { formatCatalogPrice } from '@/lib/format';
import type { PaymentMethodId } from '@/lib/payment';
import { paymentMethodLabel } from '@/lib/payment';
import type { PromoResult } from '@/lib/promo';
import { fetchPromoHints } from '@/lib/promo';
import { loadCheckoutPrefs, saveCheckoutPrefs } from '@/lib/checkoutPrefs';
import { formatOptionsSummary, lineUnitMicro, type FoodCartOptionLine } from '@/lib/foodOptions';
import { TtFoodDeliveryModes } from '@/components/mobile/TtFoodDeliveryModes';
import { TtFoodCartLine } from '@/components/mobile/TtFoodCartLine';
import { TtFoodCartCheckoutBar } from '@/components/mobile/TtFoodCartCheckoutBar';
import { TtCheckoutStepBar } from '@/components/mobile/TtCheckoutStepBar';
import { TtPromoCodeInput } from '@/components/mobile/TtPromoCodeInput';
import { TtPaymentMethods } from '@/components/mobile/TtPaymentMethods';
import { AxsFoodCartLoading } from '@/components/axs/food/AxsFoodCartLoading';

export default function MobileFoodCartPage() {
  const router = useRouter();
  const { ownerId, ready } = useCartOwner();
  const [cart, setCart] = useState<FoodCartView | null>(null);
  const [loading, setLoading] = useState(true);
  const [modeLoading, setModeLoading] = useState(false);
  const [qtyBusy, setQtyBusy] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState<PaymentMethodId>('cod');
  const [promo, setPromo] = useState<PromoResult | null>(null);
  const [promoHints, setPromoHints] = useState<Array<{ code: string; label: string }>>([]);

  const reload = useCallback(() => {
    if (!ownerId) return;
    setLoading(true);
    fetchFoodCart(ownerId)
      .then(setCart)
      .catch(() =>
        setCart({
          items: [],
          count: 0,
          subtotal_micro: 0,
          delivery_fee_micro: 0,
          total_micro: 0,
        }),
      )
      .finally(() => setLoading(false));
  }, [ownerId]);

  useEffect(() => {
    if (!ready || !ownerId) return;
    reload();
    const prefs = loadCheckoutPrefs('food', ownerId);
    setPayMethod(prefs.payMethod);
    setPromo(prefs.promo);
    fetchPromoHints('food').then(setPromoHints).catch(() => setPromoHints([]));
  }, [ownerId, ready, reload]);

  useEffect(() => {
    if (!ownerId) return;
    saveCheckoutPrefs('food', ownerId, { payMethod, promo });
  }, [ownerId, payMethod, promo]);

  const onModeChange = async (mode: DeliveryMode) => {
    if (!ownerId) return;
    setModeLoading(true);
    try {
      setCart(await setFoodDeliveryModeApi(ownerId, mode));
    } finally {
      setModeLoading(false);
    }
  };

  const onQtyChange = async (
    merchantId: string,
    itemId: string,
    options: FoodCartOptionLine[] | undefined,
    nextQty: number,
  ) => {
    if (!ownerId) return;
    const key = `${merchantId}-${itemId}-${formatOptionsSummary(options)}`;
    setQtyBusy(key);
    try {
      setCart(await updateFoodCartQty(ownerId, {
        merchant_id: merchantId,
        item_id: itemId,
        options,
        qty: nextQty,
      }));
    } finally {
      setQtyBusy(null);
    }
  };

  const shops = cart?.shops || [];
  const isEmpty = !loading && (cart?.count || 0) === 0;
  const subtotalMicro = cart?.subtotal_micro || 0;
  const deliveryMicro = cart?.delivery_fee_micro || 0;
  const discountMicro = promo?.ok ? promo.discount_micro : 0;
  const grandTotalMicro = useMemo(
    () => Math.max(0, subtotalMicro + deliveryMicro - discountMicro),
    [subtotalMicro, deliveryMicro, discountMicro],
  );
  const etaLabel = cart ? etaShort(cart.eta || { label: cart.eta_label }) : undefined;

  const goCheckout = () => {
    if (!ownerId) return;
    saveCheckoutPrefs('food', ownerId, { payMethod, promo });
  };

  return (
    <div className="tt-food-cart-page">
      <header className="tt-header tt-food-header tt-food-cart-header">
        <div className="tt-header-row">
          <Link href="/m/food" className="tt-back" aria-label="กลับ">‹</Link>
          <span className="tt-food-cart-header-title">
            รถเข็นอาหาร
            {!isEmpty && <em>({cart?.count || 0})</em>}
            {cart && (cart.shop_count || 0) > 1 && (
              <small> · {cart.shop_count} ร้าน</small>
            )}
          </span>
          {!isEmpty && (
            <button
              type="button"
              className="tt-food-cart-clear"
              onClick={() => ownerId && clearFoodCartApi(ownerId).then(() => reload())}
            >
              ล้าง
            </button>
          )}
        </div>
        {!isEmpty && <p className="tt-food-loc">🍜 สั่งหลายร้านได้ · เลือกแบบจัดส่งด้านล่าง</p>}
      </header>

      {!isEmpty && <TtCheckoutStepBar current={1} />}

      {loading && <AxsFoodCartLoading />}

      {isEmpty && (
        <EmptyState
          icon="🍜"
          title="ยังไม่มีอาหารในรถเข็น"
          description="สั่งหลายร้านพร้อมกันได้ — เลือกแบบจัดส่งประหยัดเมื่อร้านอยู่ละแวกเดียวกัน"
          actionLabel="ดูร้านใกล้เคียง"
          onAction={() => router.push('/m/food')}
        />
      )}

      {!loading && cart && cart.count > 0 && (
        <>
          {(cart.eta_label || cart.eta) && (
            <div className="tt-food-checkout-eta">
              <span className="tt-food-checkout-eta-icon" aria-hidden>🛵</span>
              <div>
                <strong>ส่งประมาณ {etaLabel}</strong>
                <p>
                  {cart.delivery_mode === 'express'
                    ? 'โหมดส่งด่วน — ถึงเร็วที่สุด'
                    : cart.delivery_mode === 'saver'
                      ? 'โหมดประหยัด — รวมออเดอร์ร้านใกล้กัน'
                      : 'โหมดส่งปกติ — คุ้มค่าค่าส่ง'}
                </p>
              </div>
            </div>
          )}

          {shops.map((shop) => (
            <section key={shop.merchant_id} className="tt-food-cart-card">
              <div className="tt-food-cart-shop-head">
                <div className="tt-food-cart-shop-info">
                  <span className="tt-food-cart-shop-emoji" aria-hidden>{shop.emoji || '🍱'}</span>
                  <div>
                    <strong>{shop.merchant_name}</strong>
                    <p>
                      {shop.cuisine || 'อาหาร'}
                      {shop.rating != null && ` · ⭐ ${shop.rating}`}
                      {shop.distance_km != null && ` · ${shop.distance_km.toFixed(1)} กม.`}
                    </p>
                  </div>
                </div>
                <Link href={`/m/food/${shop.merchant_id}`} className="tt-food-cart-add-more">
                  + เพิ่มเมนู
                </Link>
              </div>

              {!shop.meets_minimum && (
                <p className="tt-food-min-badge-inline">
                  ขั้นต่ำ {formatCatalogPrice(shop.min_order_micro)}
                  {shop.shortfall_micro > 0 && (
                    <> · ขาดอีก {formatCatalogPrice(shop.shortfall_micro)}</>
                  )}
                </p>
              )}

              <div className="tt-food-cart-lines">
                {shop.items.map((it) => {
                  const lineKey = `${shop.merchant_id}-${it.item_id}-${formatOptionsSummary(it.options)}`;
                  return (
                    <TtFoodCartLine
                      key={lineKey}
                      title={it.title}
                      description={it.description}
                      qty={it.qty || 1}
                      unitPriceMicro={lineUnitMicro(it.unit_price_micro, it.options)}
                      imageUrl={it.image_url}
                      variant={it.options?.length ? formatOptionsSummary(it.options) : undefined}
                      busy={qtyBusy === lineKey}
                      onQtyChange={(q) => void onQtyChange(shop.merchant_id, it.item_id, it.options, q)}
                    />
                  );
                })}
              </div>
            </section>
          ))}

          <section className="tt-food-cart-card">
            <TtFoodDeliveryModes cart={cart} onChange={onModeChange} disabled={modeLoading} />
          </section>

          <section className="tt-food-cart-card tt-promo-block">
            <TtPromoCodeInput
              subtotalMicro={subtotalMicro}
              deliveryMicro={deliveryMicro}
              context="food"
              paymentMethod={payMethod}
              applied={promo}
              onApplied={setPromo}
              hints={promoHints}
            />
          </section>

          <section className="tt-food-cart-card">
            <h2 className="tt-food-cart-section-h">ชำระเงิน</h2>
            <TtPaymentMethods value={payMethod} onChange={setPayMethod} />
          </section>

          <section className="tt-food-cart-card tt-food-cart-summary-card">
            <div className="tt-food-summary-row">
              <span>ยอดอาหาร</span>
              <span>{formatCatalogPrice(subtotalMicro)}</span>
            </div>
            {cart.delivery_quote?.per_shop.map((p) => (
              <div key={p.merchant_id} className="tt-food-summary-row sub">
                <span>ค่าส่ง · {p.merchant_name}</span>
                <span>
                  {formatCatalogPrice(p.charged_micro)}
                  {cart.delivery_mode !== 'express' && p.charged_micro < p.express_micro && (
                    <s className="tt-fee-was">{formatCatalogPrice(p.express_micro)}</s>
                  )}
                </span>
              </div>
            ))}
            {discountMicro > 0 && (
              <div className="tt-food-summary-row tt-discount-row">
                <span>ส่วนลด {promo?.code}</span>
                <span>-{formatCatalogPrice(discountMicro)}</span>
              </div>
            )}
            <div className="tt-food-summary-row total">
              <span>
                รวมทั้งสิ้น
                {payMethod === 'cod' ? '' : ` · ${paymentMethodLabel(payMethod)}`}
              </span>
              <span>{formatCatalogPrice(grandTotalMicro)}</span>
            </div>
            {!cart.meets_minimum && (
              <p className="tt-food-min-warn">
                บางร้านยังไม่ถึงขั้นต่ำ — เพิ่มอาหารอีกนิดครับ
                {shops
                  .filter((s) => !s.meets_minimum)
                  .map((s) => (
                    <span key={s.merchant_id} className="tt-food-min-shop-hint">
                      {' '}
                      · {s.merchant_name} ขาด {formatCatalogPrice(s.shortfall_micro || 0)}
                    </span>
                  ))}
              </p>
            )}
          </section>

          <TtFoodCartCheckoutBar
            totalMicro={grandTotalMicro}
            itemCount={cart.count}
            etaLabel={etaLabel}
            disabled={!cart.meets_minimum}
            href="/m/food/checkout"
            onNavigate={goCheckout}
          />
        </>
      )}
    </div>
  );
}
