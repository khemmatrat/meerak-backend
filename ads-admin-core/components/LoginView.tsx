import React, { useState } from "react";
import { adsAdminLogin, adsAdminLoginTotp, setAdsAdminToken } from "../services/adsAdminApi";

export const LoginView: React.FC<{ onLogin: (u: { email: string; role: string; name?: string }) => void }> = ({
  onLogin,
}) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const finishLogin = (accessToken: string, user: { email: string; role: string; name?: string }) => {
    setAdsAdminToken(accessToken);
    onLogin({ email: user.email, role: String(user.role || "").toUpperCase(), name: user.name });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (mfaToken) {
        const code = totpCode.trim();
        if (code.length < 6) {
          setError("กรุณาใส่รหัส Authenticator 6 หลัก");
          return;
        }
        const res = await adsAdminLoginTotp(mfaToken, code);
        if (res.access_token && res.user) {
          finishLogin(res.access_token, res.user);
          return;
        }
        setError("ยืนยัน Authenticator ไม่สำเร็จ");
        return;
      }

      const code = totpCode.trim();
      const res = await adsAdminLogin(email.trim(), password, code || undefined);

      if (res.access_token && res.user) {
        finishLogin(res.access_token, res.user);
        return;
      }

      if (res.requires_totp && res.mfa_token && res.user) {
        setMfaToken(res.mfa_token);
        setTotpCode("");
        setError("กรุณาใส่รหัส Google Authenticator 6 หลัก (ตัวเดียวกับ admin.aqond.com) แล้วกดเข้าสู่ระบบอีกครั้ง");
        return;
      }

      setError(
        res.error ||
          "เข้าสู่ระบบไม่สำเร็จ — ใช้ admin@nexus.com + รหัสผ่าน + Google Authenticator (admin.aqond.com)",
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed";
      if (msg === "Invalid email or password") {
        setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง — บัญชีแอดมินคือ admin@nexus.com");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
      <form onSubmit={submit} className="w-full max-w-md bg-white rounded-2xl p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-slate-900">AQOND Ads Admin</h1>
        <p className="text-slate-500 text-sm mt-1">Admin เส้นทางที่ 2</p>
        {mfaToken && (
          <p className="mt-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            บัญชีนี้ต้องใช้ Google Authenticator — ใส่รหัส 6 หลักด้านล่าง
          </p>
        )}
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        {!mfaToken && (
          <>
            <input
              className="mt-6 w-full border rounded-lg px-3 py-2"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
            />
            <input
              type="password"
              className="mt-3 w-full border rounded-lg px-3 py-2"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </>
        )}

        <input
          className="mt-3 w-full border rounded-lg px-3 py-2 tracking-widest text-center text-lg"
          placeholder={mfaToken ? "รหัส Authenticator 6 หลัก" : "Authenticator 6 หลัก (ถ้ามี)"}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
          value={totpCode}
          onChange={(e) => setTotpCode(e.target.value.replace(/\s/g, ""))}
        />

        {mfaToken && (
          <button
            type="button"
            onClick={() => {
              setMfaToken(null);
              setTotpCode("");
              setError("");
            }}
            className="mt-3 text-sm text-slate-500 underline"
          >
            กลับไปใส่ email / password
          </button>
        )}

        <button
          type="submit"
          disabled={
            loading ||
            (mfaToken ? totpCode.trim().length < 6 : !email.trim() || !password)
          }
          className="mt-6 w-full py-2.5 rounded-lg bg-indigo-600 text-white font-semibold disabled:opacity-50"
        >
          {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
        </button>
      </form>
    </div>
  );
};
