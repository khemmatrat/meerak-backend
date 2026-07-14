'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { addStaffMember, fetchStaffAccess, removeStaffMember } from '@/lib/merchant';
import { useMerchant } from '@/components/mobile/MerchantShell';

export default function MerchantStaffPage() {
  const { auth } = useAuth();
  const { merchantId, permissions } = useMerchant();
  const ownerId = auth?.userId || 'guest';
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState('');
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const reload = useCallback(() => {
    setLoading(true);
    fetchStaffAccess(ownerId, merchantId, auth?.userId || ownerId)
      .then((d) => setMembers(d.members || []))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [ownerId, merchantId, auth?.userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const onAdd = async () => {
    if (!permissions?.can_manage_staff) {
      setErr('ไม่มีสิทธิ์จัดการพนักงาน');
      return;
    }
    try {
      await addStaffMember({
        owner_id: ownerId,
        user_id: userId,
        display_name: name,
        shop_ids: [merchantId],
      });
      setMsg('เพิ่มพนักงานแล้ว');
      setUserId('');
      setName('');
      reload();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  if (!permissions?.can_manage_staff) {
    return (
      <div className="tt-merchant-staff-page">
        <p className="tt-hint">บัญชีพนักงาน — ดูได้อย่างเดียว ไม่มีสิทธิ์จัดการ</p>
      </div>
    );
  }

  return (
    <div className="tt-merchant-staff-page">
      <h1 className="tt-merchant-page-title">👥 พนักงานร้าน</h1>
      <p className="tt-merchant-sub">พนักงาน: รับออเดอร์ได้ · แก้เมนู/ถอนเงินไม่ได้</p>
      {msg && <p className="tt-merchant-ok">{msg}</p>}
      {err && <p className="tt-error-inline">{err}</p>}

      <section className="tt-merchant-status-card">
        <h2>➕ เพิ่มพนักงาน</h2>
        <input className="tt-input tt-menu-input" placeholder="User ID" value={userId} onChange={(e) => setUserId(e.target.value)} />
        <input className="tt-input tt-menu-input" placeholder="ชื่อแสดง" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="button" className="tt-btn-primary" onClick={() => void onAdd()}>เพิ่ม</button>
      </section>

      <section>
        <h2>รายชื่อ ({members.length})</h2>
        {loading && <p className="tt-loading">…</p>}
        <ul className="tt-merchant-shop-list">
          {members.map((m) => (
            <li key={m.id} className="tt-merchant-shop-row">
              <div><strong>{m.display_name}</strong><span className="tt-hint"> · {m.user_id}</span></div>
              <button type="button" className="tt-btn-ghost tt-merchant-mini-btn" onClick={() => void removeStaffMember(ownerId, m.id).then(reload)}>
                ลบ
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
