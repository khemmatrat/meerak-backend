'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { bffGet } from '@/lib/bff';
import { useAuth } from '@/lib/auth';
import { useCartOwner } from '@/lib/cartOwner';
import { formatCatalogPrice } from '@/lib/format';
import { enrichCartItem } from '@/lib/productVisual';
import { groupCartByMerchant, merchantDisplayName } from '@/lib/checkoutVisual';
import {
  fetchShippingQuote,
  placeOrder,
  createSavedAddress,
  type ShippingRate,
} from '@/lib/checkout';
import { recordCheckoutStartTelemetry } from '@/lib/experience/scenarioTelemetry';
import { CoPaymentPicker } from '@/components/mobile/CoPaymentPicker';
import { PAYMENT_METHODS, paymentMethodLabel, type PaymentMethodId } from '@/lib/payment';
import type { PromoResult } from '@/lib/promo';
import { fetchPromoHints } from '@/lib/promo';
import { CHECKOUT_PAYMENT_KEY } from '@/lib/paymentQr';

const ADDR_KEY = 'aqond-m-checkout-addr';
const CREATOR_KEY = 'aqond_last_creator';
/** ค่าคุ้มครองสินค้า — ร้อยละ 9 ของราคาต่อชิ้น (catalog micro = satang). */
const PROTECTION_RATE_PERCENT = 9;

function protectionUnitMicro(unitPriceMicro: number) {
  return Math.round((unitPriceMicro * PROTECTION_RATE_PERCENT) / 100);
}

type SavedAddr = {
  id?: string;
  fullName?: string;
  address?: string;
  postalCode?: string;
  phone?: string;
};

type BffAddress = {
  id: string;
  recipient?: string;
  line1?: string;
  postal_code?: string;
  phone?: string;
  is_default?: boolean;
};

function loadSavedAddr(owner: string): SavedAddr {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(`${ADDR_KEY}:${owner}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveAddr(owner: string, data: SavedAddr) {
  try {
    localStorage.setItem(`${ADDR_KEY}:${owner}`, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

function loadLastCreator(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return localStorage.getItem(CREATOR_KEY) || undefined;
}

function parseVariantTitle(title?: string) {
  const t = title || '';
  const m = t.match(/^(.*)\s+\((.+)\)$/);
  if (m) return { name: m[1], variant: m[2] };
  return { name: t, variant: '' };
}

function listPriceMicro(unitMicro: number) {
  return Math.round(unitMicro * 2.08);
}

function tomorrowLabel() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('th-TH', { weekday: 'long' });
}

export function MobileCheckoutShopee() {
  const { auth } = useAuth();
  const router = useRouter();
  const { ownerId: owner, ready: ownerReady } = useCartOwner();
  const [cart, setCart] = useState<any>(null);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [wallet, setWallet] = useState<{ balance_micro?: number; coins?: number; coupons?: unknown[] } | null>(
    null,
  );
  const [fullName, setFullName] = useState('');
  const [address, setAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [phone, setPhone] = useState('');
  const [savedAddresses, setSavedAddresses] = useState<BffAddress[]>([]);
  const [addressId, setAddressId] = useState('');
  const [loadingCart, setLoadingCart] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethodId>('promptpay');
  const [promo, setPromo] = useState<PromoResult | null>(null);
  const [promoHints, setPromoHints] = useState<Array<{ code: string; label: string }>>([]);
  const [rates, setRates] = useState<ShippingRate[]>([]);
  const [carrierId, setCarrierId] = useState('flash-th');
  const [loadingRates, setLoadingRates] = useState(true);
  const [addrOpen, setAddrOpen] = useState(false);
  const [shopVoucherOpen, setShopVoucherOpen] = useState(false);
  const [orderNote, setOrderNote] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [payPickerOpen, setPayPickerOpen] = useState(false);
  const [protectionItems, setProtectionItems] = useState<Set<string>>(new Set());
  const [addrMsg, setAddrMsg] = useState('');
  const [addrSaving, setAddrSaving] = useState(false);
  const viewStarted = useRef(0);
  const viewTelemetrySent = useRef(false);

  useEffect(() => {
    viewStarted.current = performance.now();
    viewTelemetrySent.current = false;
  }, [owner]);

  useEffect(() => {
    if (!ownerReady || !owner) return;
    setLoadingCart(true);
    bffGet<any>(`/v1/cart?owner_id=${owner}`, auth)
      .then(setCart)
      .catch(() => setCart({ items: [], count: 0, total_micro: 0 }))
      .finally(() => setLoadingCart(false));

    bffGet<any>('/v1/home')
      .then((d) => setCatalog(d.products?.products || []))
      .catch(() => setCatalog([]));

    bffGet<any>(`/v1/checkout?owner_id=${owner}`, auth)
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

    fetchPromoHints('marketplace').then(setPromoHints).catch(() => setPromoHints([]));

    bffGet<any>(`/v1/wallet?owner_id=${owner}`, auth)
      .then(setWallet)
      .catch(() => setWallet(null));

    setLoadingRates(true);
    fetchShippingQuote(500)
      .then((list) => {
        setRates(list);
        if (list[0]?.carrier_id) setCarrierId(list[0].carrier_id);
      })
      .finally(() => setLoadingRates(false));
  }, [auth, owner, ownerReady]);

  useEffect(() => {
    const saved = loadSavedAddr(owner);
    if (saved.fullName) setFullName(saved.fullName);
    if (saved.address) setAddress(saved.address);
    if (saved.postalCode) setPostalCode(saved.postalCode);
    if (saved.phone) setPhone(saved.phone);
  }, [owner]);

  const items = useMemo(
    () => (cart?.items || []).map((it: any) => enrichCartItem(it, catalog)),
    [cart, catalog],
  );
  const subtotalMicro = cart?.total_micro || 0;
  const selectedRate = rates.find((r) => r.carrier_id === carrierId) || rates[0];
  const shippingMicro = selectedRate?.shipping_micro || 0;
  const shippingFree = shippingMicro === 0;
  const discountMicro = promo?.ok ? promo.discount_micro : 0;
  const shippingDiscountMicro =
    promo?.ok && (promo.code === 'FREESHIP' || promo.codes?.includes('FREESHIP'))
      ? shippingMicro
      : 0;
  const productDiscountMicro = discountMicro;
  const protectionMicro = items.reduce((sum: number, it: any) => {
    const key = `${it.product_id}-${it.variant_id}`;
    if (!protectionItems.has(key)) return sum;
    return sum + protectionUnitMicro(it.unit_price_micro || 0) * (it.qty || 1);
  }, 0);
  const grandTotalMicro = Math.max(
    0,
    subtotalMicro +
      protectionMicro +
      shippingMicro -
      shippingDiscountMicro -
      productDiscountMicro,
  );
  const isEmpty = !loadingCart && items.length === 0;
  const merchantGroups = useMemo(() => groupCartByMerchant(items), [items]);
  const itemCount = items.reduce((n: number, it: any) => n + (it.qty || 1), 0);

  const listTotalMicro = items.reduce(
    (sum: number, it: any) => sum + listPriceMicro(it.unit_price_micro || 0) * (it.qty || 1),
    0,
  );
  const savedTotalMicro = Math.max(
    0,
    listTotalMicro - subtotalMicro + shippingDiscountMicro + productDiscountMicro,
  );

  const selectedPay = PAYMENT_METHODS.find((m) => m.id === payMethod);
  const payPreviewLabel =
    payMethod === 'promptpay'
      ? 'QR พร้อมเพย์'
      : payMethod === 'cod'
        ? 'เก็บเงินปลายทาง'
        : paymentMethodLabel(payMethod);

  useEffect(() => {
    if (payPickerOpen) document.body.classList.add('tt-modal-open');
    else document.body.classList.remove('tt-modal-open');
    return () => document.body.classList.remove('tt-modal-open');
  }, [payPickerOpen]);

  const addressReady = fullName.trim() && address.trim() && postalCode.trim() && phone.trim();

  useEffect(() => {
    if (!ownerReady || !owner || loadingCart || loadingRates || viewTelemetrySent.current || isEmpty) return;
    viewTelemetrySent.current = true;
    recordCheckoutStartTelemetry({
      loadMs: Math.round(performance.now() - viewStarted.current),
      cartCount: itemCount,
      totalMicro: grandTotalMicro,
      hasAddress: Boolean(addressReady),
      shippingReady: rates.length > 0 && !loadingRates,
      walletVisible: wallet != null,
      promoVisible: promoHints.length > 0 || Boolean(promo),
      paymentVisible: Boolean(selectedPay),
    });
  }, [
    ownerReady,
    owner,
    loadingCart,
    loadingRates,
    isEmpty,
    itemCount,
    grandTotalMicro,
    addressReady,
    rates.length,
    wallet,
    promoHints.length,
    promo,
    selectedPay,
  ]);

  const validate = () => {
    if (!fullName.trim()) return 'กรุณาระบุชื่อ-นามสกุล';
    if (!address.trim()) return 'กรุณาระบุที่อยู่จัดส่ง';
    if (!/^\d{5}$/.test(postalCode.trim())) return 'รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก';
    if (!phone.trim()) return 'กรุณาระบุเบอร์โทร';
    if (payMethod === 'cod' && selectedRate && !selectedRate.cod_supported) {
      return 'ขนส่งที่เลือกไม่รองรับ COD';
    }
    return '';
  };

  const toggleProtection = (key: string) => {
    setProtectionItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const reloadSavedAddresses = async () => {
    try {
      const v = await bffGet<any>(`/v1/checkout?owner_id=${owner}`, auth);
      const addrs = (v.addresses?.addresses || v.addresses?.items || []) as BffAddress[];
      setSavedAddresses(addrs);
      return addrs;
    } catch {
      return savedAddresses;
    }
  };

  const saveAddressForm = async () => {
    if (!fullName.trim()) {
      setAddrMsg('กรุณาระบุชื่อ-นามสกุล');
      return;
    }
    if (!address.trim()) {
      setAddrMsg('กรุณาระบุที่อยู่จัดส่ง');
      return;
    }
    if (!/^\d{5}$/.test(postalCode.trim())) {
      setAddrMsg('รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก');
      return;
    }
    if (!phone.trim()) {
      setAddrMsg('กรุณาระบุเบอร์โทร');
      return;
    }
    setAddrSaving(true);
    setAddrMsg('');
    saveAddr(owner, {
      fullName: fullName.trim(),
      address: address.trim(),
      postalCode: postalCode.trim(),
      phone: phone.trim(),
    });
    try {
      if (auth?.userId) {
        const id = await createSavedAddress(auth, {
          recipient: fullName.trim(),
          line1: address.trim(),
          postal_code: postalCode.trim(),
          phone: phone.trim(),
        });
        setAddressId(id);
        await reloadSavedAddresses();
      }
      setAddrMsg('บันทึกที่อยู่แล้ว');
      setAddrOpen(false);
    } catch {
      setAddrMsg('บันทึกในเครื่องแล้ว — สั่งซื้อได้ตามปกติ');
      setAddrOpen(false);
    } finally {
      setAddrSaving(false);
    }
  };

  const applyShopVoucher = (code: string) => {
    const isFreeShip = code === 'FREESHIP';
    setPromo({
      ok: true,
      code,
      codes: [code],
      label: 'ใช้โค้ดร้านค้าแล้ว',
      discount_micro: isFreeShip ? 0 : Math.min(subtotalMicro, Math.round(subtotalMicro * 0.1)),
    });
    setShopVoucherOpen(false);
  };

  const place = async () => {
    if (isEmpty) return;
    const msg = validate();
    if (msg) {
      setError(msg);
      setAddrOpen(true);
      return;
    }
    setPlacing(true);
    setError('');
    const creatorId = loadLastCreator();
    const baseKey = `m-co-${Date.now()}`;
    try {
      let resolvedAddressId = addressId;
      if (!resolvedAddressId && auth?.userId) {
        try {
          resolvedAddressId = await createSavedAddress(auth, {
            recipient: fullName.trim(),
            line1: address.trim(),
            postal_code: postalCode.trim(),
            phone: phone.trim(),
          });
        } catch {
          /* ใช้ที่อยู่ในฟอร์มต่อได้ */
        }
      }
      let lastResult: Awaited<ReturnType<typeof placeOrder>> | null = null;
      const orderIds: string[] = [];
      for (let i = 0; i < merchantGroups.length; i++) {
        const group = merchantGroups[i];
        const groupSubtotal = group.items.reduce(
          (sum, it: any) => sum + (it.unit_price_micro || 0) * (it.qty || 1),
          0,
        );
        const groupProtection = group.items.reduce((sum, it: any) => {
          const key = `${it.product_id}-${it.variant_id}`;
          if (!protectionItems.has(key)) return sum;
          return sum + protectionUnitMicro(it.unit_price_micro || 0) * (it.qty || 1);
        }, 0);
        const groupShipping = i === 0 ? shippingMicro : 0;
        const groupPromoCodes =
          i === 0 && promo?.ok
            ? promo.codes?.length
              ? promo.codes
              : promo.code
                ? [promo.code]
                : undefined
            : undefined;
        lastResult = await placeOrder({
          buyer_id: owner,
          merchant_id: group.merchant_id,
          merchant_name: group.merchant_name,
          method: payMethod,
          amount_micro: groupSubtotal + groupProtection,
          shipping_micro: groupShipping,
          promo_codes: groupPromoCodes,
          promo_code: groupPromoCodes?.length === 1 ? groupPromoCodes[0] : undefined,
          carrier_id: carrierId,
          currency: 'THB',
          idempotency_key: `${baseKey}-${group.merchant_id}`,
          recipient: fullName.trim(),
          shipping_address: orderNote ? `${address.trim()} | หมายเหตุ: ${orderNote}` : address.trim(),
          address_id: resolvedAddressId || undefined,
          postal_code: postalCode.trim(),
          phone: phone.trim(),
          creator_id: i === 0 ? creatorId : undefined,
          order_type: 'marketplace',
          items: group.items.map((it: any) => ({
            product_id: it.product_id,
            variant_id: it.variant_id || it.product_id,
            qty: it.qty || 1,
            unit_price_micro: it.unit_price_micro,
            title: it.title,
          })),
        });
        if (lastResult?.order_id) orderIds.push(String(lastResult.order_id));
      }
      saveAddr(owner, {
        fullName: fullName.trim(),
        address: address.trim(),
        postalCode: postalCode.trim(),
        phone: phone.trim(),
      });
      if (lastResult?.payment_action && payMethod !== 'cod') {
        sessionStorage.setItem(
          CHECKOUT_PAYMENT_KEY,
          JSON.stringify({
            action: lastResult.payment_action,
            expiresAt: Date.now() + 24 * 60 * 60 * 1000,
            orderIds,
            buyerId: owner,
          }),
        );
        router.push('/m/checkout/payment');
        return;
      }
      router.push('/m/orders');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'สั่งซื้อไม่สำเร็จ');
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="tt-co-pro" data-testid="checkout-page">
      <header className="tt-co-pro-header">
        <button type="button" className="tt-co-pro-back" onClick={() => router.back()} aria-label="กลับ">
          ‹
        </button>
        <h1>ทำการสั่งซื้อ</h1>
      </header>

      {loadingCart && <p className="tt-co-pro-loading" data-testid="checkout-loading">กำลังโหลด...</p>}

      {isEmpty && (
        <div className="tt-co-pro-empty" data-testid="checkout-empty-state">
          <p>รถเข็นว่าง — เพิ่มสินค้าก่อนสั่งซื้อ</p>
          <Link href="/m/home" className="tt-btn-primary">
            ไปช้อป
          </Link>
        </div>
      )}

      {!loadingCart && items.length > 0 && (
        <>
          <main className="tt-co-pro-main">
            <button
              type="button"
              className="tt-co-pro-addr"
              data-testid="checkout-address-card"
              onClick={() => setAddrOpen((v) => !v)}
            >
              <span className="tt-co-pro-addr-pin">📍</span>
              <div className="tt-co-pro-addr-body">
                {addressReady ? (
                  <>
                    <strong>
                      {fullName} ({phone})
                    </strong>
                    <p>
                      {address}
                      {postalCode ? `, ${postalCode}` : ''}
                    </p>
                  </>
                ) : (
                  <>
                    <strong>เพิ่มที่อยู่จัดส่ง</strong>
                    <p>แตะเพื่อกรอกชื่อ ที่อยู่ และเบอร์โทร</p>
                  </>
                )}
              </div>
              <span className="tt-co-pro-chevron">›</span>
            </button>

            {addrOpen && (
              <section className="tt-co-pro-addr-form" data-testid="checkout-address-form">
                {savedAddresses.length > 0 && (
                  <select
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
                        {a.recipient} — {a.line1?.slice(0, 36)}
                      </option>
                    ))}
                  </select>
                )}
                <input
                  className="tt-input"
                  placeholder="ชื่อ-นามสกุลผู้รับ"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
                <input
                  className="tt-input"
                  placeholder="เบอร์โทร"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <input
                  className="tt-input"
                  placeholder="ที่อยู่จัดส่ง"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
                <input
                  className="tt-input"
                  placeholder="รหัสไปรษณีย์ 5 หลัก"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
                />
                <button
                  type="button"
                  className="tt-co-pro-addr-save"
                  disabled={addrSaving}
                  onClick={() => void saveAddressForm()}
                >
                  {addrSaving ? 'กำลังบันทึก...' : 'บันทึกที่อยู่'}
                </button>
                {addrMsg && (
                  <p className="tt-co-pro-addr-msg" data-testid="checkout-address-validation-msg">
                    {addrMsg}
                  </p>
                )}
                <Link href="/m/account/addresses" className="tt-co-pro-addr-link">
                  จัดการที่อยู่ที่บันทึกไว้ ›
                </Link>
              </section>
            )}

            {merchantGroups.map((group) => (
              <section key={group.merchant_id} className="tt-co-pro-shop-card" data-testid="checkout-cart-summary">
                <div className="tt-co-pro-shop-head">
                  <span>🏪</span>
                  <strong>{merchantDisplayName(group.merchant_id, group.merchant_name)}</strong>
                </div>

                {group.items.map((it: any) => {
                  const { name, variant } = parseVariantTitle(it.title);
                  const unit = it.unit_price_micro || 0;
                  const list = listPriceMicro(unit);
                  const itemKey = `${it.product_id}-${it.variant_id}`;
                  const qty = it.qty || 1;
                  const hasProtection = protectionItems.has(itemKey);
                  const lineProtectionMicro = protectionUnitMicro(unit);
                  return (
                    <div key={itemKey} className="tt-co-pro-item-block">
                      <div className="tt-co-pro-item">
                        <div className="tt-co-pro-item-thumb">
                          {it.image_url ? (
                            <img src={it.image_url} alt="" />
                          ) : (
                            <span>📦</span>
                          )}
                        </div>
                        <div className="tt-co-pro-item-info">
                          <p className="tt-co-pro-item-title">{name}</p>
                          {variant && <p className="tt-co-pro-item-variant">{variant}</p>}
                          <span className="tt-co-pro-item-tag">0% ผ่อน 0%</span>
                          <div className="tt-co-pro-item-price-row">
                            <strong>{formatCatalogPrice(unit)}</strong>
                            {list > unit && (
                              <span className="tt-co-pro-item-list">{formatCatalogPrice(list)}</span>
                            )}
                          </div>
                        </div>
                        <span className="tt-co-pro-item-qty">x{qty}</span>
                      </div>

                      <label className="tt-co-pro-protection">
                        <input
                          type="checkbox"
                          checked={hasProtection}
                          onChange={() => toggleProtection(itemKey)}
                        />
                        <div className="tt-co-pro-protection-body">
                          <div className="tt-co-pro-protection-head">
                            <span className="tt-co-pro-protection-icon">🛡️</span>
                            <strong>ความคุ้มครองสินค้า</strong>
                            <span className="tt-co-pro-protection-rate">ร้อยละ {PROTECTION_RATE_PERCENT}%</span>
                            <span className="tt-co-pro-protection-price">
                              {formatCatalogPrice(lineProtectionMicro)} x{qty}
                            </span>
                          </div>
                          <p>
                            ฉันตกลงซื้อความคุ้มครองสินค้าจากอุบัติเหตุและโจรกรรม
                            เริ่มคุ้มครองหลังกดยืนยันรับสินค้า{' '}
                            <button
                              type="button"
                              className="tt-co-pro-protection-link"
                              onClick={(e) => e.preventDefault()}
                            >
                              เรียนรู้เพิ่มเติม
                            </button>
                          </p>
                        </div>
                      </label>
                    </div>
                  );
                })}

                <button
                  type="button"
                  className="tt-co-pro-row"
                  data-testid="checkout-coupon-shop"
                  onClick={() => setShopVoucherOpen((v) => !v)}
                >
                  <span>โค้ดส่วนลดร้านค้า</span>
                  <span className="tt-co-pro-row-action">
                    {promo?.ok ? 'ใช้แล้ว ✓' : 'กดใช้โค้ด ›'}
                  </span>
                </button>
                {shopVoucherOpen && (
                  <div className="tt-co-pro-voucher-pick">
                    {(promoHints.length
                      ? promoHints
                      : [
                          { code: 'SHOP10', label: 'ลด 10%' },
                          { code: 'FREESHIP', label: 'ส่งฟรี' },
                        ]
                    ).map((h) => (
                      <button key={h.code} type="button" onClick={() => applyShopVoucher(h.code)}>
                        {h.label} · {h.code}
                      </button>
                    ))}
                  </div>
                )}

                <button type="button" className="tt-co-pro-row" onClick={() => setNoteOpen((v) => !v)}>
                  <span>หมายเหตุ</span>
                  <span className="tt-co-pro-row-action muted">
                    {orderNote ? orderNote.slice(0, 24) : 'ฝากข้อความถึงผู้ขาย ›'}
                  </span>
                </button>
                {noteOpen && (
                  <textarea
                    className="tt-co-pro-note"
                    placeholder="ฝากข้อความถึงผู้ขายหรือบริษัทขนส่ง"
                    value={orderNote}
                    onChange={(e) => setOrderNote(e.target.value)}
                    rows={2}
                  />
                )}

                <div className="tt-co-pro-ship-head" data-testid="checkout-shipping-options">
                  <strong>ตัวเลือกการจัดส่ง</strong>
                  <span>ดูทั้งหมด ›</span>
                </div>
                {loadingRates && <p className="tt-hint" data-testid="checkout-shipping-loading">กำลังคำนวณค่าส่ง...</p>}
                {!loadingRates &&
                  rates.map((r) => {
                    const active = carrierId === r.carrier_id;
                    return (
                      <button
                        key={r.carrier_id}
                        type="button"
                        data-testid={`checkout-shipping-rate-${r.carrier_id}`}
                        className={`tt-co-pro-ship${active ? ' active' : ''}`}
                        onClick={() => setCarrierId(r.carrier_id)}
                      >
                        <div>
                          <strong>🚚 {tomorrowLabel()}</strong>
                          <p>{r.name} · Express Delivery</p>
                          <p className="tt-co-pro-ship-hint">
                            กรุณาเช็กหมุดที่อยู่ให้ถูกต้องก่อนชำระสินค้า
                          </p>
                        </div>
                        <div className="tt-co-pro-ship-price">
                          {shippingFree || r.shipping_micro === 0 ? (
                            <>
                              {r.shipping_micro > 0 && (
                                <span className="strike">{formatCatalogPrice(r.shipping_micro)}</span>
                              )}
                              <strong>ส่งฟรี</strong>
                            </>
                          ) : (
                            <strong>{formatCatalogPrice(r.shipping_micro)}</strong>
                          )}
                        </div>
                      </button>
                    );
                  })}
                <p className="tt-co-pro-late">รับโค้ดส่วนลด ฿30 หากได้รับสินค้าล่าช้า</p>

                <div className="tt-co-pro-subtotal">
                  <span>สินค้ารวม {itemCount} ชิ้น</span>
                  <strong>{formatCatalogPrice(subtotalMicro)}</strong>
                </div>
              </section>
            ))}

            <section className="tt-co-pro-platform-voucher" data-testid="checkout-coupon-platform">
              <div className="tt-co-pro-platform-head">
                <span>🎫</span>
                <div>
                  <strong>โค้ดส่วนลด AQOND</strong>
                  <div className="tt-co-pro-voucher-tags">
                    {discountMicro > 0 && <span>-{formatCatalogPrice(discountMicro)}</span>}
                    {shippingFree && <span>โค้ดส่งฟรี</span>}
                  </div>
                </div>
                <span className="tt-co-pro-chevron">›</span>
              </div>
              <div className="tt-co-pro-banners" data-testid="checkout-promotion-banners">
                <div className="tt-co-pro-banner tt-co-pro-banner--vip">VIP ส่งฟรี</div>
                <div className="tt-co-pro-banner tt-co-pro-banner--sale">ลด 50%</div>
                <div className="tt-co-pro-banner tt-co-pro-banner--ship">ลด 30%</div>
              </div>
            </section>

            <section className="tt-co-pro-coins" data-testid="checkout-wallet-section">
              <span>🪙</span>
              {wallet ? (
                <p>
                  กระเป๋า AQOND · ยอด {formatCatalogPrice(wallet.balance_micro || 0)} · Coins{' '}
                  {wallet.coins ?? 0}
                  {(wallet.coupons?.length || 0) > 0 ? ` · คูปอง ${wallet.coupons?.length}` : ''}
                </p>
              ) : (
                <p>ไม่สามารถใช้ AQOND Coins ในคำสั่งซื้อนี้</p>
              )}
            </section>

            <section className="tt-co-pro-pay-section" data-testid="checkout-payment-methods">
              <div className="tt-co-pro-pay-head">
                <strong>ช่องทางการชำระเงิน</strong>
                <button type="button" onClick={() => setPayPickerOpen(true)}>
                  ดูทั้งหมด ›
                </button>
              </div>

              <button
                type="button"
                className="tt-co-pro-pay-selected"
                data-testid="checkout-payment-selected"
                onClick={() => setPayPickerOpen(true)}
              >
                <span>{selectedPay?.icon || '📱'}</span>
                <div>
                  <strong>{payPreviewLabel}</strong>
                  <p>{selectedPay?.sub || 'เลือกวิธีชำระเงิน'}</p>
                </div>
                <span className="tt-co-pro-pay-check">✓</span>
              </button>

              <div className="tt-co-pro-pay-promo">
                <div>
                  <strong>AQOND Pay</strong>
                  <p>เปิดใช้งานเพื่อชำระได้เร็วขึ้น</p>
                </div>
                <button type="button" className="tt-co-pro-pay-promo-btn">
                  เปิดใช้งาน
                </button>
              </div>

              <div className="tt-co-pro-pay-promo tt-co-pro-pay-promo--muted">
                <div>
                  <strong>ผ่อน 0%</strong>
                  <p>0% ผ่อน 0% · สูงสุด 5 เดือน</p>
                </div>
                <button type="button" className="tt-co-pro-pay-promo-btn">
                  เปิดใช้งาน
                </button>
              </div>
            </section>

            <section className="tt-co-pro-summary" data-testid="checkout-payment-summary">
              <h2>ข้อมูลการชำระเงิน</h2>
              <div className="tt-co-pro-summary-row">
                <span>รวมการสั่งซื้อ</span>
                <span>{formatCatalogPrice(subtotalMicro)}</span>
              </div>
              <div className="tt-co-pro-summary-row">
                <span>การจัดส่ง</span>
                <span>{formatCatalogPrice(shippingMicro)}</span>
              </div>
              {shippingDiscountMicro > 0 && (
                <div className="tt-co-pro-summary-row discount">
                  <span>ส่วนลดค่าจัดส่ง</span>
                  <span>-{formatCatalogPrice(shippingDiscountMicro)}</span>
                </div>
              )}
              {productDiscountMicro > 0 && (
                <div className="tt-co-pro-summary-row discount">
                  <span>ส่วนลด</span>
                  <span>-{formatCatalogPrice(productDiscountMicro)}</span>
                </div>
              )}
              {protectionMicro > 0 && (
                <div className="tt-co-pro-summary-row">
                  <span>ความคุ้มครองสินค้า</span>
                  <span>{formatCatalogPrice(protectionMicro)}</span>
                </div>
              )}
              <div className="tt-co-pro-summary-row total">
                <span>ยอดชำระเงินทั้งหมด</span>
                <strong>{formatCatalogPrice(grandTotalMicro)}</strong>
              </div>
            </section>

            <p className="tt-co-pro-terms">
              การกดปุ่ม &quot;สั่งสินค้า&quot; ถือว่าคุณยอมรับข้อกำหนดการให้บริการและนโยบายความเป็นส่วนตัวของ
              AQOND
            </p>

            {error && (
              <p className="tt-error tt-co-pro-error" data-testid="checkout-address-error">
                {error}
              </p>
            )}
          </main>

          <CoPaymentPicker
            open={payPickerOpen}
            value={payMethod}
            orderTotalMicro={grandTotalMicro}
            onClose={() => setPayPickerOpen(false)}
            onConfirm={(id) => {
              setPayMethod(id);
              setPayPickerOpen(false);
            }}
          />

          <footer className="tt-co-pro-footer">
            <div className="tt-co-pro-footer-sum">
              <p>
                รวมยอดสั่งซื้อ <strong>{formatCatalogPrice(grandTotalMicro)}</strong>
              </p>
              {savedTotalMicro > 0 && (
                <span className="tt-co-pro-saved">ประหยัดไป {formatCatalogPrice(savedTotalMicro)}</span>
              )}
            </div>
            <button
              type="button"
              className="tt-co-pro-place"
              data-testid="checkout-place-cta"
              disabled={placing}
              onClick={() => void place()}
            >
              {placing ? 'กำลังสั่ง...' : 'สั่งสินค้า'}
            </button>
          </footer>
        </>
      )}
    </div>
  );
}
