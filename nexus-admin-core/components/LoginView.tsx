// Phase 4: Admin dashboard uses backend JWT (role from user_roles). No bypass.
import React, { useState, useRef } from 'react';
import { Lock, Mail, User, ArrowRight, Loader2, Shield } from 'lucide-react';
import { AdminUser } from '../types';
import {
  adminLogin,
  adminMfaSetupStart,
  adminMfaSetupFinish,
  adminMfaVerify,
  mapLoginUserToAdminUser,
  setAdminToken,
  type AdminLoginUser,
} from '../services/adminApi';

interface LoginViewProps {
  onLogin: (user: AdminUser) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const submittingRef = useRef(false);

  /** รหัสผ่านเท่านั้น | รอ TOTP | ลงทะเบียน Authenticator ครั้งแรก */
  const [step, setStep] = useState<'password' | 'totp' | 'enroll'>('password');
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [pendingUser, setPendingUser] = useState<AdminLoginUser | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const finishLogin = (u: AdminLoginUser) => {
    onLogin(mapLoginUserToAdminUser(u));
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError('');
    setLoading(true);

    try {
      const res = await adminLogin(email.trim(), password);
      if ('access_token' in res && res.access_token) {
        setAdminToken(res.access_token);
        finishLogin(res.user);
        setLoading(false);
        submittingRef.current = false;
        return;
      }
      if ('mfa_setup_required' in res && res.mfa_setup_required) {
        setMfaToken(res.mfa_token);
        setPendingUser(res.user);
        const start = await adminMfaSetupStart(res.mfa_token);
        setQrDataUrl(start.qr_data_url);
        setStep('enroll');
        setTotpCode('');
        setLoading(false);
        submittingRef.current = false;
        return;
      }
      if ('mfa_required' in res && res.mfa_required) {
        setMfaToken(res.mfa_token);
        setPendingUser(res.user);
        setStep('totp');
        setTotpCode('');
        setLoading(false);
        submittingRef.current = false;
        return;
      }
      setError('Unexpected login response');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid credentials';
      setError(msg);
    }
    setLoading(false);
    submittingRef.current = false;
  };

  const handleTotpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaToken || submittingRef.current) return;
    submittingRef.current = true;
    setError('');
    setLoading(true);
    try {
      const res = await adminMfaVerify(mfaToken, totpCode.replace(/\s/g, ''));
      setAdminToken(res.access_token);
      finishLogin(res.user);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Verification failed';
      setError(msg);
    }
    setLoading(false);
    submittingRef.current = false;
  };

  const handleEnrollFinish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaToken || submittingRef.current) return;
    submittingRef.current = true;
    setError('');
    setLoading(true);
    try {
      const res = await adminMfaSetupFinish(mfaToken, totpCode.replace(/\s/g, ''));
      setAdminToken(res.access_token);
      finishLogin(res.user);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Setup failed';
      setError(msg);
    }
    setLoading(false);
    submittingRef.current = false;
  };

  const backToPassword = () => {
    setStep('password');
    setMfaToken(null);
    setPendingUser(null);
    setQrDataUrl(null);
    setTotpCode('');
    setError('');
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col md:flex-row w-full max-w-4xl overflow-hidden">
        {/* Left: Branding */}
        <div className="md:w-1/2 bg-gradient-to-br from-indigo-900 to-slate-900 p-12 text-white flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 p-32 bg-indigo-500 rounded-full blur-3xl opacity-20 -mr-16 -mt-16 pointer-events-none"></div>
          <div className="absolute bottom-0 left-0 p-32 bg-purple-500 rounded-full blur-3xl opacity-20 -ml-16 -mb-16 pointer-events-none"></div>

          <div className="relative z-10">
            <div className="bg-white/10 w-fit p-3 rounded-xl mb-6 backdrop-blur-sm border border-white/10">
              <img src="/logo.png" alt="Aqond" className="w-12 h-12 object-contain" />
            </div>
            <h1 className="text-3xl font-bold mb-2">Aqond Admin</h1>
            <p className="text-indigo-200">Enterprise Backend Management System</p>
          </div>

          <div className="relative z-10 space-y-4">
            <div className="flex items-center gap-3 text-sm text-indigo-100/80">
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                <Shield size={14} />
              </div>
              <span>Two-factor authentication (TOTP)</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-indigo-100/80">
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                <User size={14} />
              </div>
              <span>Secure Access Control</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-indigo-100/80">
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                <Lock size={14} />
              </div>
              <span>End-to-End Encryption</span>
            </div>
          </div>
        </div>

        {/* Right */}
        <div className="md:w-1/2 p-12 flex flex-col justify-center">
          {step === 'password' && (
            <>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Welcome Back</h2>
              <p className="text-slate-500 mb-8">Please sign in to access the dashboard.</p>

              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                      placeholder="admin@nexus.com"
                      required
                      autoComplete="username"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                      placeholder="••••••••"
                      required
                      autoComplete="current-password"
                    />
                  </div>
                </div>

                {error && (
                  <div className="p-3 bg-rose-50 border border-rose-100 text-rose-600 text-sm rounded-lg flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-rose-500 rounded-full"></span> {error}
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {loading ? <Loader2 size={20} className="animate-spin" /> : <>Sign In <ArrowRight size={18} /></>}
                  </button>
                </div>
              </form>
            </>
          )}

          {step === 'totp' && (
            <>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Authenticator code</h2>
              <p className="text-slate-500 mb-6">
                Enter the 6-digit code from Google Authenticator or Authy for{' '}
                <span className="font-medium text-slate-700">{pendingUser?.email}</span>.
              </p>
              <form onSubmit={handleTotpSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">6-digit code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={8}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg tracking-widest text-center text-lg font-mono focus:ring-2 focus:ring-indigo-500"
                    placeholder="000000"
                    required
                    autoComplete="one-time-code"
                  />
                </div>
                {error && (
                  <div className="p-3 bg-rose-50 border border-rose-100 text-rose-600 text-sm rounded-lg">{error}</div>
                )}
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={backToPassword}
                    className="flex-1 py-3 border border-slate-200 rounded-lg font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={loading || totpCode.length !== 6}
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold disabled:opacity-60"
                  >
                    {loading ? <Loader2 size={20} className="animate-spin mx-auto" /> : 'Verify'}
                  </button>
                </div>
              </form>
            </>
          )}

          {step === 'enroll' && (
            <>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Set up Authenticator</h2>
              <p className="text-slate-500 mb-4">
                Scan this QR in Google Authenticator or Authy, then enter the 6-digit code to finish.
              </p>
              {qrDataUrl && (
                <div className="mb-4 flex justify-center rounded-lg border border-slate-100 bg-white p-4">
                  <img src={qrDataUrl} alt="Authenticator QR" className="max-h-48 w-48 object-contain" />
                </div>
              )}
              <form onSubmit={handleEnrollFinish} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Confirm 6-digit code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={8}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg tracking-widest text-center text-lg font-mono focus:ring-2 focus:ring-indigo-500"
                    placeholder="000000"
                    required
                    autoComplete="one-time-code"
                  />
                </div>
                {error && (
                  <div className="p-3 bg-rose-50 border border-rose-100 text-rose-600 text-sm rounded-lg">{error}</div>
                )}
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={backToPassword}
                    className="flex-1 py-3 border border-slate-200 rounded-lg font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={loading || totpCode.length !== 6}
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold disabled:opacity-60"
                  >
                    {loading ? <Loader2 size={20} className="animate-spin mx-auto" /> : 'Activate 2FA'}
                  </button>
                </div>
              </form>
            </>
          )}

          {step === 'password' && (
            <div className="mt-8 text-center">
              <p className="text-xs text-slate-400">
                By logging in, you agree to the{' '}
                <a href="#" className="text-indigo-600 hover:underline">
                  Security Protocols
                </a>{' '}
                and{' '}
                <a href="#" className="text-indigo-600 hover:underline">
                  Data Policy
                </a>
                .
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
