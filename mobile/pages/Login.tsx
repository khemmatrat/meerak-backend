import React, { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { MockApi } from "../services/mockApi";
import { useLanguage } from "../context/LanguageContext";
import { Globe, Shield, Smartphone, Lock, Info, AlertCircle } from "lucide-react";
import { UserProfile, UserRole } from "../types";
import { GrandOpeningOverlay } from "../components/GrandOpeningOverlay";
import { useMobileAppConfig } from "../context/MobileAppConfigContext";
import { useNotification } from "../context/NotificationContext";
import { normalizePhoneForApi } from "../services/phoneNormalize";
import {
  diagnoseLoginFailure,
  hasPendingRegistrationForPhone,
  pendingRegistrationPhone,
  syncFirebaseOtpSessionToDraft,
} from "../services/loginRecovery";

function loginErrorMessage(err: unknown): string {
  const raw =
    err instanceof Error ? String(err.message || "") : String(err || "");
  if (/invalid phone or password/i.test(raw)) {
    return "เบอร์โทรหรือรหัสผ่านไม่ถูกต้อง — หากยืนยัน OTP แล้วแต่ยังไม่เคยกดสมัครสมาชิกขั้นสุดท้าย ให้กลับไปสมัครต่อก่อนนะคะ";
  }
  if (/too many|429/i.test(raw)) {
    return "ลองเข้าสู่ระบบหลายครั้ง รอประมาณ 1–2 นาทีแล้วลองใหม่ได้เลยค่ะ";
  }
  if (/network|connect|internet|ECONNREFUSED|เชื่อมต่อเซิร์ฟเวอร์/i.test(raw)) {
    return "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ชั่วคราว ตรวจสัญญาณอินเทอร์เน็ตแล้วลองใหม่ค่ะ";
  }
  if (/ยังไม่ได้ตั้งรหัสผ่าน|สมัครสมาชิกก่อน/i.test(raw)) {
    return "บัญชีนี้ยังไม่พร้อม — กดสมัครสมาชิกเพื่อเริ่มใช้งานได้เลยค่ะ";
  }
  if (/ระงับ|แบน|suspended|banned/i.test(raw)) {
    return raw;
  }
  if (raw && !/failed|error|token|jwt|firebase|recaptcha/i.test(raw)) {
    return raw;
  }
  return "เข้าสู่ระบบไม่สำเร็จชั่วคราว ลองอีกครั้งในอีกสักครู่ค่ะ";
}

function dashboardPath(user: UserProfile): string {
  const role = String(user.role || "").toLowerCase();
  if (role === UserRole.PROVIDER || role === "provider") {
    return "/provider/dashboard";
  }
  return "/employer/dashboard";
}

export const Login: React.FC = () => {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumePhone, setResumePhone] = useState<string | null>(null);
  const { login } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const { config } = useMobileAppConfig();
  const { notify } = useNotification();
  const signupsEnabled = config.featureFlags.enableSignups;

  useEffect(() => {
    const pending = pendingRegistrationPhone();
    if (pending) {
      setResumePhone(pending);
      setPhone((prev) => prev || pending);
    }
    syncFirebaseOtpSessionToDraft(pending || undefined);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    const normalizedPhone = normalizePhoneForApi(phone);
    if (!normalizedPhone || normalizedPhone.length < 9) {
      setError("กรุณากรอกเบอร์โทรศัพท์ให้ครบนะคะ (เช่น 0812345678)");
      return;
    }
    if (!password) {
      setError("กรุณากรอกรหัสผ่านค่ะ");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { token, user } = await MockApi.login(normalizedPhone, password);
      flushSync(() => {
        login(user, token);
      });
      notify("ยินดีต้อนรับกลับ — เข้าใช้งานได้เลยค่ะ", "success");
      navigate(dashboardPath(user), { replace: true });
    } catch (err: unknown) {
      const loginCode = (err as Error & { loginCode?: string })?.loginCode;
      const raw =
        err instanceof Error ? String(err.message || "") : String(err || "");

      if (
        (/invalid phone or password/i.test(raw) ||
          loginCode === "USER_NOT_FOUND" ||
          loginCode === "INVALID_PASSWORD" ||
          loginCode === "PASSWORD_NOT_SET") &&
        signupsEnabled
      ) {
        syncFirebaseOtpSessionToDraft(normalizedPhone);
        const kind = await diagnoseLoginFailure(normalizedPhone, loginCode);

        if (kind === "no_account" || kind === "password_not_set") {
          if (hasPendingRegistrationForPhone(normalizedPhone)) {
            notify(
              "พบการสมัครค้างอยู่ — พาไปขั้นสุดท้ายให้แล้วค่ะ",
              "info",
            );
            navigate("/register", { replace: true });
            return;
          }
          setError(
            kind === "password_not_set"
              ? "บัญชีนี้ยังไม่ได้ตั้งรหัสผ่าน — กดสมัครต่อเพื่อตั้งรหัสผ่านและเข้าใช้งาน"
              : "ยังไม่มีบัญชีในระบบ — คุณอาจยืนยัน OTP แล้วแต่ยังไม่ได้กดสมัครสมาชิกขั้นสุดท้าย กดปุ่มด้านล่างเพื่อสมัครต่อ",
          );
          return;
        }

        if (kind === "wrong_password") {
          setError(
            "มีบัญชีจากเบอร์นี้แล้ว แต่รหัสผ่านไม่ตรง — ลองใหม่หรือกดลืมรหัสผ่าน",
          );
          return;
        }
      }

      setError(loginErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 relative">
      <GrandOpeningOverlay />
      <div className="absolute top-4 right-4 flex items-center bg-white px-3 py-2 rounded-lg shadow-sm border border-gray-100">
        <Globe size={16} className="text-gray-400 mr-2" />
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as any)}
          className="bg-transparent text-sm text-gray-600 focus:outline-none cursor-pointer"
        >
          <option value="en">English</option>
          <option value="th">ไทย</option>
          <option value="zh">中文</option>
          <option value="ja">日本語</option>
          <option value="fr">Français</option>
          <option value="ru">Русский</option>
        </select>
      </div>

      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
        <div className="text-center mb-8">
          <img
            src="/logo.png"
            alt="AQOND"
            className="h-12 w-12 mx-auto mb-4 object-contain rounded-xl"
            width={48}
            height={48}
          />
          <h1 className="text-2xl font-bold text-gray-900">
            {t("auth.welcome")}
          </h1>
          <p className="text-gray-500 text-sm mt-1">{t("auth.subtitle")}</p>
        </div>

        {signupsEnabled && resumePhone ? (
          <div className="mb-4 p-3 rounded-lg text-sm border bg-amber-50 text-amber-950 border-amber-200 flex items-start gap-2">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5 text-amber-700" />
            <div>
              <p className="font-medium">พบการสมัครค้างอยู่ ({resumePhone})</p>
              <p className="text-xs mt-1 text-amber-900">
                ยืนยัน OTP แล้วแต่ยังไม่ได้สร้างบัญชี — กดสมัครต่อเพื่อเข้าใช้งานได้จริง
              </p>
              <Link
                to="/register"
                className="inline-block mt-2 text-xs font-semibold text-amber-900 underline"
              >
                ดำเนินการสมัครต่อ →
              </Link>
            </div>
          </div>
        ) : null}

        <div className="mb-6 bg-sky-50 border border-sky-100 rounded-lg p-3 text-sm text-sky-900 flex items-start gap-2">
          <Info size={16} className="text-sky-600 flex-shrink-0 mt-0.5" />
          <p>
            กรอกเบอร์โทรและรหัสผ่านที่ตั้งไวตอนสมัคร แล้วกดเข้าสู่ระบบได้เลย —
            ไม่ต้องขอ OTP ซ้ำค่ะ
            {signupsEnabled ? (
              <>
                {" "}
                หากยืนยัน OTP แล้วแต่ยังเข้าไม่ได้ อาจยังไม่ได้กด{" "}
                <strong>สมัครสมาชิก — ขั้นสุดท้าย</strong>{" "}
                <Link to="/register" className="text-sky-700 underline font-medium">
                  กลับไปสมัครต่อ
                </Link>
              </>
            ) : null}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg text-sm border text-center leading-relaxed bg-amber-50 text-amber-950 border-amber-200">
            {error}
            {signupsEnabled &&
            /ยังไม่มีบัญชี|สมัครสมาชิกขั้นสุดท้าย/i.test(error) ? (
              <div className="mt-3">
                <Link
                  to="/register"
                  className="inline-block w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-sm"
                >
                  สมัครต่อ — ขั้นสุดท้าย
                </Link>
              </div>
            ) : null}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Smartphone size={16} className="inline mr-1" />
              {t("auth.phone")}
            </label>
            <input
              type="tel"
              required
              inputMode="tel"
              className="w-full px-4 py-3 text-gray-900 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500 transition-all"
              placeholder="0812345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => {
                const n = normalizePhoneForApi(phone);
                if (n && n !== phone) setPhone(n);
              }}
              disabled={loading}
              autoComplete="tel"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Lock size={16} className="inline mr-1" />
              รหัสผ่าน
            </label>
            <input
              type="password"
              required
              className="w-full px-4 py-3 border text-gray-800 border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500 transition-all"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-colors shadow-lg shadow-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>

        <div className="mt-6 text-center space-y-1">
          <p className="text-sm text-gray-600">
            {t("auth.no_account")}{" "}
            {signupsEnabled ? (
              <Link
                to="/register"
                className="text-emerald-600 hover:underline font-medium"
              >
                {t("auth.register")}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() =>
                  notify(
                    "การสมัครสมาชิกถูกปิดชั่วคราวโดยผู้ดูแลระบบ",
                    "warning",
                  )
                }
                className="text-slate-400 cursor-not-allowed font-medium"
              >
                {t("auth.register")}
              </button>
            )}
          </p>
          <p className="text-sm text-gray-500">
            <Link
              to="/forgot-password"
              className="text-sky-600 hover:underline"
            >
              ลืมรหัสผ่าน
            </Link>
          </p>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-100 text-center">
          <span className="inline-flex items-center text-xs text-slate-400">
            <Shield size={12} className="mr-1" /> Admin Portal: AQOND ADMIN
          </span>
        </div>
      </div>
    </div>
  );
};
