'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { fcmWebConfigured, registerFcmForAuth } from '@/lib/fcmWeb';
import {
  getLineLoginUrl,
  getLineStatus,
  getPushStatus,
  linkLineManual,
  type LineStatus,
  type PushStatus,
} from '@/lib/notifyClient';

export default function NotificationsSettingsPage() {
  const { auth } = useAuth();
  const router = useRouter();
  const [push, setPush] = useState<PushStatus | null>(null);
  const [line, setLine] = useState<LineStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [devLineId, setDevLineId] = useState('');
  const fcmReady = fcmWebConfigured();

  const load = useCallback(async () => {
    if (!auth) return;
    setErr('');
    try {
      const [p, l] = await Promise.all([getPushStatus(auth), getLineStatus(auth)]);
      setPush(p);
      setLine(l);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'โหลดสถานะไม่สำเร็จ');
    }
  }, [auth]);

  useEffect(() => {
    if (!auth) {
      router.replace('/m/login');
      return;
    }
    void load();
  }, [auth, load, router]);

  const registerWebPush = async () => {
    if (!auth) return;
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      if (!fcmReady) {
        setErr('ตั้งค่า NEXT_PUBLIC_FIREBASE_API_KEY และ NEXT_PUBLIC_FIREBASE_VAPID_KEY ใน .env');
        return;
      }
      await registerFcmForAuth(auth, { platform: 'web' });
      setMsg('ลงทะเบียน FCM Web Push แล้ว — จะได้รับแจ้งเตือนจากเซิร์ฟเวอร์จริง');
      await load();
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : '';
      if (raw.includes('permission')) {
        setErr('กรุณาอนุญาตการแจ้งเตือนในเบราว์เซอร์');
      } else {
        setErr(raw || 'ลงทะเบียน Push ไม่สำเร็จ');
      }
    } finally {
      setBusy(false);
    }
  };

  const connectLineOAuth = async () => {
    if (!auth) return;
    setBusy(true);
    setErr('');
    try {
      const redirectUri = `${window.location.origin}/m/account/notifications/line-callback`;
      const res = await getLineLoginUrl(auth, redirectUri);
      if (res.ok && res.url) {
        window.location.href = res.url;
        return;
      }
      setErr(res.message || 'LINE Login ยังไม่ได้ตั้งค่า — ใช้โหมด dev ด้านล่าง');
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'เปิด LINE Login ไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const connectLineDev = async () => {
    if (!auth || !devLineId.trim()) {
      setErr('กรอก LINE User ID สำหรับ dev');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      await linkLineManual(auth, devLineId.trim(), 'LINE (dev)');
      setMsg('เชื่อม LINE สำเร็จ');
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'เชื่อม LINE ไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="tt-header">
        <div className="tt-header-row">
          <Link href="/m/account" className="tt-back">‹</Link>
          <span style={{ flex: 1, fontWeight: 700 }}>การแจ้งเตือน</span>
        </div>
      </header>

      <div style={{ padding: 16 }}>
        <p className="tt-hint" style={{ marginBottom: 16 }}>
          รับแจ้งเตือนเมื่อชำระเงิน PaySo สำเร็จ ร้านรับออเดอร์ และไรเดอร์กำลังส่ง
        </p>

        <section className="tt-menu-list" style={{ marginBottom: 20 }}>
          <div className="tt-menu-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
            <strong>Push (FCM Web)</strong>
            <p className="tt-hint" style={{ margin: 0 }}>
              {push?.push_enabled
                ? `ลงทะเบียนแล้ว (${push.devices?.length || 0} อุปกรณ์)`
                : 'ยังไม่ได้ลงทะเบียน'}
            </p>
            {!fcmReady && (
              <p className="tt-hint" style={{ margin: 0, color: '#c45c00' }}>
                ต้องตั้งค่า Firebase API Key + VAPID key ใน infra/.env
              </p>
            )}
            <button
              type="button"
              className="tt-btn-primary"
              disabled={busy || !fcmReady}
              onClick={() => void registerWebPush()}
            >
              {push?.push_enabled ? 'อัปเดต FCM Token' : 'เปิด Push แจ้งเตือน (FCM)'}
            </button>
          </div>
        </section>

        <section className="tt-menu-list" style={{ marginBottom: 20 }}>
          <div className="tt-menu-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
            <strong>LINE Official Account</strong>
            <p className="tt-hint" style={{ margin: 0 }}>
              {line?.line_linked
                ? `เชื่อมแล้ว${line.display_name ? `: ${line.display_name}` : ''}`
                : 'ยังไม่ได้เชื่อม LINE'}
            </p>
            <button type="button" className="tt-btn-primary" disabled={busy} onClick={() => void connectLineOAuth()}>
              เชื่อมด้วย LINE Login
            </button>
            <p className="tt-hint" style={{ margin: '8px 0 4px' }}>โหมด dev (ทดสอบ local):</p>
            <input
              className="tt-input"
              placeholder="LINE User ID (Uxxxxxxxx...)"
              value={devLineId}
              onChange={(e) => setDevLineId(e.target.value)}
            />
            <button type="button" className="tt-btn-ghost" disabled={busy} onClick={() => void connectLineDev()}>
              บันทึก LINE ID (dev)
            </button>
          </div>
        </section>

        {msg && <p className="tt-hint" style={{ color: 'var(--tt-accent, #2a9d8f)' }}>{msg}</p>}
        {err && <p className="tt-error-inline">{err}</p>}
      </div>
    </>
  );
}
