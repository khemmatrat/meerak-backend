'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { applyHandoffFromHash } from '@/lib/meerakAuth';
import { useAuth } from '@/lib/auth';
import { experienceHandoffNext } from '@/lib/experience/handoffNext';

/** Reads #t=&u= from mobile deep link, persists session, redirects to marketplace home. */
export default function AuthHandoffPage() {
  const router = useRouter();
  const { auth, syncFromStorage } = useAuth();
  const [msg, setMsg] = useState('กำลังเข้าสู่ระบบ…');

  useEffect(() => {
    const r = applyHandoffFromHash();
    if (r.ok) {
      syncFromStorage();
      const next = experienceHandoffNext(r.next.startsWith('/') ? r.next : '/m/home');
      router.replace(next);
      return;
    }
    if (auth) {
      router.replace(experienceHandoffNext('/m/home'));
      return;
    }
    setMsg('ไม่พบข้อมูลเข้าสู่ระบบ — กำลังไปหน้า login');
    const t = setTimeout(() => router.replace('/m/login'), 1200);
    return () => clearTimeout(t);
  }, [router, auth]);

  return (
    <div style={{ padding: 24, textAlign: 'center' }}>
      <p className="tt-hint">{msg}</p>
    </div>
  );
}
