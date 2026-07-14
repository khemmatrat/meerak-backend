'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { completeLineOAuth } from '@/lib/notifyClient';

export default function LineCallbackClient() {
  const { auth } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!auth) {
      router.replace('/m/login');
      return;
    }
    const code = params.get('code');
    const state = params.get('state');
    if (!code) {
      setErr('ไม่พบ authorization code จาก LINE');
      return;
    }
    if (state && state !== auth.userId) {
      setErr('state ไม่ตรงกับบัญชี — ลองใหม่');
      return;
    }
    const redirectUri = `${window.location.origin}/m/account/notifications/line-callback`;
    void completeLineOAuth(auth, code, redirectUri)
      .then(() => router.replace('/m/account/notifications'))
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : 'เชื่อม LINE ไม่สำเร็จ'));
  }, [auth, params, router]);

  return (
    <div style={{ padding: 24, textAlign: 'center' }}>
      <p className="tt-hint">{err || 'กำลังเชื่อมบัญชี LINE…'}</p>
      {err && (
        <Link href="/m/account/notifications" className="tt-btn-ghost" style={{ marginTop: 12, display: 'inline-block' }}>
          กลับ
        </Link>
      )}
    </div>
  );
}
