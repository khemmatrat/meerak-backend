import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { MockApi } from "../services/mockApi";
import { useLanguage } from "../context/LanguageContext";
import {
  Globe,
  User,
  Briefcase,
  AlertOctagon,
  Shield,
  Smartphone,
  CheckCircle,
  Clock,
  Lock,
} from "lucide-react";
import { UserRole } from "../types";

// Phase 1: Import new services - Firebase Phone Auth
import { sendOTP, verifyOTP as verifyFirebaseOTP, resetPhoneAuth } from "../services/phoneAuth";
export const Login: React.FC = () => {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const navigate = useNavigate();

  // Simple OTP Gatekeeper Flow
  const [step, setStep] = useState<"phone" | "otp" | "password">("phone");
  const [otpCode, setOtpCode] = useState("");
  const [otpCountdown, setOtpCountdown] = useState(0);

  // Countdown timer for OTP
  useEffect(() => {
    if (otpCountdown > 0) {
      const timer = setTimeout(() => setOtpCountdown(otpCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [otpCountdown]);

  // Step 1: Send Firebase OTP (Gatekeeper)
  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!phone || phone.trim().length < 9) {
      setError('กรุณากรอกเบอร์โทรศัพท์ให้ครบ');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await sendOTP(phone);
      
      if (!result.success) {
        setError(result.message);
        return;
      }
      
      setOtpCountdown(300); // 5 minutes
      setStep('otp');
      console.log('📱 Firebase OTP sent');
      
    } catch (err: any) {
      console.error('Send OTP error:', err);
      setError('ไม่สามารถส่ง OTP ได้ กรุณาลองใหม่');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify OTP (Gatekeeper passed)
  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!otpCode || otpCode.length !== 6) {
      setError('กรุณากรอกรหัส OTP 6 หลัก');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await verifyFirebaseOTP(otpCode);

      if (!result.success) {
        setError(result.message);
        setLoading(false);
        return;
      }

      console.log('✅ Firebase OTP verified - Gatekeeper passed!');
      // ใช้เบอร์จาก Firebase ที่ verify แล้ว (รูปแบบ +66812345678) แปลงเป็น 0812345678
      if (result.phone) {
        const p = result.phone.replace(/^\+/, '').replace(/\s/g, '');
        const normalized = p.startsWith('66') && p.length >= 10 ? '0' + p.slice(2) : p.startsWith('0') ? p : '0' + p;
        setPhone(normalized);
      }
      // Move to password step
      setStep('password');
      setLoading(false);

    } catch (error: any) {
      console.error('Verify OTP error:', error);
      setError('รหัส OTP ไม่ถูกต้อง กรุณาลองใหม่');
      setLoading(false);
    }
  };
  
  // Step 3: Login with existing Backend API
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!password) {
      setError('กรุณากรอกรหัสผ่าน');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // เรียก API เดิม (ไม่ส่ง Firebase data ไปเพราะ Backend ไม่ต้องการ)
      const { token, user } = await MockApi.login(phone, password);
      login(user, token);
      handleLoginSuccess(user);
    } catch (error: any) {
      console.error('Login error:', error);
      setError(error.message || 'เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบรหัสผ่าน');
    } finally {
      setLoading(false);
    }
  };
  
  // Navigate after successful login
  const handleLoginSuccess = (user: any) => {
    if (user.role === UserRole.PROVIDER) {
      navigate("/provider/dashboard");
    } else {
      navigate("/employer/dashboard");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 relative">
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
          <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-2xl">A</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t("auth.welcome")}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {step === "phone" ? t("auth.subtitle") : step === "otp" ? "กรอกรหัส OTP" : "กรอกรหัสผ่าน"}
          </p>
        </div>

        {error && (
          <div className="mb-6">
            <div className="bg-red-50 text-red-600 p-4 rounded-lg text-sm border border-red-100 flex items-center">
              <AlertOctagon className="mr-2 flex-shrink-0" size={18} />
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* reCAPTCHA Container (invisible) */}
        <div id="recaptcha-container"></div>

        {/* Step 1: Enter Phone Number */}
        {step === "phone" && (
          <form onSubmit={handleSendOTP} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Smartphone size={16} className="inline mr-1" />
                {t("auth.phone")}
              </label>
              <input
                type="tel"
                required
                className="w-full px-4 py-3 text-gray-900 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500 transition-all"
                placeholder="0812345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={loading}
              />
              <p className="text-xs text-gray-500 mt-1 flex items-center">
                <Shield size={12} className="mr-1" />
                เราจะส่งรหัส OTP เพื่อยืนยันตัวตน
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-colors shadow-lg shadow-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "กำลังส่ง OTP..." : "ส่งรหัส OTP"}
            </button>
          </form>
        )}

        {/* Step 2: Verify OTP */}
        {step === "otp" && (
          <form onSubmit={handleVerifyOTP} className="space-y-6">
            {/* OTP Info */}
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm">
              <div className="flex items-start mb-2">
                <CheckCircle
                  className="text-blue-600 mr-2 flex-shrink-0 mt-0.5"
                  size={16}
                />
                <div>
                  <p className="font-medium text-blue-900">
                    รหัส OTP ถูกส่งไปยัง {phone}
                  </p>
                  <p className="text-blue-700 text-xs mt-1">
                    กรุณาตรวจสอบ SMS ของคุณ
                  </p>
                </div>
              </div>

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
                <Lock size={16} className="inline mr-1" />
                กรอกรหัส OTP 6 หลัก
              </label>
              <input
                type="text"
                required
                maxLength={6}
                pattern="[0-9]{6}"
                className="w-full px-4 py-3 border text-gray-900 border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500 transition-all text-center text-2xl tracking-widest font-mono"
                placeholder="● ● ● ● ● ●"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={loading || otpCode.length !== 6}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-colors shadow-lg shadow-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "กำลังตรวจสอบ..." : "ยืนยัน OTP"}
            </button>

            <button
              type="button"
              onClick={() => {
                resetPhoneAuth();
                setStep('phone');
                setOtpCode('');
              }}
              className="w-full py-2 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
            >
              ไม่ได้รับรหัส? ส่งใหม่อีกครั้ง
            </button>
          </form>
        )}
        
        {/* Step 3: Enter Password */}
        {step === "password" && (
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="bg-green-50 border border-green-100 rounded-lg p-4 text-sm mb-4">
              <div className="flex items-center">
                <CheckCircle className="text-green-600 mr-2" size={16} />
                <p className="font-medium text-green-900">
                  ยืนยันเบอร์โทรศัพท์สำเร็จ!
                </p>
              </div>
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
                autoFocus
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
        )}

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            {t("auth.no_account")}{" "}
            <Link
              to="/register"
              className="text-emerald-600 hover:underline font-medium"
            >
              {t("auth.register")}
            </Link>
          </p>
        </div>

        {/* Admin: ใช้แอป nexus-admin-core (แยกจากแอปหลัก) */}
        <div className="mt-8 pt-6 border-t border-gray-100 text-center">
          <span className="inline-flex items-center text-xs text-slate-400">
            <Shield size={12} className="mr-1" /> Admin Portal: AQOND ADMIN
          </span>
        </div>

      </div>
    </div>
  );
};
