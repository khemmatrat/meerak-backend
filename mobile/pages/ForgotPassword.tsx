import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MockApi } from "../services/mockApi";
import {
  sendOTP,
  resendOTP,
  verifyOTP as verifyFirebaseOTP,
  resetPhoneAuth,
  getFreshPhoneAuthIdToken,
  warmRecaptchaVerifier,
} from "../services/phoneAuth";
import {
  Lock,
  Smartphone,
  ArrowLeft,
  CheckCircle,
  Clock,
  Eye,
  EyeOff,
} from "lucide-react";

type Step = "phone" | "otp" | "password" | "success";

export const ForgotPassword: React.FC = () => {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firebaseToken, setFirebaseToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    resetPhoneAuth();
    void warmRecaptchaVerifier();
  }, []);

  useEffect(() => {
    if (step === "phone" || step === "otp") {
      void warmRecaptchaVerifier();
    }
  }, [step]);

  useEffect(() => {
    if (otpCountdown > 0) {
      const timer = setTimeout(() => setOtpCountdown(otpCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [otpCountdown]);

  // Step 1: ตรวจสอบเบอร์ในระบบ แล้วส่ง OTP
  const handleCheckPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!phone.trim() || phone.trim().length < 9) {
      setError("กรุณากรอกเบอร์โทรศัพท์ให้ครบ");
      return;
    }
    setLoading(true);
    try {
      await MockApi.requestPasswordReset(phone.trim());
      const result = await sendOTP(phone.trim());
      if (!result.success) {
        setError(result.message);
        return;
      }
      setOtpCountdown(300); // 5 นาที
      setStep("otp");
    } catch (err: any) {
      setError(err.message || "ไม่สามารถดำเนินการได้ กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  };

  // Step 2: ยืนยัน OTP
  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!otpCode || otpCode.length !== 6) {
      setError("กรุณากรอกรหัส OTP 6 หลัก");
      return;
    }
    setLoading(true);
    try {
      const result = await verifyFirebaseOTP(otpCode);
      if (!result.success) {
        setError(result.message);
        return;
      }
      if (result.firebase_token) {
        setFirebaseToken(result.firebase_token);
      }
      if (result.phone) {
        const p = result.phone.replace(/^\+/, "").replace(/\s/g, "");
        const normalized =
          p.startsWith("66") && p.length >= 10
            ? "0" + p.slice(2)
            : p.startsWith("0")
              ? p
              : "0" + p;
        setPhone(normalized);
      }
      setStep("password");
    } catch (err: any) {
      setError(err.message || "รหัส OTP ไม่ถูกต้อง กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  };

  // Step 3: ตั้งรหัสผ่านใหม่
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!newPassword || newPassword.length < 6) {
      setError("รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน");
      return;
    }
    let idToken = firebaseToken.trim();
    const fresh = await getFreshPhoneAuthIdToken();
    if (fresh) idToken = fresh;

    if (!idToken) {
      setError("หมดเวลายืนยันเบอร์แล้ว กรุณาขอรหัส OTP ใหม่ตั้งแต่ขั้นตอนแรก");
      setStep("phone");
      resetPhoneAuth();
      return;
    }
    setLoading(true);
    try {
      await MockApi.resetPassword(phone, newPassword, idToken);
      // Clear forgot-password session immediately after success
      resetPhoneAuth();
      setFirebaseToken("");
      setOtpCode("");
      setNewPassword("");
      setConfirmPassword("");
      setStep("success");
      // Navigate to login after a brief success ack (no auto JWT session)
      window.setTimeout(() => navigate("/login", { replace: true }), 1200);
    } catch (err: any) {
      setError(err.message || "ตั้งรหัสผ่านใหม่ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (otpCountdown > 240) {
      setError("รอสักครู่แล้วกดส่งรหัสใหม่ได้อีกครั้งนะคะ");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await resendOTP(phone.trim());
      if (!result.success) {
        setError(result.message);
        return;
      }
      setOtpCountdown(300);
      setOtpCode("");
      setError("ส่งรหัสใหม่แล้ว กรุณาตรวจ SMS อีกครั้งค่ะ");
    } catch {
      setError("ส่งรหัสไม่สำเร็จชั่วคราว กดส่งรหัสอีกครั้งได้เลยค่ะ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-amber-500 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Lock className="text-white" size={24} />
          </div>
          <h1 className="text-xl font-bold text-gray-900">ลืมรหัสผ่าน</h1>
          <p className="text-sm text-gray-500 mt-1">
            {step === "phone" &&
              "กรอกเบอร์โทรที่ใช้สมัครสมาชิก เพื่อขอรหัส OTP"}
            {step === "otp" && "กรอกรหัส OTP ที่ส่งไปยัง SMS ของคุณ"}
            {step === "password" && "ตั้งรหัสผ่านใหม่"}
            {step === "success" && "ตั้งรหัสผ่านใหม่สำเร็จ"}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg text-sm border text-center leading-relaxed bg-amber-50 text-amber-950 border-amber-200">
            {error}
          </div>
        )}

        <div
          id="recaptcha-container"
          className="recaptcha-host"
          aria-hidden="true"
        />

        {step === "phone" && (
          <form onSubmit={handleCheckPhone} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Smartphone size={14} className="inline mr-1" />
                เบอร์โทรศัพท์
              </label>
              <input
                type="tel"
                required
                inputMode="tel"
                autoComplete="tel"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                placeholder="08xxxxxxxx"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? "กำลังส่ง OTP..." : "ส่งรหัส OTP"}
            </button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={handleVerifyOTP} className="space-y-4">
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm">
              <p className="font-medium text-blue-900">
                รหัส OTP ถูกส่งไปยัง {phone}
              </p>
              {otpCountdown > 0 && (
                <div className="flex items-center text-blue-600 text-xs mt-2">
                  <Clock size={12} className="mr-1" />
                  หมดอายุใน {Math.floor(otpCountdown / 60)}:
                  {String(otpCountdown % 60).padStart(2, "0")}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                รหัส OTP 6 หลัก
              </label>
              <input
                type="text"
                required
                maxLength={6}
                pattern="[0-9]{6}"
                inputMode="numeric"
                autoComplete="one-time-code"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 text-center text-2xl tracking-widest font-mono"
                placeholder="●●●●●●"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <button
              type="submit"
              disabled={loading || otpCode.length !== 6}
              className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? "กำลังตรวจสอบ..." : "ยืนยัน OTP"}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void handleResendOTP()}
              className="w-full py-2 text-sm text-sky-600 hover:underline disabled:opacity-50"
            >
              ไม่ได้รับรหัส? ส่งใหม่อีกครั้ง
            </button>
          </form>
        )}

        {step === "password" && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
              <CheckCircle className="inline mr-2" size={16} />
              ยืนยันเบอร์โทรศัพท์สำเร็จ
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                รหัสผ่านใหม่
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? "text" : "password"}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="w-full px-4 py-3 pr-11 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                  placeholder="อย่างน้อย 6 ตัวอักษร"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={loading}
                />
                <button
                  type="button"
                  aria-label={showNewPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  onClick={() => setShowNewPassword((v) => !v)}
                  disabled={loading}
                >
                  {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ยืนยันรหัสผ่านใหม่
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="w-full px-4 py-3 pr-11 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                  placeholder="กรอกรหัสผ่านอีกครั้ง"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                />
                <button
                  type="button"
                  aria-label={
                    showConfirmPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  disabled={loading}
                >
                  {showConfirmPassword ? (
                    <EyeOff size={18} />
                  ) : (
                    <Eye size={18} />
                  )}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? "กำลังตั้งรหัสผ่าน..." : "ตั้งรหัสผ่านใหม่"}
            </button>
          </form>
        )}

        {step === "success" && (
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
              <CheckCircle
                className="text-emerald-600 shrink-0 mt-0.5"
                size={20}
              />
              <div className="text-sm text-emerald-800">
                <p className="font-medium">ตั้งรหัสผ่านใหม่สำเร็จ</p>
                <p className="mt-1">
                  คุณสามารถใช้รหัสผ่านใหม่เข้าสู่ระบบได้เลย
                  — กำลังพาไปหน้าเข้าสู่ระบบ…
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate("/login")}
              className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium"
            >
              <ArrowLeft size={18} /> ไปหน้าเข้าสู่ระบบ
            </button>
          </div>
        )}

        {step !== "success" && (
          <p className="mt-4 text-center text-sm text-gray-500">
            <Link
              to="/login"
              className="text-amber-600 hover:underline inline-flex items-center gap-1"
            >
              <ArrowLeft size={14} /> กลับไปเข้าสู่ระบบ
            </Link>
          </p>
        )}
      </div>
    </div>
  );
};
