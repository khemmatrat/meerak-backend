'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { AUTH_BRAND, AUTH_LOGIN } from '@/lib/authMessaging';
import {
  LINE_OAUTH_STATE_KEY,
  getLineLoginUrl,
  lineLoginRedirectUri,
  requestOtp,
} from '@/lib/v2Auth';

function loginErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? String(err.message || '') : String(err || '');
  if (/invalid_otp|invalid_th_phone/i.test(raw)) return 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ';
  if (/invalid_oauth_state/i.test(raw)) return 'เซสชัน LINE หมดอายุ — ลองใหม่';
  if (/line_login_not_configured/i.test(raw)) return 'ยังไม่ได้ตั้งค่า LINE Login บนเซิร์ฟเวอร์';
  if (/invalid phone or password/i.test(raw)) {
    return 'เบอร์โทรหรือรหัสผ่านไม่ถูกต้อง ลองตรวจสอบแล้วกรอกใหม่นะคะ';
  }
  if (/too many|429/i.test(raw)) {
    return 'ลองเข้าสู่ระบบหลายครั้ง รอประมาณ 1–2 นาทีแล้วลองใหม่ได้เลยค่ะ';
  }
  if (/meerak_backend_unreachable|502|unavailable/i.test(raw)) {
    return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ชั่วคราว — ลองใหม่อีกครั้ง';
  }
  if (/ยังไม่ได้ตั้งรหัสผ่าน|สมัครสมาชิกก่อน/i.test(raw)) {
    return 'บัญชีนี้ยังไม่พร้อม — กดสมัครสมาชิกเพื่อเริ่มใช้งานได้เลยค่ะ';
  }
  if (/ระงับ|แบน|suspended|banned/i.test(raw)) return raw;
  if (raw && !/failed|error|token|jwt/i.test(raw)) return raw;
  return 'เข้าสู่ระบบไม่สำเร็จชั่วคราว ลองอีกครั้งในอีกสักครู่ค่ะ';
}

type Mode = 'otp' | 'password';

function PhoneIcon() {
  return (
    <svg className="tt-login-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 01-.321.988l-1.305.98a10.582 10.582 0 004.872 4.872l.98-1.305a1 1 0 01.988-.321l2.2.548a1 1 0 01.725.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="tt-login-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
      />
    </svg>
  );
}

export default function MobileLoginPage() {
  const { login, loginOtp, v2AuthEnabled } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(v2AuthEnabled ? 'otp' : 'password');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [devCode, setDevCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const startLineLogin = async () => {
    setBusy(true);
    setErr('');
    try {
      const redirectUri = lineLoginRedirectUri();
      const res = await getLineLoginUrl(redirectUri);
      if (!res.ok || !res.url) {
        setErr(res.message || 'LINE Login ยังไม่พร้อม');
        return;
      }
      if (res.state) sessionStorage.setItem(LINE_OAUTH_STATE_KEY, res.state);
      window.location.href = res.url;
    } catch (e: unknown) {
      setErr(loginErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const sendOtp = async () => {
    if (!phone.trim() || phone.trim().length < 9) {
      setErr('กรุณากรอกเบอร์โทรศัพท์ให้ครบนะคะ');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const res = await requestOtp(phone.trim());
      setOtpSent(true);
      if (res.dev_code) setDevCode(res.dev_code);
    } catch (e: unknown) {
      setErr(loginErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim() || phone.trim().length < 9) {
      setErr('กรุณากรอกเบอร์โทรศัพท์ให้ครบนะคะ');
      return;
    }
    if (!password) {
      setErr('กรุณากรอกรหัสผ่านค่ะ');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      await login(phone.trim(), password);
      router.push('/m/account');
    } catch (e: unknown) {
      setErr(loginErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const submitOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim() || otp.trim().length < 4) {
      setErr('กรุณากรอกรหัส OTP');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      await loginOtp(phone.trim(), otp.trim());
      router.push('/m/account');
    } catch (e: unknown) {
      setErr(loginErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tt-login-screen">
      <Link href="/m/account" className="tt-login-back-fab" aria-label="กลับ">
        ‹
      </Link>

      <main className="tt-login-body">
        <section className="tt-login-hero" aria-label="AQOND">
          <div className="tt-login-brand-ring">
            <Image
              src="/aqond-mark.png"
              alt="AQOND"
              width={88}
              height={88}
              priority
              className="tt-login-brand-img"
            />
          </div>
          <h1 className="tt-login-wordmark">{AUTH_BRAND.name}</h1>
          <p className="tt-login-tagline">{AUTH_BRAND.tagline}</p>
          <p className="tt-login-identity">{AUTH_BRAND.identityLine}</p>
          <p className="tt-login-identity-sub">{AUTH_BRAND.identityDetail}</p>
        </section>

        <section className="tt-login-card">
          <h2 className="tt-login-card-title">{AUTH_LOGIN.title}</h2>
          <p className="tt-login-unified-hint">{AUTH_LOGIN.hintMobileApp}</p>

        {v2AuthEnabled && (
          <div className="tt-login-tabs" role="tablist" aria-label="วิธีเข้าสู่ระบบ">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'otp'}
              className={`tt-login-tab${mode === 'otp' ? ' active' : ''}`}
              onClick={() => {
                setMode('otp');
                setErr('');
              }}
            >
              OTP
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'password'}
              className={`tt-login-tab${mode === 'password' ? ' active' : ''}`}
              onClick={() => {
                setMode('password');
                setErr('');
              }}
            >
              รหัสผ่าน
            </button>
          </div>
        )}

        {mode === 'otp' && v2AuthEnabled ? (
          <form onSubmit={(e) => void (otpSent ? submitOtp(e) : (e.preventDefault(), sendOtp()))}>
            <p className="tt-login-hint">{AUTH_LOGIN.hintOtp} (dev: ดูรหัสใน response)</p>

            <div className="tt-login-field">
              <label className="tt-login-label" htmlFor="login-phone">
                เบอร์โทรศัพท์
              </label>
              <div className="tt-login-input-wrap">
                <PhoneIcon />
                <input
                  id="login-phone"
                  className="tt-login-input"
                  placeholder="0812345678"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={otpSent}
                />
              </div>
            </div>

            {otpSent && (
              <div className="tt-login-field">
                <label className="tt-login-label" htmlFor="login-otp">
                  รหัส OTP
                </label>
                <div className="tt-login-input-wrap">
                  <input
                    id="login-otp"
                    className="tt-login-input tt-login-input--plain"
                    placeholder="รหัส OTP 6 หลัก"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                  />
                </div>
              </div>
            )}

            {devCode && (
              <p className="tt-login-dev-otp">
                Dev OTP: <strong>{devCode}</strong>
              </p>
            )}

            <button type="submit" className="tt-login-submit" disabled={busy}>
              {busy ? 'กำลังดำเนินการ…' : otpSent ? 'ยืนยัน OTP' : 'ขอรหัส OTP'}
            </button>

            {otpSent && (
              <button
                type="button"
                className="tt-login-change-phone"
                onClick={() => {
                  setOtpSent(false);
                  setOtp('');
                  setDevCode('');
                }}
              >
                เปลี่ยนเบอร์
              </button>
            )}
          </form>
        ) : (
          <form onSubmit={(e) => void submitPassword(e)}>
            <p className="tt-login-hint">{AUTH_LOGIN.hintPassword}</p>

            <div className="tt-login-field">
              <label className="tt-login-label" htmlFor="login-phone-pw">
                เบอร์โทรศัพท์
              </label>
              <div className="tt-login-input-wrap">
                <PhoneIcon />
                <input
                  id="login-phone-pw"
                  className="tt-login-input"
                  placeholder="0812345678"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>

            <div className="tt-login-field">
              <label className="tt-login-label" htmlFor="login-password">
                รหัสผ่าน
              </label>
              <div className="tt-login-input-wrap">
                <LockIcon />
                <input
                  id="login-password"
                  className="tt-login-input"
                  type="password"
                  placeholder="รหัสผ่าน"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button type="submit" className="tt-login-submit" disabled={busy}>
              {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
            </button>
          </form>
        )}

        {err && <p className="tt-login-error" role="alert">{err}</p>}

        {v2AuthEnabled && (
          <>
            <div className="tt-login-divider">หรือ</div>
            <button
              type="button"
              className="tt-login-line"
              disabled={busy}
              onClick={() => void startLineLogin()}
            >
              <span className="tt-login-line-badge">LINE</span>
              {busy ? 'กำลังเปิด LINE…' : 'เข้าสู่ระบบด้วย LINE'}
            </button>
          </>
        )}

        <p className="tt-login-footer">
          {AUTH_LOGIN.noAccount}
          <Link href="/m/register">{AUTH_LOGIN.register}</Link>
        </p>
        </section>
      </main>
    </div>
  );
}
