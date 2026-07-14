'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { AUTH_REGISTER } from '@/lib/authMessaging';
import { RECAPTCHA_CONTAINER_ID, resendOTP, resetPhoneAuth, sendOTP, verifyOTP } from '@/lib/phoneAuth';

export default function MobileRegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<'phone' | 'otp' | 'details'>('phone');
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [firebaseUid, setFirebaseUid] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const firebaseReady = !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

  useEffect(() => {
    if (otpCountdown <= 0) return;
    const t = setTimeout(() => setOtpCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [otpCountdown]);

  useEffect(() => () => resetPhoneAuth(), []);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim() || phone.trim().length < 9) {
      setErr('กรุณากรอกเบอร์โทรให้ครบ');
      return;
    }
    setBusy(true);
    setErr('');
    const res = await sendOTP(phone.trim());
    setBusy(false);
    if (!res.success) {
      setErr(res.message);
      return;
    }
    setStep('otp');
    setOtpCountdown(300);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const res = await verifyOTP(otpCode);
    setBusy(false);
    if (!res.success || !res.firebaseUid) {
      setErr(res.message);
      return;
    }
    setFirebaseUid(res.firebaseUid);
    setStep('details');
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUid) {
      setErr('ยืนยันเบอร์ก่อนสมัคร');
      return;
    }
    if (!name.trim() || password.length < 6) {
      setErr('กรอกชื่อและรหัสผ่านอย่างน้อย 6 ตัว');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      await register({
        phone: phone.trim(),
        password,
        name: name.trim(),
        firebase_uid: firebaseUid,
      });
      router.push('/m/onboarding/intent');
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : 'สมัครไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="tt-header">
        <div className="tt-header-row">
          <Link href="/m/login" className="tt-back">‹</Link>
          <span style={{ flex: 1, fontWeight: 700 }}>{AUTH_REGISTER.title}</span>
        </div>
      </header>
      <div className="tt-login-page" style={{ padding: 16 }}>
        <p className="tt-hint" style={{ marginBottom: 16 }}>
          {AUTH_REGISTER.oneAccount}
        </p>
        <p className="tt-hint" style={{ marginBottom: 16 }}>
          {AUTH_REGISTER.hasAccount} <Link href="/m/login">เข้าสู่ระบบ</Link>
        </p>

        {!firebaseReady && (
          <div className="tt-hint" style={{ marginBottom: 16, padding: 12, background: '#fff8e6', borderRadius: 8 }}>
            สมัครผ่านแอป AQOND ได้ทันที{' '}
            <a href="https://aqond.com/#/register" style={{ color: 'var(--tt-accent, #e85d04)' }}>
              เปิดหน้าสมัครในแอป
            </a>
            {' '}แล้วกลับมาเข้าสู่ระบบที่นี่ด้วยเบอร์เดิม
          </div>
        )}

        <div id={RECAPTCHA_CONTAINER_ID} />

        {step === 'phone' && firebaseReady && (
          <form onSubmit={(e) => void handleSendOtp(e)}>
            <input
              className="tt-input"
              placeholder="0812345678"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <button type="submit" className="tt-btn-primary" style={{ width: '100%', marginTop: 12 }} disabled={busy}>
              ส่งรหัส OTP
            </button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={(e) => void handleVerifyOtp(e)}>
            <p className="tt-hint">ส่งรหัสไปที่ {phone}</p>
            <input
              className="tt-input"
              placeholder="รหัส 6 หลัก"
              inputMode="numeric"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
            />
            <button type="submit" className="tt-btn-primary" style={{ width: '100%', marginTop: 12 }} disabled={busy}>
              ยืนยัน OTP
            </button>
            {otpCountdown > 0 ? (
              <p className="tt-hint" style={{ marginTop: 8 }}>ส่งใหม่ได้ใน {otpCountdown}s</p>
            ) : (
              <button
                type="button"
                className="tt-btn-ghost"
                style={{ marginTop: 8 }}
                onClick={() => void resendOTP(phone).then((r) => (r.success ? setOtpCountdown(300) : setErr(r.message)))}
              >
                ส่งรหัสใหม่
              </button>
            )}
          </form>
        )}

        {step === 'details' && (
          <form onSubmit={(e) => void handleRegister(e)}>
            <input
              className="tt-input"
              placeholder="ชื่อ-นามสกุล"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="tt-input"
              style={{ marginTop: 12 }}
              type="password"
              placeholder="รหัสผ่าน (อย่างน้อย 6 ตัว)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="submit" className="tt-btn-primary" style={{ width: '100%', marginTop: 12 }} disabled={busy}>
              {busy ? 'กำลังสร้างบัญชี…' : 'สร้างบัญชี'}
            </button>
          </form>
        )}

        {err && <p className="tt-error-inline">{err}</p>}
        <p className="tt-hint" style={{ marginTop: 16, textAlign: 'center' }}>
          มีบัญชีแล้ว? <Link href="/m/login">เข้าสู่ระบบ</Link>
        </p>
      </div>
    </>
  );
}
