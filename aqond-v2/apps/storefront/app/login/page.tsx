'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { Button, Input, Card } from '@aqond/ui';
import { useRouter } from 'next/navigation';

function loginErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? String(err.message || '') : String(err || '');
  if (/invalid phone or password/i.test(raw)) return 'Invalid phone or password';
  if (/meerak_backend_unreachable/i.test(raw)) return 'Cannot reach auth server — is backend running on :3001?';
  return raw || 'Login failed';
}

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(phone.trim(), password);
      router.push('/account');
    } catch (ex) {
      setErr(loginErrorMessage(ex));
    }
  };

  return (
    <div>
      <h1 className="page-title">เข้าสู่ระบบ</h1>
      <Card>
        <p style={{ fontSize: '0.9rem', color: 'var(--aq-color-muted)', marginBottom: 12 }}>
          บัญชีเดียวกับแอป AQOND (เบอร์โทร + รหัสผ่าน)
        </p>
        <form className="form" onSubmit={submit}>
          <Input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0812345678"
            required
            aria-label="Phone"
          />
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            aria-label="Password"
          />
          {err && <p style={{ color: 'var(--aq-color-accent)' }}>{err}</p>}
          <Button type="submit">Continue</Button>
        </form>
        <p style={{ fontSize: '0.85rem', color: 'var(--aq-color-muted)', marginTop: 12 }}>
          <Link href="/m/register">สมัครสมาชิกใหม่</Link>
        </p>
      </Card>
    </div>
  );
}
