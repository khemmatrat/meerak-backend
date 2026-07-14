'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import Link from 'next/link';
import {
  createMerchantShop,
  fetchMerchantDashboard,
  purchaseMerchantSlot,
} from '@/lib/merchant';
import {
  ALERT_SOUNDS,
  getShopAlertSettings,
  previewAlertSound,
  setShopAlertSettings,
  type AlertSoundId,
  type ShopAlertSettings,
} from '@/lib/merchantAlerts';
import { useMerchant } from '@/components/mobile/MerchantShell';
import { requestMerchantPushPermission } from '@/lib/merchantPush';
import { AxsMerchantLoading } from '@/components/axs/merchant/AxsMerchantLoading';

export default function MerchantShopsPage() {
  const { auth } = useAuth();
  const { refreshShops, merchantId } = useMerchant();
  const ownerId = auth?.userId || 'guest';
  const [dash, setDash] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<'food' | 'marketplace'>('food');
  const [busy, setBusy] = useState(false);
  const [alertMap, setAlertMap] = useState<Record<string, ShopAlertSettings>>({});

  const reload = useCallback(() => {
    setLoading(true);
    fetchMerchantDashboard(ownerId)
      .then((d) => {
        setDash(d);
        const alerts: Record<string, ShopAlertSettings> = {};
        for (const s of d.accessible_shops || []) {
          alerts[s.id] = getShopAlertSettings(s.id);
        }
        setAlertMap(alerts);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [ownerId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const onCreate = async () => {
    if (!name.trim()) {
      setErr('กรุณาระบุชื่อร้าน');
      return;
    }
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const r = await createMerchantShop({ owner_id: ownerId, name, type });
      setMsg(r.message || 'ส่งคำขอแล้ว');
      setName('');
      reload();
      refreshShops();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const onBuySlot = async () => {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const r = await purchaseMerchantSlot(ownerId);
      setMsg(r.message || 'ซื้อสล็อตแล้ว');
      reload();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleAlert = (shopId: string) => {
    const cur = alertMap[shopId] || getShopAlertSettings(shopId);
    const next = { ...cur, enabled: !cur.enabled };
    setShopAlertSettings(shopId, next);
    setAlertMap((m) => ({ ...m, [shopId]: next }));
    if (next.enabled) previewAlertSound(next.soundId);
  };

  const changeSound = (shopId: string, soundId: AlertSoundId) => {
    const cur = alertMap[shopId] || getShopAlertSettings(shopId);
    const next = { ...cur, soundId };
    setShopAlertSettings(shopId, next);
    setAlertMap((m) => ({ ...m, [shopId]: next }));
    previewAlertSound(soundId);
  };

  const usage = dash?.usage;
  const slotPrice = dash?.slot_price_baht ?? 699;

  return (
    <div className="tt-merchant-shops-page">
      <h1 className="tt-merchant-page-title">⚙️ จัดการร้านค้า</h1>
      <p className="tt-merchant-sub">
        เปิดได้ฟรี {dash?.free_slots ?? 5} ร้าน (รอ admin อนุมัติ) · ร้านที่ 6+ ซื้อสล็อต ฿{slotPrice} ถาวร
      </p>

      {loading && <AxsMerchantLoading label="กำลังโหลดร้าน…" />}
      {msg && <p className="tt-merchant-ok">{msg}</p>}
      {err && <p className="tt-error-inline">{err}</p>}

      {usage && (
        <div className="tt-merchant-slot-card">
          <p><strong>สล็อตร้าน</strong> {usage.used}/{usage.max}</p>
          <p className="tt-hint">อนุมัติแล้ว {usage.approved} · รออนุมัติ {usage.pending} · ซื้อเพิ่ม {usage.extra_slots} สล็อต</p>
          {usage.used >= usage.max && usage.max < (dash?.max_slots ?? 30) && (
            <button type="button" className="tt-btn-primary" disabled={busy} onClick={() => void onBuySlot()}>
              ซื้อสล็อตเพิ่ม ฿{slotPrice}
            </button>
          )}
        </div>
      )}

      <section className="tt-merchant-shops-section">
        <h2>➕ เปิดร้านบน AQOND</h2>
        <div className="tt-merchant-menu-form">
          <input
            className="tt-review-input"
            placeholder="ชื่อร้าน"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="tt-merchant-checks">
            <label><input type="radio" checked={type === 'food'} onChange={() => setType('food')} /> อาหาร</label>
            <label><input type="radio" checked={type === 'marketplace'} onChange={() => setType('marketplace')} /> มาร์เก็ตเพลส</label>
          </div>
          <button type="button" className="tt-btn-primary" disabled={busy} onClick={() => void onCreate()}>
            ส่งคำขอเปิดร้าน
          </button>
          <p className="tt-hint">คำขอจะส่งให้ admin ตรวจสอบก่อนเปิดใช้งาน</p>
        </div>
      </section>

      {(dash?.pending_shops?.length ?? 0) > 0 && (
        <section className="tt-merchant-shops-section">
          <h2>⏳ รอ admin อนุมัติ</h2>
          <p className="tt-hint">
            ทีม AQOND กำลังตรวจสอบคำขอ — จะแจ้งเมื่ออนุมัติแล้ว (โดยทั่วไปภายใน 24 ชม.)
          </p>
          <ul className="tt-merchant-shop-list">
            {dash.pending_shops.map((s: any) => (
              <li key={s.id} className="tt-merchant-shop-row">
                <div>
                  <strong>{s.name}</strong>
                  <span className="tt-hint"> · {s.type === 'food' ? 'อาหาร' : 'มาร์เก็ต'}</span>
                </div>
                <span className="tt-hint">รอตรวจสอบ</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="tt-merchant-shops-section">
        <h2>🔔 Web Push แจ้งออเดอร์</h2>
        <p className="tt-hint">ลงทะเบียน FCM — รับ push จากเซิร์ฟเวอร์เมื่อมีออเดอร์ใหม่ (ลดการ poll)</p>
        <button
          type="button"
          className="tt-btn-primary"
          onClick={() => {
            if (!auth) {
              setMsg('กรุณาเข้าสู่ระบบก่อน');
              return;
            }
            void requestMerchantPushPermission(auth).then((ok) => {
              if (ok) setMsg('เปิด FCM / Web Push แล้ว');
            });
          }}
        >
          เปิดการแจ้งเตือน
        </button>
      </section>

      <section className="tt-merchant-shops-section">
        <h2>🔔 เสียงแจ้งเตือนแต่ละร้าน</h2>
        <p className="tt-hint tt-merchant-alert-hint">เลือกเสียงคนละแบบเพื่อรู้ทันทีว่าร้านไหนมีออเดอร์เข้า</p>
        <ul className="tt-merchant-shop-list">
          {(dash?.accessible_shops || []).map((s: any) => {
            const settings = alertMap[s.id] || getShopAlertSettings(s.id);
            const soundMeta = ALERT_SOUNDS.find((x) => x.id === settings.soundId) || ALERT_SOUNDS[0];
            return (
              <li key={s.id} className="tt-merchant-shop-row tt-merchant-alert-row">
                <div className="tt-merchant-alert-info">
                  <strong>{s.name}</strong>
                  {s.id === merchantId && <span className="tt-hint"> (กำลังเลือก)</span>}
                  <div className="tt-merchant-alert-controls">
                    <label className="tt-merchant-alert-toggle">
                      <input
                        type="checkbox"
                        checked={settings.enabled}
                        onChange={() => toggleAlert(s.id)}
                      />
                      {settings.enabled ? '🔊 เปิด' : '🔇 ปิด'}
                    </label>
                    <select
                      className="tt-merchant-sound-select"
                      value={settings.soundId}
                      disabled={!settings.enabled}
                      onChange={(e) => changeSound(s.id, e.target.value as AlertSoundId)}
                      aria-label={`เสียงแจ้งเตือน ${s.name}`}
                    >
                      {ALERT_SOUNDS.map((snd) => (
                        <option key={snd.id} value={snd.id}>
                          {snd.icon} {snd.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="tt-btn-ghost tt-merchant-sound-test"
                      disabled={!settings.enabled}
                      onClick={() => previewAlertSound(settings.soundId)}
                      title={`ทดสอบ ${soundMeta.label}`}
                    >
                      ▶ ทดสอบ
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
