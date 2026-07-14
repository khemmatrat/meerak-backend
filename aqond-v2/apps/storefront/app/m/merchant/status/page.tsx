'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import {
  fetchMerchantAudit,
  fetchShopOps,
  setShopBusyMode,
  toggleShopEmergencyClose,
  updateShopOpsSettings,
} from '@/lib/merchant';
import { useMerchant } from '@/components/mobile/MerchantShell';

export default function MerchantStatusPage() {
  const { auth } = useAuth();
  const actor = auth?.userId || 'merchant';
  const { merchantId, merchantName, isFoodMerchant, refreshShops, permissions } = useMerchant();
  const [state, setState] = useState<any>(null);
  const [audit, setAudit] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [autoSchedule, setAutoSchedule] = useState(true);
  const [autoAccept, setAutoAccept] = useState(false);
  const [openTime, setOpenTime] = useState('09:00');
  const [closeTime, setCloseTime] = useState('21:00');
  const [closeNote, setCloseNote] = useState('');
  const canManageSettings = permissions?.can_manage_shop_settings !== false;

  const reload = useCallback(() => {
    setLoading(true);
    fetchShopOps(merchantId)
      .then((d) => {
        setState(d);
        setAutoSchedule(!!d.ops?.auto_schedule);
        setAutoAccept(!!d.ops?.auto_accept_orders);
        setOpenTime(d.ops?.open_time || '09:00');
        setCloseTime(d.ops?.close_time || '21:00');
        setCloseNote(d.ops?.closed_note || '');
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
    fetchMerchantAudit(merchantId)
      .then((d) => setAudit(d.events || []))
      .catch(() => setAudit([]));
  }, [merchantId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const saveSchedule = async () => {
    setSaving(true);
    setErr('');
    setMsg('');
    try {
      const r = await updateShopOpsSettings(merchantId, {
        auto_schedule: autoSchedule,
        open_time: openTime,
        close_time: closeTime,
      });
      setState((s: any) => ({ ...s, ...r, label: r.label }));
      setMsg('บันทึกเวลาเปิด-ปิดแล้ว');
      refreshShops();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const flipEmergency = async (closed: boolean) => {
    setSaving(true);
    setErr('');
    setMsg('');
    try {
      const r = await toggleShopEmergencyClose(
        merchantId,
        closed,
        closeNote || (closed ? 'วัตถุดิบไม่พร้อม / ของหมด' : ''),
        actor,
      );
      setState((s: any) => ({
        ...s,
        effective_open: r.effective_open,
        label: r.label,
        ops: r.ops,
      }));
      setMsg(closed ? 'ปิดร้านฉุกเฉินแล้ว' : 'เปิดร้านแล้ว');
      refreshShops();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const activateBusyMode = async (minutes: 0 | 15 | 30) => {
    setSaving(true);
    setErr('');
    setMsg('');
    try {
      const r = await setShopBusyMode(merchantId, minutes, actor);
      setState((s: any) => ({ ...s, label: r.label, ops: r.ops, busy_extra_min: r.ops?.busy_extra_minutes || 0 }));
      setMsg(minutes ? `โหมดคิวเยอะ +${minutes} นาที — ลูกค้าเห็น ETA ใหม่` : 'ปิดโหมดคิวเยอะแล้ว');
      refreshShops();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const saveAutoAccept = async (on: boolean) => {
    setSaving(true);
    setErr('');
    setMsg('');
    try {
      const r = await updateShopOpsSettings(merchantId, { auto_accept_orders: on });
      setAutoAccept(on);
      setState((s: any) => ({ ...s, ops: r.ops }));
      setMsg(on ? 'เปิดรับออเดอร์อัตโนมัติแล้ว' : 'ปิดรับออเดอร์อัตโนมัติแล้ว');
      refreshShops();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const open = state?.effective_open ?? true;
  const manualClosed = state?.ops?.manual_closed ?? false;

  return (
    <div className="tt-merchant-status-page">
      <h1 className="tt-merchant-page-title">🕐 สถานะร้าน</h1>
      <p className="tt-merchant-sub">{merchantName}</p>

      {loading && <p className="tt-loading">กำลังโหลด…</p>}
      {msg && <p className="tt-merchant-ok">{msg}</p>}
      {err && <p className="tt-error-inline">{err}</p>}

      {!loading && state && (
        <>
          <div className={`tt-merchant-status-banner${open ? ' open' : ' closed'}`}>
            <span className="tt-merchant-status-dot" aria-hidden />
            <div>
              <strong>{open ? 'เปิดรับออเดอร์' : 'ปิดรับออเดอร์'}</strong>
              <p className="tt-hint">{state.label}</p>
            </div>
          </div>

          {isFoodMerchant && (
            <section className="tt-merchant-status-card">
              <h2>⚡ รับออเดอร์อัตโนมัติ</h2>
              <p className="tt-hint">สำหรับร้านที่มั่นใจในสต็อก — ออเดอร์ใหม่จะถูกรับทันทีเมื่อรีเฟรชคิว</p>
              {!canManageSettings && (
                <p className="tt-merchant-warn">บัญชีพนักงาน — ไม่มีสิทธิ์เปลี่ยนการตั้งค่า</p>
              )}
              <label className="tt-merchant-emergency-row">
                <span>{autoAccept ? '🟢 เปิดอยู่' : '⚪ ปิดอยู่'}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoAccept}
                  className={`tt-merchant-switch${autoAccept ? ' on' : ''}`}
                  disabled={saving || !canManageSettings}
                  onClick={() => void saveAutoAccept(!autoAccept)}
                >
                  <span className="tt-merchant-switch-knob" />
                </button>
              </label>
            </section>
          )}

          <section className="tt-merchant-status-card">
            <h2>⚡ ปิดร้านฉุกเฉิน</h2>
            <p className="tt-hint">กรณีวัตถุดิบไม่พร้อม หรือร้านของหมดทั้งร้าน — กดสวิตช์ด้านล่าง</p>
            <label className="tt-merchant-emergency-row">
              <span>{manualClosed ? '🔴 ปิดอยู่' : '🟢 เปิดอยู่'}</span>
              <button
                type="button"
                role="switch"
                aria-checked={manualClosed}
                className={`tt-merchant-switch${manualClosed ? ' on danger' : ''}`}
                disabled={saving || !canManageSettings}
                onClick={() => void flipEmergency(!manualClosed)}
              >
                <span className="tt-merchant-switch-knob" />
              </button>
            </label>
            <label className="tt-menu-field">
              <span>หมายเหตุ (ไม่บังคับ)</span>
              <input
                className="tt-input tt-menu-input"
                placeholder="เช่น วัตถุดิบหมด / พักเที่ยง"
                value={closeNote}
                onChange={(e) => setCloseNote(e.target.value)}
              />
            </label>
          </section>

          {isFoodMerchant && (
            <section className="tt-merchant-status-card">
              <h2>🔥 โหมดคิวเยอะ</h2>
              <p className="tt-hint">เพิ่มเวลาเตรียมอาหาร — ลูกค้าเห็น ETA ใหม่ทันที</p>
              <div className="tt-busy-mode-row">
                <button type="button" className="tt-btn-ghost" disabled={saving || !canManageSettings} onClick={() => void activateBusyMode(15)}>
                  +15 นาที
                </button>
                <button type="button" className="tt-btn-primary" disabled={saving || !canManageSettings} onClick={() => void activateBusyMode(30)}>
                  +30 นาที
                </button>
                <button type="button" className="tt-btn-ghost" disabled={saving || !canManageSettings} onClick={() => void activateBusyMode(0)}>
                  ปิดโหมด
                </button>
              </div>
              {(state.busy_extra_min > 0 || state.ops?.busy_mode) && (
                <p className="tt-merchant-ok">กำลัง +{state.busy_extra_min || state.ops?.busy_extra_minutes} นาที</p>
              )}
            </section>
          )}

          <section className="tt-merchant-status-card">
            <h2>📅 เปิด-ปิดอัตโนมัติ</h2>
            <p className="tt-hint">{state.schedule_hint || 'เวลาไทย (ICT) Asia/Bangkok'}</p>
            <label className="tt-merchant-check-row">
              <input
                type="checkbox"
                checked={autoSchedule}
                onChange={(e) => setAutoSchedule(e.target.checked)}
              />
              ใช้ตารางเวลาเปิด-ปิดอัตโนมัติ
            </label>
            <div className="tt-merchant-hours-row">
              <label className="tt-menu-field">
                <span>เปิด</span>
                <input
                  type="time"
                  className="tt-input tt-menu-input"
                  value={openTime}
                  onChange={(e) => setOpenTime(e.target.value)}
                  disabled={!autoSchedule}
                />
              </label>
              <span className="tt-merchant-hours-sep">ถึง</span>
              <label className="tt-menu-field">
                <span>ปิด</span>
                <input
                  type="time"
                  className="tt-input tt-menu-input"
                  value={closeTime}
                  onChange={(e) => setCloseTime(e.target.value)}
                  disabled={!autoSchedule}
                />
              </label>
            </div>
            <p className="tt-hint">รองรับร้านเปิดข้ามเที่ยงคืน (เช่น 18:00–02:00)</p>
            <button type="button" className="tt-btn-primary" disabled={saving || !canManageSettings} onClick={() => void saveSchedule()}>
              บันทึกเวลา
            </button>
          </section>

          <section className="tt-audit-section">
            <h2>📜 Audit log</h2>
            <p className="tt-hint">ใครปิดร้าน / ของหมด / โปร — เมื่อไหร่</p>
            {audit.length === 0 && <p className="tt-hint">ยังไม่มีบันทึก</p>}
            <ul className="tt-audit-list">
              {audit.slice(0, 20).map((ev) => (
                <li key={ev.id}>
                  <strong>{ev.summary}</strong>
                  <span className="tt-hint">
                    {ev.actor} · {new Date(ev.at).toLocaleString('th-TH')}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <p className="tt-hint tt-merchant-status-foot">
            ทำเครื่องหมายรายการของหมดได้ที่แท็บ {isFoodMerchant ? 'เมนูอาหาร' : 'สินค้า'}
          </p>
        </>
      )}
    </div>
  );
}
