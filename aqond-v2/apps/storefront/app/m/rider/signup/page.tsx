'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { PARTNER_ACTIVATE } from '@/lib/authMessaging';
import { useRider } from '@/components/mobile/RiderShell';

export default function RiderSignupPage() {
  const router = useRouter();
  const { auth } = useAuth();
  const { profile, profileLoading, refreshProfile } = useRider();
  const [form, setForm] = useState({
    display_name: '',
    phone: '',
    vehicle: 'motorcycle',
    plate: '',
    bank_account: '',
  });
  const [prefilled, setPrefilled] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!auth?.userId || prefilled) return;
    let alive = true;
    void fetch(`/api/onboarding/compass-kyc-prefill?userId=${encodeURIComponent(auth.userId)}`, {
      headers: {
        ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
        'X-User-Id': auth.userId,
      },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive || !data) return;
        setForm((prev) => ({
          display_name: data.display_name || prev.display_name,
          phone: data.phone || prev.phone,
          vehicle: data.vehicle || prev.vehicle,
          plate: data.plate || prev.plate,
          bank_account: data.bank_account || prev.bank_account,
        }));
        setPrefilled(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [auth?.userId, auth?.token, prefilled]);

  const submit = async () => {
    if (!auth) {
      setErr('กรุณาเข้าสู่ระบบก่อน');
      return;
    }
    if (profile?.rider_id) {
      setErr('บัญชีนี้มีผู้ให้บริการแล้ว — 1 บัญชีต่อ 1 คน ไม่สามารถสมัครซ้ำได้');
      return;
    }
    setErr('');
    try {
      const res = await fetch('/api/rider/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
          'X-User-Id': auth.userId,
        },
        body: JSON.stringify({ ...form, user_id: auth.userId }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setErr(data.message || 'บัญชีนี้มีผู้ให้บริการแล้ว');
        await refreshProfile();
        return;
      }
      if (!res.ok) throw new Error(data.message || data.error || 'สมัครไม่สำเร็จ');
      setMsg(
        data.message ||
          'ส่งข้อมูลแล้ว — แอดมินจะตรวจสอบใน Nexus Admin (KYC Review)',
      );
      await refreshProfile();
      setTimeout(() => router.push('/m/rider/jobs'), 1500);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'สมัครไม่สำเร็จ');
    }
  };

  return (
    <>
      <header className="tt-header">
        <div className="tt-header-row">
          <Link href="/m/rider/jobs" className="tt-back">‹</Link>
          <span style={{ flex: 1, fontWeight: 700 }}>{PARTNER_ACTIVATE.delivery}</span>
        </div>
      </header>
      <div style={{ padding: 16 }}>
        {!auth && <p className="tt-hint"><Link href="/m/login?next=/m/rider/signup">เข้าสู่ระบบ</Link> ก่อนเปิดใช้งาน (ใช้บัญชี AQOND เดิม)</p>}
        <p className="tt-hint" style={{ marginBottom: 12 }}>
          {PARTNER_ACTIVATE.deliveryDesc} — 1 บัญชี AQOND ต่อ 1 ผู้ให้บริการ ตามกฎหมายยืนยันตัวตน
        </p>
        {profileLoading && <p className="tt-hint">กำลังตรวจสอบสถานะ…</p>}
        {profile?.rider_id && (
          <p className="tt-hint">
            บัญชีนี้ลงทะเบียนผู้ให้บริการแล้ว — <Link href="/m/rider/jobs">กลับไปหน้างาน</Link>
          </p>
        )}
        {!profile?.rider_id && (
          <>
            {prefilled && (
              <p className="tt-hint" style={{ marginBottom: 8 }}>
                ดึงข้อมูลจาก KYC บนแอปมาให้แล้ว — ตรวจสอบก่อนส่ง
              </p>
            )}
            <input className="tt-input" placeholder="ชื่อที่แสดง" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
            <input className="tt-input" placeholder="เบอร์โทร" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={{ marginTop: 8 }} />
            <input className="tt-input" placeholder="ทะเบียนรถ" value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} style={{ marginTop: 8 }} />
            <input className="tt-input" placeholder="บัญชีรับเงิน" value={form.bank_account} onChange={(e) => setForm({ ...form, bank_account: e.target.value })} style={{ marginTop: 8 }} />
            <button type="button" className="tt-btn-primary" style={{ width: '100%', marginTop: 16 }} onClick={() => void submit()}>
              ส่งข้อมูลยืนยันตัวตน
            </button>
          </>
        )}
        {msg && <p className="tt-merchant-ok">{msg}</p>}
        {err && <p className="tt-error-inline">{err}</p>}
      </div>
    </>
  );
}
