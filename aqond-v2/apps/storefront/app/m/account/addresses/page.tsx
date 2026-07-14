'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { bffGet, bffPost } from '@/lib/bff';

type Address = {
  id: string;
  label?: string;
  recipient: string;
  phone: string;
  line1: string;
  district?: string;
  province?: string;
  postal_code?: string;
};

export default function AddressesPage() {
  const { auth } = useAuth();
  const [list, setList] = useState<Address[]>([]);
  const [form, setForm] = useState({ recipient: '', phone: '', line1: '', postal_code: '' });
  const [err, setErr] = useState('');

  const reload = () => {
    if (!auth) return;
    bffGet<{ addresses?: { addresses?: Address[]; items?: Address[] } }>(
      `/v1/account?user_id=${encodeURIComponent(auth.userId)}`,
      auth,
    )
      .then((d) => {
        const raw = d.addresses;
        const arr = raw?.addresses || raw?.items || [];
        setList(arr);
      })
      .catch(() => setList([]));
  };

  useEffect(() => {
    reload();
  }, [auth]);

  const save = async () => {
    if (!auth) return;
    setErr('');
    try {
      await bffPost('/v1/account/address', {
        owner_id: auth.userId,
        recipient: form.recipient,
        phone: form.phone,
        line1: form.line1,
        postal_code: form.postal_code,
        country: 'TH',
        label: 'บ้าน',
      }, auth);
      setForm({ recipient: '', phone: '', line1: '', postal_code: '' });
      reload();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    }
  };

  if (!auth) {
    return (
      <div style={{ padding: 16 }}>
        <p>กรุณาเข้าสู่ระบบก่อน</p>
        <Link href="/m/login" className="tt-link-accent">เข้าสู่ระบบ</Link>
      </div>
    );
  }

  return (
    <>
      <header className="tt-header">
        <div className="tt-header-row">
          <Link href="/m/account" className="tt-back">‹</Link>
          <span style={{ flex: 1, fontWeight: 700 }}>ที่อยู่จัดส่ง</span>
        </div>
      </header>
      <div style={{ padding: 16 }}>
        {list.map((a) => (
          <div key={a.id} className="tt-merchant-order-card" style={{ marginBottom: 8 }}>
            <strong>{a.recipient}</strong>
            <p className="tt-hint">{a.phone}</p>
            <p>{a.line1} {a.postal_code}</p>
          </div>
        ))}
        <h3 className="tt-merchant-page-title">เพิ่มที่อยู่</h3>
        <input className="tt-input" placeholder="ชื่อผู้รับ" value={form.recipient} onChange={(e) => setForm({ ...form, recipient: e.target.value })} />
        <input className="tt-input" placeholder="เบอร์โทร" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={{ marginTop: 8 }} />
        <input className="tt-input" placeholder="ที่อยู่" value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} style={{ marginTop: 8 }} />
        <input className="tt-input" placeholder="รหัสไปรษณีย์" value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} style={{ marginTop: 8 }} />
        <button type="button" className="tt-btn-primary" style={{ width: '100%', marginTop: 12 }} onClick={() => void save()}>
          บันทึกที่อยู่
        </button>
        {err && <p className="tt-error-inline">{err}</p>}
      </div>
    </>
  );
}
