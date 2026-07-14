'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import {
  LINE_OAUTH_STATE_KEY,
  lineLoginRedirectUri,
  loginWithLineOAuth,
} from '@/lib/v2Auth';

export default function LineLoginCallbackClient() {
  const { loginWithLine } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [err, setErr] = useState('');

  useEffect(() => {
    const code = params.get('code');
    const state = params.get('state');
    const oauthErr = params.get('error');
    if (oauthErr) {
      setErr(`LINE ปฏิเสธการเข้าสู่ระบบ (${oauthErr})`);
      return;
    }
    if (!code || !state) {
      setErr('ไม่พบ authorization code จาก LINE');
      return;
    }
    const expected = sessionStorage.getItem(LINE_OAUTH_STATE_KEY);
    if (!expected || expected !== state) {
      setErr('state ไม่ถูกต้อง — ลองเข้าสู่ระบบใหม่');
      return;
    }
    sessionStorage.removeItem(LINE_OAUTH_STATE_KEY);
    const redirectUri = lineLoginRedirectUri();
    void loginWithLineOAuth(code, redirectUri, state)
      .then((res) => {
        loginWithLine(res);
        router.replace('/m/account');
      })
      .catch((e: unknown) => {
        setErr(e instanceof Error ? e.message : 'เข้าสู่ระบบด้วย LINE ไม่สำเร็จ');
      });
  }, [params, router, loginWithLine]);

  return (
    <div style={{ padding: 24, textAlign: 'center' }}>
      <p className="tt-hint">{err || 'กำลังเข้าสู่ระบบด้วย LINE…'}</p>
      {err && (
        <Link href="/m/login" className="tt-btn-ghost" style={{ marginTop: 12, display: 'inline-block' }}>
          กลับหน้าเข้าสู่ระบบ
        </Link>
      )}
    </div>
  );
}
