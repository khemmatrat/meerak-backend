'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, EmptyState } from '@aqond/ui';
import { useCartOwner } from '@/lib/cartOwner';
import { useAuth } from '@/lib/auth';
import {
  clearFoodCartApi,
  DELIVERY_MODES,
  etaShort,
  fetchFoodCart,
  loadFoodSavedAddr,
  placeFoodExpressOrder,
  saveFoodSavedAddr,
  type FoodCartView,
} from '@/lib/food';
import { createSavedAddress } from '@/lib/checkout';
import { bffGet } from '@/lib/bff';
import { formatCatalogPrice } from '@/lib/format';
import type { PaymentMethodId } from '@/lib/payment';
import { paymentMethodLabel } from '@/lib/payment';
import type { PromoResult } from '@/lib/promo';
import { loadCheckoutPrefs } from '@/lib/checkoutPrefs';
import type { PaymentAction } from '@/lib/checkout';
import { TtPaymentPending } from '@/components/mobile/TtPaymentPending';
import { TtPaysoPaymentPending } from '@/components/mobile/TtPaysoPaymentPending';
import { TtCheckoutItemLine } from '@/components/mobile/TtCheckoutItemLine';
import { TtCheckoutMerchantHeader } from '@/components/mobile/TtCheckoutMerchantHeader';
import { TtCheckoutDeliveryCard } from '@/components/mobile/TtCheckoutDeliveryCard';
import { TtCheckoutStepBar, TtCheckoutPayPromoSummary } from '@/components/mobile/TtCheckoutStepBar';
import { formatOptionsSummary, lineUnitMicro } from '@/lib/foodOptions';
import { formatHandoffForOrder, validateHandoff, type DeliveryHandoff } from '@/lib/deliveryHandoff';
import { TtDeliveryHandoff, DEFAULT_HANDOFF } from '@/components/mobile/TtDeliveryHandoff';
import { AxsFoodCartLoading } from '@/components/axs/food/AxsFoodCartLoading';

type BffAddress = {
  id: string;
  recipient?: string;
  line1?: string;
  postal_code?: string;
  phone?: string;
  is_default?: boolean;
};

export default function MobileFoodCheckoutPage() {
  const { auth } = useAuth();
  const router = useRouter();
  const { ownerId, ready } = useCartOwner();
  const [cart, setCart] = useState<FoodCartView | null>(null);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState('');
  const [fullName, setFullName] = useState('');
  const [address, setAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [phone, setPhone] = useState('');
  const [savedAddresses, setSavedAddresses] = useState<BffAddress[]>([]);
  const [addressId, setAddressId] = useState('');
  const [handoff, setHandoff] = useState<DeliveryHandoff>(DEFAULT_HANDOFF);
  const [payMethod, setPayMethod] = useState<PaymentMethodId>('cod');
  const [promo, setPromo] = useState<PromoResult | null>(null);
  const [paymentAction, setPaymentAction] = useState<PaymentAction | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState('');

  useEffect(() => {
    if (!ownerId) return;
    const saved = loadFoodSavedAddr(ownerId);
    if (saved.fullName) setFullName(saved.fullName);
    if (saved.address) setAddress(saved.address);
    if (saved.postal_code) setPostalCode(saved.postal_code);
    if (saved.phone) setPhone(saved.phone);
    if (saved.handoff) setHandoff(saved.handoff);
  }, [ownerId]);

  useEffect(() => {
    if (!auth?.userId || !ownerId) return;
    bffGet<any>(`/v1/checkout?owner_id=${ownerId}`, auth)
      .then((v) => {
        const addrs = (v.addresses?.addresses || v.addresses?.items || []) as BffAddress[];
        setSavedAddresses(addrs);
        const a = addrs.find((x) => x.is_default) || addrs[0];
        if (!a) return;
        setAddressId(a.id);
        if (a.recipient) setFullName(a.recipient);
        if (a.line1) setAddress(a.line1);
        if (a.postal_code) setPostalCode(a.postal_code);
        if (a.phone) setPhone(a.phone);
      })
      .catch(() => {});
  }, [auth, ownerId]);

  useEffect(() => {
    if (!ownerId) return;
    const prefs = loadCheckoutPrefs('food', ownerId);
    setPayMethod(prefs.payMethod);
    setPromo(prefs.promo);
  }, [ownerId]);

  useEffect(() => {
    if (!ready || !ownerId) return;
    fetchFoodCart(ownerId)
      .then(setCart)
      .catch(() => setCart(null))
      .finally(() => setLoading(false));
  }, [ownerId, ready]);

  const modeLabel = DELIVERY_MODES.find((m) => m.id === cart?.delivery_mode)?.label || 'ส่งปกติ';
  const subtotalMicro = cart?.subtotal_micro || 0;
  const deliveryMicro = cart?.delivery_fee_micro || 0;
  const discountMicro = promo?.ok ? promo.discount_micro : 0;
  const grandTotalMicro = useMemo(
    () => Math.max(0, subtotalMicro + deliveryMicro - discountMicro),
    [subtotalMicro, deliveryMicro, discountMicro],
  );
  const etaLabel = etaShort(cart?.eta || { label: cart?.eta_label });
  const handoffLabel = formatHandoffForOrder(handoff);

  const place = async () => {
    if (!cart?.items.length || !cart.meets_minimum) return;
    const primaryMerchant = cart.shops?.[0]?.merchant_id || cart.merchant_id;
    if (!primaryMerchant) return;
    if (!fullName.trim() || !address.trim() || !phone.trim()) {
      setError('กรุณากรอกชื่อ ที่อยู่จัดส่ง และเบอร์โทร');
      return;
    }
    if (!addressId && !/^\d{5}$/.test(postalCode.trim())) {
      setError('รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก');
      return;
    }
    const handoffErr = validateHandoff(handoff);
    if (handoffErr) {
      setError(handoffErr);
      return;
    }
    setPlacing(true);
    setError('');
    try {
      let resolvedAddressId = addressId;
      if (!resolvedAddressId && auth?.userId) {
        try {
          resolvedAddressId = await createSavedAddress(auth, {
            recipient: fullName.trim(),
            line1: address.trim(),
            postal_code: postalCode.trim() || '10110',
            phone: phone.trim(),
          });
        } catch {
          /* ใช้ที่อยู่ในฟอร์มต่อได้ */
        }
      }
      const { orderId, paymentAction: action } = await placeFoodExpressOrder({
        ownerId: ownerId!,
        merchantId: primaryMerchant,
        merchantName: cart.merchant_name || cart.shops?.[0]?.merchant_name || 'ร้านอาหาร',
        shopCount: cart.shop_count,
        deliveryMode: cart.delivery_mode,
        paymentMethod: payMethod,
        promoCode: promo?.ok ? (promo.codes?.[0] || promo.code) : undefined,
        promoCodes: promo?.ok ? (promo.codes?.length ? promo.codes : promo.code ? [promo.code] : undefined) : undefined,
        address_id: resolvedAddressId || undefined,
        postal_code: postalCode.trim(),
        items: cart.items.map((it) => ({
          item_id: it.item_id,
          title: it.title,
          qty: it.qty || 1,
          unit_price_micro: lineUnitMicro(it.unit_price_micro, it.options),
          options: it.options,
        })),
        subtotalMicro: cart.subtotal_micro,
        deliveryFeeMicro: cart.delivery_fee_micro,
        etaLabel: cart.eta_label || cart.eta?.label,
        address: {
          fullName: fullName.trim(),
          address: address.trim(),
          phone: phone.trim(),
          handoff,
        },
      });
      saveFoodSavedAddr(ownerId!, {
        fullName: fullName.trim(),
        address: address.trim(),
        postal_code: postalCode.trim(),
        phone: phone.trim(),
        handoff,
      });
      await clearFoodCartApi(ownerId!);
      if (action && payMethod !== 'cod') {
        setPendingOrderId(orderId || '');
        setPaymentAction(action);
        return;
      }
      router.push(orderId ? `/m/food/track/${orderId}` : '/m/orders');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'สั่งอาหารไม่สำเร็จ');
    } finally {
      setPlacing(false);
    }
  };

  const afterPayment = () => {
    router.push(pendingOrderId ? `/m/food/track/${pendingOrderId}` : '/m/orders');
  };

  if (loading) return <AxsFoodCartLoading />;

  if (!cart || cart.items.length === 0) {
    return (
      <EmptyState
        icon="🍜"
        title="รถเข็นอาหารว่าง"
        description="เพิ่มเมนูจากร้านที่ชอบก่อนชำระเงิน"
        actionLabel="ไปเลือกร้าน"
        onAction={() => router.push('/m/food')}
      />
    );
  }

  return (
    <>
      <header className="tt-header">
        <div className="tt-header-row">
          <Link href="/m/food/cart" className="tt-back" aria-label="กลับ">‹</Link>
          <span style={{ flex: 1, fontWeight: 700, fontSize: '1rem' }}>ยืนยันสั่งอาหาร</span>
        </div>
      </header>

      <TtCheckoutStepBar current={2} />

      <TtCheckoutPayPromoSummary
        payMethodLabel={paymentMethodLabel(payMethod)}
        promoCode={promo?.code}
        promoLabel={promo?.label}
        discountMicro={discountMicro}
        editHref="/m/food/cart"
      />

      <TtCheckoutDeliveryCard
        mode="food"
        recipient={fullName}
        address={address}
        phone={phone}
        handoffLabel={handoffLabel}
        deliveryModeLabel={modeLabel}
        etaLabel={etaLabel}
        riderHint={cart.delivery_quote?.rider_hint}
        shopCount={cart.shop_count}
        payMethod={payMethod}
      />

      <div className="tt-food-checkout-block">
        <h2>ที่อยู่จัดส่ง</h2>
        {savedAddresses.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <label className="tt-label" htmlFor="food-saved-addr">ที่อยู่ที่บันทึกไว้</label>
            <select
              id="food-saved-addr"
              className="tt-input"
              value={addressId}
              onChange={(e) => {
                const id = e.target.value;
                setAddressId(id);
                const a = savedAddresses.find((x) => x.id === id);
                if (!a) return;
                if (a.recipient) setFullName(a.recipient);
                if (a.line1) setAddress(a.line1);
                if (a.postal_code) setPostalCode(a.postal_code);
                if (a.phone) setPhone(a.phone);
              }}
            >
              {savedAddresses.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.recipient || 'ที่อยู่'} — {a.line1?.slice(0, 40)}
                </option>
              ))}
            </select>
          </div>
        )}
        <input className="tt-input" placeholder="ชื่อผู้รับ" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <textarea className="tt-input tt-textarea" placeholder="บ้านเลขที่ ซอย แขวง/เขต" value={address} onChange={(e) => setAddress(e.target.value)} rows={3} />
        <input className="tt-input" placeholder="รหัสไปรษณีย์" inputMode="numeric" maxLength={5} value={postalCode} onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, '').slice(0, 5))} />
        <input className="tt-input" placeholder="เบอร์โทร" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <TtDeliveryHandoff value={handoff} onChange={setHandoff} />
      </div>

      <section className="tt-checkout-order-section">
        <h2 className="tt-checkout-h">รายการอาหาร ({cart.count} ชิ้น)</h2>
        {(cart.shops || []).map((shop) => (
          <div key={shop.merchant_id} className="tt-checkout-shop-group">
            <TtCheckoutMerchantHeader
              emoji={shop.emoji || '🍱'}
              name={shop.merchant_name}
              subtitle={[shop.cuisine, shop.zone_id && `โซน ${shop.zone_id}`].filter(Boolean).join(' · ')}
              meta={
                shop.rating
                  ? `⭐ ${shop.rating} · ${shop.distance_km?.toFixed(1) || '?'} กม.`
                  : undefined
              }
              deliveryFeeMicro={shop.delivery_charged_micro}
              itemCount={shop.items.reduce((n, i) => n + (i.qty || 1), 0)}
            />
            <div className="tt-checkout-items">
              {shop.items.map((it) => (
                <TtCheckoutItemLine
                  key={`${shop.merchant_id}-${it.item_id}-${formatOptionsSummary(it.options)}`}
                  title={it.title}
                  description={it.description}
                  qty={it.qty || 1}
                  unitPriceMicro={lineUnitMicro(it.unit_price_micro, it.options)}
                  imageUrl={it.image_url}
                  category="food"
                  variant={it.options?.length ? formatOptionsSummary(it.options) : undefined}
                />
              ))}
            </div>
          </div>
        ))}
      </section>

      <div className="tt-food-checkout-block">
        <h2>สรุปยอด</h2>
        <div className="tt-food-summary-row">
          <span>อาหาร ({cart.shop_count || 1} ร้าน)</span>
          <span>{formatCatalogPrice(subtotalMicro)}</span>
        </div>
        {cart.delivery_quote?.per_shop.map((p) => (
          <div key={p.merchant_id} className="tt-food-summary-row tt-food-summary-sub">
            <span>ค่าส่ง · {p.merchant_name}</span>
            <span>{formatCatalogPrice(p.charged_micro)}</span>
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
            รวม
            {payMethod === 'cod' ? ' · เก็บปลายทาง' : ` · ${paymentMethodLabel(payMethod)}`}
          </span>
          <span>{formatCatalogPrice(grandTotalMicro)}</span>
        </div>
      </div>

      {error && <p className="tt-error">{error}</p>}

      <div className="tt-cart-footer">
        <Button
          type="button"
          variant="primary"
          className="tt-btn-primary"
          disabled={placing || !cart.meets_minimum}
          onClick={() => void place()}
          style={{ width: '100%' }}
        >
          {placing ? 'กำลังสั่ง…' : `สั่งเลย · ${formatCatalogPrice(grandTotalMicro)}`}
        </Button>
      </div>

      {paymentAction &&
        (paymentAction.source === 'payso' ? (
          <TtPaysoPaymentPending action={paymentAction} onDone={afterPayment} />
        ) : (
          <TtPaymentPending action={paymentAction} onDone={afterPayment} />
        ))}
    </>
  );
}
