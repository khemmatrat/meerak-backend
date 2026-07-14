import React, { useState, useEffect, useCallback, useMemo } from "react";
import { flushSync } from "react-dom";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { MockApi, registerViaBackendApi } from "../services/mockApi";
import { useLanguage } from "../context/LanguageContext";
import {
  Globe,
  User,
  Briefcase,
  FileText,
  X,
  Smartphone,
  CheckCircle,
  Clock,
  Shield,
  Gift,
  Lock,
} from "lucide-react";
import { UserProfile, UserRole } from "../types";
import { api } from "../services/api";
import {
  fetchCompliancePolicies,
  fetchCompliancePolicy,
} from "../services/compliancePolicyService";
import {
  sendOTP,
  resendOTP,
  verifyOTP as verifyFirebaseOTP,
  resetPhoneAuth,
  warmRecaptchaVerifier,
} from "../services/phoneAuth";
import { GrandOpeningOverlay } from "../components/GrandOpeningOverlay";
import { useNotification } from "../context/NotificationContext";
import {
  clearRegistrationDraft,
  loadRegistrationDraft,
  saveRegistrationDraft,
} from "../services/registrationSession";
import { normalizePhoneForApi } from "../services/phoneNormalize";

/** หลังสมัครสำเร็จ — นำทางภายในแอปเท่านั้น (กัน open redirect) */
function getPostRegisterPath(searchParams: URLSearchParams): string {
  const raw = searchParams.get("next");
  if (!raw) return "/";
  let p: string;
  try {
    p = decodeURIComponent(raw).trim();
  } catch {
    return "/";
  }
  if (!p.startsWith("/") || p.startsWith("//")) return "/";
  if (p === "/kyc") return "/kyc";
  if (p === "/profile" || p.startsWith("/profile?")) {
    return p.startsWith("/profile?") ? p : "/profile";
  }
  return "/";
}

/** ตรวจเบราว์เซอร์ในแอพ (Facebook LINE ฯลฯ) ที่มักตัดคำขอไป API หลุด */
function isLikelyEmbeddedInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /FBAN|FBAV|FB_IAB|Instagram|Line\/|\bwv\)|; wv |\bMessenger\b|TikTok/i.test(
    navigator.userAgent || "",
  );
}

/** ขั้นตอนหน้าการสมัคร — เน้นว่ายังไม่เสร็จจนกว่าจะได้ JWT จาก backend */
const REGISTER_DETAIL_STAGES = [
  "ยืนยันเบอร์แล้ว — กำลังสร้างบัญชี",
  "กำลังบันทึกข้อมูลลงระบบ",
  "กำลังเตรียมเข้าใช้งาน",
  "เกือบเสร็จแล้ว",
];

function inferBannerToneFromRegisterFailure(
  err: unknown,
  message: string,
): "validation" | "soft" {
  if (/เบอร์โทรนี้มีบัญชีแล้ว|มีบัญชีอยู่แล้ว/i.test(message)) return "soft";
  if (
    /^กรุณา|^รหัสผ่านต้อง|ยอมรับข้อกำหนด/i.test(message.trim()) ||
    /invalid|incorrect password|wrong password/i.test(message)
  )
    return "validation";
  if (axios.isAxiosError(err)) {
    const st = err.response?.status;
    if (st === 400 || st === 401 || st === 403) return "validation";
  }
  return "soft";
}

async function silentLoginRecover(
  phone: string,
  password: string,
): Promise<{ token: string; user: UserProfile } | null> {
  try {
    return await MockApi.login(phone, password);
  } catch {
    return null;
  }
}

async function accountExistsHintByPhone(phone: string): Promise<boolean> {
  try {
    const id = encodeURIComponent(String(phone).trim());
    if (!id) return false;
    const res = await api.get(`/users/profile/${id}`, {
      validateStatus: () => true,
    });
    return res.status === 200 && !!res.data?.id;
  } catch {
    return false;
  }
}

export const Register: React.FC = () => {
  // Simple OTP Gatekeeper Flow
  const [step, setStep] = useState<"phone" | "otp" | "details">("phone");
  const [phone, setPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [firebaseUid, setFirebaseUid] = useState<string | null>(null); // ✅ เก็บ Firebase UID

  // Registration Form
  const [formData, setFormData] = useState({
    name: "",
    password: "",
    role: UserRole.USER,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [bannerTone, setBannerTone] = useState<"validation" | "soft">(
    "validation",
  );
  const [retryBanner, setRetryBanner] = useState("");
  const [detailProgressPhase, setDetailProgressPhase] = useState(0);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showCommunity, setShowCommunity] = useState(false);
  const [termsContent, setTermsContent] = useState("");
  const [privacyContent, setPrivacyContent] = useState("");
  const [communityContent, setCommunityContent] = useState("");
  const [loadingPolicies, setLoadingPolicies] = useState(true);
  const { login } = useAuth();
  const { notify } = useNotification();
  const { t, language, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [embeddedBrowser, setEmbeddedBrowser] = useState(false);
  const [manualRefCode, setManualRefCode] = useState("");
  const inviteRefCode = useMemo(() => {
    const fromUrl =
      searchParams.get("ref") || searchParams.get("referral") || "";
    if (fromUrl.trim()) return fromUrl.trim().toUpperCase();
    try {
      const fromLs = localStorage.getItem("referral_code");
      if (fromLs?.trim()) return fromLs.trim().toUpperCase();
    } catch {
      /* ignore */
    }
    return null;
  }, [searchParams]);
  const refCodeLocked = Boolean(inviteRefCode);
  const refCode =
    inviteRefCode ||
    (manualRefCode.trim() ? manualRefCode.trim().toUpperCase() : null);
  const [referrerPreview, setReferrerPreview] = useState<{
    valid: boolean;
    name?: string | null;
  } | null>(null);

  /** คีย์ความคงใจหนึ่งครั้งต่อวงจรสมัคร — ให้ Phase 2 (Idempotency-Key) และ telemetry รุ่นใหม่ของ backend */
  const registrationIdempotencyKey = useMemo(
    () =>
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `reg_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`,
    [],
  );

  const finalizeAuthAndNavigate = useCallback(
    (user: UserProfile, token: string, options?: { recovered?: boolean }) => {
      resetPhoneAuth();
      clearRegistrationDraft();
      flushSync(() => {
        login(user, token);
      });
      if (refCode) localStorage.removeItem("referral_code");

      const rawNext = searchParams.get("next");
      let dest = getPostRegisterPath(searchParams);
      if (dest === "/") {
        dest = "/onboarding/compass";
      }
      if (rawNext) {
        try {
          const p = decodeURIComponent(rawNext).trim();
          if (p.startsWith("/") && !p.startsWith("//")) dest = p;
        } catch {
          /* keep dest */
        }
      }

      navigate(dest, { replace: true });
      notify(
        options?.recovered
          ? "เข้าสู่ระบบสำเร็จ — เราพาคุณเข้าระบบต่อจากบัญชีที่มีอยู่โดยอัตโนมัติ ใช้งานได้ทันที"
          : "สมัครสำเร็จ — ใช้งานแอปได้ทันที ยืนยันตัวตน (KYC) ทำทีหลังได้ แต่จำเป็นต้องครบก่อนถอนเงินและก่อนรับงานมูลค่าสูง",
        "success",
      );
      void (async () => {
        try {
          const [termsPol, privacyPol] = await Promise.all([
            fetchCompliancePolicy("terms"),
            fetchCompliancePolicy("privacy"),
          ]);
          if (termsPol) {
            await api.post("/compliance/accept", {
              policy_id: termsPol.id,
              policy_type: "terms",
              policy_version: termsPol.version,
            });
          }
          if (privacyPol) {
            await api.post("/compliance/accept", {
              policy_id: privacyPol.id,
              policy_type: "privacy",
              policy_version: privacyPol.version,
            });
          }
        } catch (err) {
          console.error("Failed to record policy acceptance:", err);
        }
      })();
    },
    [login, navigate, notify, searchParams, refCode],
  );

  // OTP Countdown
  useEffect(() => {
    if (otpCountdown > 0) {
      const timer = setTimeout(() => setOtpCountdown(otpCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [otpCountdown]);

  useEffect(() => {
    setEmbeddedBrowser(isLikelyEmbeddedInAppBrowser());
  }, []);

  /** กู้คืนหลัง Android kill WebView — อย่าให้ user ไป login โดยไม่มีบัญชีใน DB */
  useEffect(() => {
    const draft = loadRegistrationDraft();
    if (!draft) return;
    setPhone((prev) => prev || draft.phone);
    setFirebaseUid((prev) => prev || draft.firebaseUid);
    setStep("details");
  }, []);

  useEffect(() => {
    if (step === "phone" || step === "otp") {
      void warmRecaptchaVerifier();
    }
  }, [step]);

  const handleResendOtp = async () => {
    if (otpCountdown > 240) {
      setBannerTone("soft");
      setError("รอสักครู่แล้วกดส่งรหัสใหม่ได้อีกครั้งนะคะ");
      return;
    }
    setLoading(true);
    setError("");
    setBannerTone("validation");
    try {
      const result = await resendOTP(phone);
      if (!result.success) {
        setBannerTone("soft");
        setError(result.message);
        return;
      }
      setOtpCountdown(300);
      setOtpCode("");
      setBannerTone("soft");
      setError("ส่งรหัสใหม่แล้ว กรุณาตรวจ SMS อีกครั้งค่ะ");
    } catch {
      setBannerTone("soft");
      setError("ส่งรหัสไม่สำเร็จชั่วคราว กดส่งรหัสอีกครั้งได้เลยค่ะ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!inviteRefCode) {
      setReferrerPreview(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await api.get<{ valid: boolean; referrerName?: string }>(
          `/referral/validate/${encodeURIComponent(inviteRefCode)}`,
        );
        if (!cancelled) {
          setReferrerPreview({
            valid: !!res.data?.valid,
            name: res.data?.referrerName,
          });
        }
      } catch {
        if (!cancelled) setReferrerPreview({ valid: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inviteRefCode]);

  useEffect(() => {
    if (!loading || step !== "details") {
      setDetailProgressPhase(0);
      return;
    }
    setDetailProgressPhase(1);
    const t2 = window.setTimeout(() => setDetailProgressPhase(2), 1400);
    const t3 = window.setTimeout(() => setDetailProgressPhase(3), 3000);
    return () => {
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [loading, step]);

  useEffect(() => {
    const loadPolicies = async () => {
      setLoadingPolicies(true);
      try {
        const policies = await fetchCompliancePolicies([
          "terms",
          "privacy",
          "community_guidelines",
        ]);
        if (policies.terms?.content) setTermsContent(policies.terms.content);
        if (policies.privacy?.content)
          setPrivacyContent(policies.privacy.content);
        if (policies.community_guidelines?.content)
          setCommunityContent(policies.community_guidelines.content);
      } catch (err) {
        console.error("Failed to load policies:", err);
      } finally {
        setLoadingPolicies(false);
      }
    };
    loadPolicies();
  }, []);

  // Step 1: Send Firebase OTP (Gatekeeper)
  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!phone || normalizePhoneForApi(phone).length < 9) {
      setBannerTone("validation");
      setError("กรุณากรอกเบอร์โทรศัพท์ให้ครบ");
      return;
    }

    const phoneForOtp = normalizePhoneForApi(phone);
    if (phoneForOtp !== phone.trim()) {
      setPhone(phoneForOtp);
    }

    setLoading(true);
    setError("");
    setBannerTone("validation");

    try {
      // Send OTP (Frontend validation only)
      const result = await sendOTP(phoneForOtp);

      if (!result.success) {
        setBannerTone("soft");
        setError(result.message);
        setLoading(false);
        return;
      }

      setOtpCountdown(300); // 5 minutes
      setStep("otp");
      console.log("📱 Firebase OTP sent");
    } catch (err: any) {
      console.error("Send OTP error:", err);
      setBannerTone("soft");
      setError(
        "กำลังดำเนินการต่อ — ระบบกำลังตรวจสอบข้อมูล โปรลองส่งรหัสอีกครั้งในอีกสักครู่",
      );
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify OTP (Gatekeeper passed)
  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!otpCode || otpCode.length !== 6) {
      setBannerTone("validation");
      setError("กรุณากรอกรหัส OTP 6 หลัก");
      return;
    }

    setLoading(true);
    setError("");
    setBannerTone("validation");

    try {
      const result = await verifyFirebaseOTP(otpCode);

      if (!result.success) {
        setBannerTone("validation");
        setError(result.message);
        setLoading(false);
        return;
      }

      console.log("✅ Firebase OTP verified - Gatekeeper passed!");
      console.log("📱 Firebase UID:", result.firebase_uid); // ✅ เก็บ UID

      const uid = result.firebase_uid || null;
      setFirebaseUid(uid);
      if (uid) {
        saveRegistrationDraft({
          phone: normalizePhoneForApi(phone),
          firebaseUid: uid,
        });
      }

      // Move to registration form (ยังไม่ใช่การสมัครสำเร็จ — ต้องกรอกชื่อ+รหัสผ่านแล้วกดส่ง)
      setStep("details");
      setLoading(false);
    } catch (err: any) {
      console.error("Verify OTP error:", err);
      setBannerTone("validation");
      setError("รหัส OTP ไม่ถูกต้อง กรุณาลองใหม่");
      setLoading(false);
    }
  };

  // Step 3: Complete Registration with existing Backend API
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setRetryBanner("");
    setError("");
    setBannerTone("validation");

    if (!formData.name || formData.name.trim().length < 2) {
      setBannerTone("validation");
      setError("กรุณากรอกชื่อ-นามสกุลให้ครบถ้วน");
      setLoading(false);
      return;
    }

    if (!formData.password || formData.password.length < 6) {
      setBannerTone("validation");
      setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
      setLoading(false);
      return;
    }

    if (!termsAccepted) {
      setBannerTone("validation");
      setError("กรุณายอมรับข้อกำหนดและเงื่อนไขก่อนสมัครสมาชิก");
      setLoading(false);
      return;
    }

    const draft = loadRegistrationDraft();
    const resolvedFirebaseUid =
      firebaseUid?.trim() || draft?.firebaseUid?.trim() || null;
    const resolvedPhone = phone.trim() || draft?.phone?.trim() || "";

    if (!resolvedFirebaseUid) {
      setBannerTone("validation");
      setError(
        "ยืนยันเบอร์หมดอายุหรือข้อมูลหาย — กรุณายืนยัน OTP ใหม่อีกครั้งก่อนสมัคร (อย่าไปหน้าเข้าสู่ระบบจนกว่าจะเห็นข้อความสมัครสำเร็จ)",
      );
      setStep("phone");
      clearRegistrationDraft();
      setLoading(false);
      return;
    }

    if (!resolvedPhone) {
      setBannerTone("validation");
      setError("กรุณากรอกเบอร์โทรศัพท์ให้ครบ");
      setStep("phone");
      setLoading(false);
      return;
    }

    if (!firebaseUid && resolvedFirebaseUid) {
      setFirebaseUid(resolvedFirebaseUid);
    }
    if (!phone.trim() && resolvedPhone) {
      setPhone(resolvedPhone);
    }

    try {
      const { token, user } = await registerViaBackendApi(
        {
          ...formData,
          phone: resolvedPhone,
          firebase_uid: resolvedFirebaseUid,
          referral_code: refCode || undefined,
        },
        {
          onTransportRetry: () => {
            setRetryBanner("กำลังเชื่อมต่อใหม่...");
          },
          idempotencyKey: registrationIdempotencyKey,
        },
      );

      finalizeAuthAndNavigate(user, token, { recovered: false });
    } catch (err: unknown) {
      const recovered = await silentLoginRecover(
        resolvedPhone,
        formData.password,
      );
      if (recovered) {
        finalizeAuthAndNavigate(recovered.user, recovered.token, {
          recovered: true,
        });
        setRetryBanner("");
        return;
      }

      let rawMsg =
        err instanceof Error && err.message
          ? err.message
          : "ยังสร้างบัญชีไม่สำเร็จ — กรุณากดสมัครสมาชิกอีกครั้ง (อย่าไปหน้าเข้าสู่ระบบจนกว่าจะเห็นข้อความสมัครสำเร็จ)";

      if (/เบอร์โทรนี้มีบัญชีแล้ว/i.test(rawMsg)) {
        const exists = await accountExistsHintByPhone(resolvedPhone);
        if (exists) {
          rawMsg =
            "บัญชีจากเบอร์นี้มีอยู่แล้ว — ลองกดเข้าสู่ระบบด้วยรหัสผ่านเดิม ระบบพร้อมพาคุณเข้าใช้งานได้ทันที";
        }
      }

      const tone = inferBannerToneFromRegisterFailure(err, rawMsg);
      setBannerTone(tone);
      setError(rawMsg);
    } finally {
      setLoading(false);
      setRetryBanner("");
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
        <div className="text-center mb-6">
          <img
            src="/logo.png"
            alt="AQOND"
            className="h-12 w-12 mx-auto mb-4 object-contain rounded-xl"
            width={48}
            height={48}
          />
          <h1 className="text-2xl font-bold text-gray-900">
            {t("auth.create_account")}
          </h1>
        </div>

        {error && (
          <div
            className={`p-3 rounded-lg text-sm mb-4 border text-center leading-relaxed ${
              bannerTone === "soft"
                ? "bg-amber-50 text-amber-950 border-amber-200"
                : "bg-slate-50 text-slate-800 border-slate-200"
            }`}
          >
            {error}
          </div>
        )}

        {/* reCAPTCHA — invisible, off-screen (Firebase requirement) */}
        <div
          id="recaptcha-container"
          className="recaptcha-host"
          aria-hidden="true"
        />

        {embeddedBrowser && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-950 mb-4 leading-relaxed">
            <strong>คำแนะนำ:</strong> เมื่อเข้าจาก Facebook / LINE
            เบราว์เซอร์ในแอพบางรุ่นส่งคำขอถึงเซิร์ฟเวอร์ไม่เสถียรได้ —
            เพื่อลดความเสี่ยง{" "}
            <strong>แนะนำเปิด app.aqond.com ใน Chrome หรือ Safari</strong>
          </div>
        )}

        {/* Step 1: Enter Phone Number */}
        {step === "phone" && (
          <form onSubmit={handleSendOTP} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Smartphone size={16} className="inline mr-1" />
                {t("auth.phone")}
              </label>
              <input
                type="tel"
                required
                className="w-full px-4 py-2.5 border text-gray-800 border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="0812345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={loading}
              />
              <p className="text-xs text-gray-500 mt-1 flex items-center">
                <Shield size={12} className="mr-1" />
                เราจะส่งรหัส OTP เพื่อยืนยันเบอร์โทรศัพท์
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
          <form onSubmit={handleVerifyOTP} className="space-y-4">
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
                className="w-full px-4 py-3 border border-gray-300 text-gray-800 rounded-lg focus:ring-emerald-500 focus:border-emerald-500 text-center text-2xl tracking-widest font-mono"
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
              disabled={loading}
              onClick={() => void handleResendOtp()}
              className="w-full py-2 text-sm text-sky-600 hover:text-sky-700 font-medium disabled:opacity-50"
            >
              ไม่ได้รับรหัส? ส่งใหม่อีกครั้ง
            </button>
          </form>
        )}

        {/* Step 3: Complete Registration Details */}
        {step === "details" && (
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm mb-4 space-y-2">
              <div className="flex items-start gap-2">
                <CheckCircle
                  className="text-amber-700 mr-0 flex-shrink-0 mt-0.5"
                  size={16}
                />
                <div>
                  <p className="font-semibold text-amber-950">
                    ขั้นที่ 2/2 — ยืนยันเบอร์แล้ว ({phone})
                  </p>
                  <p className="text-amber-900 text-xs mt-1 leading-relaxed">
                    ยัง<strong>ไม่ใช่การสมัครสำเร็จ</strong> — กรุณากรอกชื่อและรหัสผ่าน
                    แล้วกด <strong>สมัครสมาชิก</strong> ด้านล่าง
                    จนกว่าจะเห็นข้อความสมัครสำเร็จ จึงจะเข้าสู่ระบบได้
                  </p>
                </div>
              </div>
            </div>

            {loading && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/95 p-4 text-sm mb-4 space-y-3">
                <p className="font-medium text-emerald-950">ความคืบหน้า</p>
                <ul className="space-y-2.5">
                  {REGISTER_DETAIL_STAGES.map((label, idx) => {
                    const doneDuringLoad =
                      idx === 0 ||
                      (detailProgressPhase > 0 && detailProgressPhase > idx);
                    const activeDuringLoad =
                      detailProgressPhase > 0 && detailProgressPhase === idx;
                    return (
                      <li
                        key={label}
                        className={`flex items-center gap-2 text-xs sm:text-sm ${
                          activeDuringLoad
                            ? "text-emerald-900 font-semibold"
                            : doneDuringLoad
                              ? "text-emerald-800"
                              : "text-emerald-600/65"
                        }`}
                      >
                        <span className="flex-shrink-0 w-5 flex justify-center">
                          {doneDuringLoad ? (
                            <CheckCircle
                              size={18}
                              className="text-emerald-600"
                            />
                          ) : activeDuringLoad ? (
                            <span
                              className="inline-block h-3.5 w-3.5 rounded-full border-2 border-emerald-600 border-t-transparent animate-spin"
                              aria-hidden
                            />
                          ) : (
                            <span className="h-2 w-2 rounded-full bg-emerald-200" />
                          )}
                        </span>
                        {label}
                      </li>
                    );
                  })}
                </ul>
                {retryBanner ? (
                  <p className="text-xs text-amber-950 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                    {retryBanner}
                  </p>
                ) : null}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("auth.name")}
              </label>
              <input
                type="text"
                required
                className="w-full px-4 py-2.5 border text-gray-800 border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="ชื่อ-นามสกุล"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("auth.password")}
              </label>
              <input
                type="password"
                required
                className="w-full px-4 py-2.5 border text-gray-800 border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
              />
            </div>

            {/* รหัสเพื่อนแนะนำ */}
            <div
              className={`p-4 rounded-xl border ${
                refCodeLocked
                  ? "bg-emerald-50/90 border-emerald-200"
                  : "bg-amber-50/80 border-amber-200/60"
              }`}
            >
              <label className="block text-sm font-medium mb-2 flex items-center gap-2 text-emerald-900">
                {refCodeLocked ? (
                  <Lock size={16} className="text-emerald-600 shrink-0" />
                ) : (
                  <Gift size={16} className="text-amber-600 shrink-0" />
                )}
                {refCodeLocked
                  ? "สมัครต่อจากเพื่อนที่แนะนำ"
                  : "รหัสเพื่อนแนะนำ (ถ้ามี)"}
              </label>
              <input
                type="text"
                readOnly={refCodeLocked}
                value={refCodeLocked ? inviteRefCode || "" : manualRefCode}
                onChange={(e) => {
                  if (!refCodeLocked) {
                    setManualRefCode(e.target.value.toUpperCase());
                  }
                }}
                placeholder="เช่น ABC12345"
                maxLength={12}
                className={`w-full px-4 py-2.5 rounded-lg border-2 font-mono text-sm tracking-wider placeholder:text-gray-400 ${
                  refCodeLocked
                    ? "border-emerald-300 bg-white text-emerald-900 cursor-default"
                    : "border-amber-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                }`}
              />
              {refCodeLocked && inviteRefCode ? (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-emerald-700 flex items-center gap-1">
                    <CheckCircle size={12} />
                    รหัส {inviteRefCode} ถูกล็อกแล้ว —
                    สมัครสำเร็จจะผูกกับผู้แนะนำ
                  </p>
                  {referrerPreview?.valid && referrerPreview.name ? (
                    <p className="text-xs text-emerald-800 font-medium">
                      แนะนำโดย: {referrerPreview.name}
                    </p>
                  ) : null}
                  {referrerPreview && !referrerPreview.valid ? (
                    <p className="text-xs text-amber-700">
                      ไม่พบรหัสนี้ในระบบ — ตรวจสอบลิงก์จากเพื่อนอีกครั้ง
                    </p>
                  ) : null}
                </div>
              ) : refCode ? (
                <p className="mt-1.5 text-xs text-emerald-600 flex items-center gap-1">
                  <CheckCircle size={12} /> รหัส {refCode}{" "}
                  จะถูกบันทึกเมื่อสมัครสำเร็จ
                </p>
              ) : null}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t("auth.i_want_to")}
              </label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() =>
                    setFormData({ ...formData, role: UserRole.USER })
                  }
                  className={`p-4 rounded-xl border-2 flex flex-col items-center justify-center transition-all ${formData.role === UserRole.USER ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-200 hover:border-gray-300 text-gray-500"}`}
                >
                  <User size={24} className="mb-2" />
                  <span className="text-xs font-bold">
                    {t("auth.role_user")}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setFormData({ ...formData, role: UserRole.PROVIDER })
                  }
                  className={`p-4 rounded-xl border-2 flex flex-col items-center justify-center transition-all ${formData.role === UserRole.PROVIDER ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-200 hover:border-gray-300 text-gray-500"}`}
                >
                  <Briefcase size={24} className="mb-2" />
                  <span className="text-xs font-bold">
                    {t("auth.role_provider")}
                  </span>
                </button>
              </div>
            </div>

            {/* Terms & Privacy — คนขับ: ลิงก์หน้า /#/terms และ /#/privacy ตาม Legal สาธารณะ */}
            {formData.role === UserRole.PROVIDER ? (
              <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <input
                  type="checkbox"
                  id="terms-provider"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-1 w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                />
                <label
                  htmlFor="terms-provider"
                  className="text-sm text-gray-700 leading-relaxed"
                >
                  ฉันยอมรับ{" "}
                  <Link
                    to="/terms"
                    className="text-emerald-600 hover:underline font-medium inline-flex items-center gap-1"
                  >
                    <FileText size={14} />
                    เงื่อนไขการให้บริการ (Terms)
                  </Link>
                  {" และ "}
                  <Link
                    to="/privacy"
                    className="text-emerald-600 hover:underline font-medium"
                  >
                    นโยบายความเป็นส่วนตัว (Privacy)
                  </Link>
                </label>
              </div>
            ) : (
              <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <input
                  type="checkbox"
                  id="terms"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-1 w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                />
                <label htmlFor="terms" className="text-sm text-gray-700">
                  ฉันได้อ่านและยอมรับ{" "}
                  <button
                    type="button"
                    onClick={() => setShowTerms(true)}
                    className="text-emerald-600 hover:underline font-medium inline-flex items-center gap-1"
                  >
                    <FileText size={14} />
                    ข้อกำหนดและเงื่อนไขการใช้บริการ
                  </button>
                  {", "}
                  <button
                    type="button"
                    onClick={() => setShowPrivacy(true)}
                    className="text-emerald-600 hover:underline font-medium"
                  >
                    นโยบายความเป็นส่วนตัว
                  </button>
                  {" และ "}
                  <button
                    type="button"
                    onClick={() => setShowCommunity(true)}
                    className="text-emerald-600 hover:underline font-medium"
                  >
                    แนวทางปฏิบัติของชุมชน
                  </button>
                </label>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !termsAccepted}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-colors shadow-lg shadow-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed mt-4"
            >
              {loading ? "กำลังสร้างบัญชี..." : "สมัครสมาชิก — ขั้นสุดท้าย"}
            </button>
          </form>
        )}

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            {t("auth.have_account")}{" "}
            <Link
              to="/login"
              className="text-emerald-600 hover:underline font-medium"
            >
              {t("auth.login")}
            </Link>
          </p>
        </div>
      </div>

      {/* Terms Modal */}
      {showTerms && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <FileText size={20} className="text-emerald-600" />
                ข้อกำหนดและเงื่อนไขการใช้บริการ Akonda
              </h3>
              <button
                onClick={() => setShowTerms(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 bg-white">
              {loadingPolicies ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mb-4"></div>
                  <p className="text-slate-500">กำลังโหลดข้อกำหนด...</p>
                </div>
              ) : (
                <div
                  className="prose prose-slate max-w-none text-gray-800"
                  dangerouslySetInnerHTML={{
                    __html:
                      termsContent ||
                      '<p className="text-slate-500 text-center">ไม่พบเนื้อหา</p>',
                  }}
                />
              )}
            </div>
            <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => setShowTerms(false)}
                className="px-6 py-2 border border-slate-300 rounded-lg font-bold text-slate-700 hover:bg-slate-50"
              >
                ปิด
              </button>
              <button
                onClick={() => {
                  setTermsAccepted(true);
                  setShowTerms(false);
                }}
                className="px-6 py-2 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700"
              >
                ยอมรับและดำเนินการต่อ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Privacy Modal */}
      {showPrivacy && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <FileText size={20} className="text-blue-600" />
                นโยบายความเป็นส่วนตัว - Akonda
              </h3>
              <button
                onClick={() => setShowPrivacy(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 bg-white">
              {loadingPolicies ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                  <p className="text-slate-500">กำลังโหลดนโยบาย...</p>
                </div>
              ) : (
                <div
                  className="prose prose-slate max-w-none text-gray-800"
                  dangerouslySetInnerHTML={{
                    __html:
                      privacyContent ||
                      '<p className="text-slate-500 text-center">ไม่พบเนื้อหา</p>',
                  }}
                />
              )}
            </div>
            <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => setShowPrivacy(false)}
                className="px-6 py-2 border border-slate-300 rounded-lg font-bold text-slate-700 hover:bg-slate-50"
              >
                ปิด
              </button>
              <button
                onClick={() => {
                  setTermsAccepted(true);
                  setShowPrivacy(false);
                }}
                className="px-6 py-2 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700"
              >
                ยอมรับและดำเนินการต่อ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Community Guidelines Modal */}
      {showCommunity && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <FileText size={20} className="text-purple-600" />
                แนวทางปฏิบัติของชุมชน Akonda
              </h3>
              <button
                onClick={() => setShowCommunity(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 bg-white">
              {loadingPolicies ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mb-4"></div>
                  <p className="text-slate-500">กำลังโหลดแนวทาง...</p>
                </div>
              ) : (
                <div
                  className="prose prose-slate max-w-none text-gray-800"
                  dangerouslySetInnerHTML={{
                    __html:
                      communityContent ||
                      '<p className="text-slate-500 text-center">กำลังปรับปรุงนโยบาย</p>',
                  }}
                />
              )}
            </div>
            <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => setShowCommunity(false)}
                className="px-6 py-2 border border-slate-300 rounded-lg font-bold text-slate-700 hover:bg-slate-50"
              >
                ปิด
              </button>
              <button
                onClick={() => {
                  setTermsAccepted(true);
                  setShowCommunity(false);
                }}
                className="px-6 py-2 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700"
              >
                ยอมรับและดำเนินการต่อ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
