import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MockApi } from '../services/mockApi';
import { useLanguage } from '../context/LanguageContext';
import { Globe, User, Briefcase, FileText, X, Smartphone, Lock, CheckCircle, Clock, Shield, Gift, Link2 } from 'lucide-react';
import { UserRole } from '../types';
import { api } from '../services/api';
import { fetchCompliancePolicies, fetchCompliancePolicy } from '../services/compliancePolicyService';
import { sendOTP, verifyOTP as verifyFirebaseOTP, resetPhoneAuth } from '../services/phoneAuth';
import { GrandOpeningOverlay } from '../components/GrandOpeningOverlay';
import { useNotification } from '../context/NotificationContext';

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

export const Register: React.FC = () => {
  // Simple OTP Gatekeeper Flow
  const [step, setStep] = useState<'phone' | 'otp' | 'details'>('phone');
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [firebaseUid, setFirebaseUid] = useState<string | null>(null); // ✅ เก็บ Firebase UID
  
  // Registration Form
  const [formData, setFormData] = useState({
      name: '',
      password: '',
      role: UserRole.USER
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showCommunity, setShowCommunity] = useState(false);
  const [termsContent, setTermsContent] = useState('');
  const [privacyContent, setPrivacyContent] = useState('');
  const [communityContent, setCommunityContent] = useState('');
  const [loadingPolicies, setLoadingPolicies] = useState(true);
  const { login } = useAuth();
  const { notify } = useNotification();
  const { t, language, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [manualRefCode, setManualRefCode] = useState('');
  const urlRefCode = searchParams.get('ref') || searchParams.get('referral') || localStorage.getItem('referral_code');
  const refCode = urlRefCode || (manualRefCode.trim() ? manualRefCode.trim().toUpperCase() : null);

  // OTP Countdown
  useEffect(() => {
    if (otpCountdown > 0) {
      const timer = setTimeout(() => setOtpCountdown(otpCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [otpCountdown]);

  useEffect(() => {
    const loadPolicies = async () => {
      setLoadingPolicies(true);
      try {
        const policies = await fetchCompliancePolicies(['terms', 'privacy', 'community_guidelines']);
        if (policies.terms?.content) setTermsContent(policies.terms.content);
        if (policies.privacy?.content) setPrivacyContent(policies.privacy.content);
        if (policies.community_guidelines?.content) setCommunityContent(policies.community_guidelines.content);
      } catch (err) {
        console.error('Failed to load policies:', err);
      } finally {
        setLoadingPolicies(false);
      }
    };
    loadPolicies();
  }, []);
  
  // Step 1: Send Firebase OTP (Gatekeeper)
  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!phone || phone.trim().length < 9) {
      setError('กรุณากรอกเบอร์โทรศัพท์ให้ครบ');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      // Send OTP (Frontend validation only)
      const result = await sendOTP(phone);
      
      if (!result.success) {
        setError(result.message);
        setLoading(false);
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
    setError('');
    
    try {
      const result = await verifyFirebaseOTP(otpCode);
      
      if (!result.success) {
        setError(result.message);
        setLoading(false);
        return;
      }
      
      console.log('✅ Firebase OTP verified - Gatekeeper passed!');
      console.log('📱 Firebase UID:', result.firebase_uid); // ✅ เก็บ UID
      
      // เก็บ Firebase UID
      setFirebaseUid(result.firebase_uid || null);
      
      // Move to registration form
      setStep('details');
      setLoading(false);
      
    } catch (err: any) {
      console.error('Verify OTP error:', err);
      setError('รหัส OTP ไม่ถูกต้อง กรุณาลองใหม่');
      setLoading(false);
    }
  };

  // Step 3: Complete Registration with existing Backend API
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    if (!formData.name || formData.name.trim().length < 2) {
        setError('กรุณากรอกชื่อ-นามสกุลให้ครบถ้วน');
        setLoading(false);
        return;
    }
    
    if (!formData.password || formData.password.length < 6) {
        setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
        setLoading(false);
        return;
    }

    if (!termsAccepted) {
        setError('กรุณายอมรับข้อกำหนดและเงื่อนไขก่อนสมัครสมาชิก');
        setLoading(false);
        return;
    }

    try {
      // เรียก API เดิม (ส่ง firebase_uid เพื่อบันทึกลง Database)
      const { token, user } = await MockApi.register({
        ...formData,
        phone,
        firebase_uid: firebaseUid,
        referral_code: refCode || undefined,
      });
      if (refCode) localStorage.removeItem('referral_code');
      
      console.log('✅ Registration API called with firebase_uid:', firebaseUid);
      
      login(user, token);
      
      // บันทึกการยอมรับนโยบาย (ไม่ block ถ้าล้มเหลว)
      try {
        const [termsPol, privacyPol] = await Promise.all([
          fetchCompliancePolicy('terms'),
          fetchCompliancePolicy('privacy'),
        ]);
        if (termsPol) {
          await api.post('/compliance/accept', {
            policy_id: termsPol.id,
            policy_type: 'terms',
            policy_version: termsPol.version,
          });
        }
        if (privacyPol) {
          await api.post('/compliance/accept', {
            policy_id: privacyPol.id,
            policy_type: 'privacy',
            policy_version: privacyPol.version,
          });
        }
      } catch (err) {
        console.error('Failed to record policy acceptance:', err);
      }

      notify(
        'สมัครสำเร็จ — ใช้งานแอปได้ทันที ยืนยันตัวตน (KYC) ทำทีหลังได้ แต่จำเป็นต้องครบก่อนถอนเงินและก่อนรับงานมูลค่าสูง',
        'success',
      );
      navigate(getPostRegisterPath(searchParams));
    } catch (err: any) {
      setError(err.message || 'Registration failed');
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
        <div className="text-center mb-6">
          <img
            src="/logo.png"
            alt="AQOND"
            className="h-12 w-12 mx-auto mb-4 object-contain rounded-xl"
            width={48}
            height={48}
          />
          <h1 className="text-2xl font-bold text-gray-900">{t('auth.create_account')}</h1>
        </div>

        {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 border border-red-100 text-center">
                {error}
            </div>
        )}
        
        {/* reCAPTCHA Container */}
        <div id="recaptcha-container"></div>
        
        {/* Step 1: Enter Phone Number */}
        {step === 'phone' && (
          <form onSubmit={handleSendOTP} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Smartphone size={16} className="inline mr-1" />
                {t('auth.phone')}
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
              {loading ? 'กำลังส่ง OTP...' : 'ส่งรหัส OTP'}
            </button>
          </form>
        )}
        
        {/* Step 2: Verify OTP */}
        {step === 'otp' && (
          <form onSubmit={handleVerifyOTP} className="space-y-4">
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm">
              <div className="flex items-start mb-2">
                <CheckCircle className="text-blue-600 mr-2 flex-shrink-0 mt-0.5" size={16} />
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
              {loading ? 'กำลังตรวจสอบ...' : 'ยืนยัน OTP'}
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
        
        {/* Step 3: Complete Registration Details */}
        {step === 'details' && (
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="bg-green-50 border border-green-100 rounded-lg p-4 text-sm mb-4">
              <div className="flex items-center">
                <CheckCircle className="text-green-600 mr-2" size={16} />
                <p className="font-medium text-green-900">
                  ยืนยันเบอร์โทรศัพท์สำเร็จ! ({phone})
                </p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.name')}</label>
              <input
                type="text"
                required
                className="w-full px-4 py-2.5 border text-gray-800 border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="ชื่อ-นามสกุล"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.password')}</label>
              <input
                type="password"
                required
                className="w-full px-4 py-2.5 border text-gray-800 border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
              />
            </div>

            {/* รหัสเพื่อนแนะนำ (optional) */}
            <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200/60">
              <label className="block text-sm font-medium text-amber-800 mb-2 flex items-center gap-2">
                <Gift size={16} className="text-amber-600" />
                รหัสเพื่อนแนะนำ (ถ้ามี)
              </label>
              <input
                type="text"
                value={manualRefCode || urlRefCode || ''}
                onChange={(e) => setManualRefCode(e.target.value.toUpperCase())}
                placeholder="เช่น ABC12345"
                maxLength={12}
                className="w-full px-4 py-2.5 rounded-lg border-2 border-amber-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 font-mono text-sm tracking-wider placeholder:text-gray-400"
              />
              {refCode && (
                <p className="mt-1.5 text-xs text-emerald-600 flex items-center gap-1">
                  <CheckCircle size={12} /> รหัส {refCode} จะถูกบันทึกเมื่อสมัครสำเร็จ
                </p>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('auth.i_want_to')}</label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setFormData({...formData, role: UserRole.USER})}
                  className={`p-4 rounded-xl border-2 flex flex-col items-center justify-center transition-all ${formData.role === UserRole.USER ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 hover:border-gray-300 text-gray-500'}`}
                >
                  <User size={24} className="mb-2" />
                  <span className="text-xs font-bold">{t('auth.role_user')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({...formData, role: UserRole.PROVIDER})}
                  className={`p-4 rounded-xl border-2 flex flex-col items-center justify-center transition-all ${formData.role === UserRole.PROVIDER ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 hover:border-gray-300 text-gray-500'}`}
                >
                  <Briefcase size={24} className="mb-2" />
                  <span className="text-xs font-bold">{t('auth.role_provider')}</span>
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
                <label htmlFor="terms-provider" className="text-sm text-gray-700 leading-relaxed">
                  ฉันยอมรับ{' '}
                  <Link
                    to="/terms"
                    className="text-emerald-600 hover:underline font-medium inline-flex items-center gap-1"
                  >
                    <FileText size={14} />
                    เงื่อนไขการให้บริการ (Terms)
                  </Link>
                  {' และ '}
                  <Link to="/privacy" className="text-emerald-600 hover:underline font-medium">
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
                  ฉันได้อ่านและยอมรับ{' '}
                  <button
                    type="button"
                    onClick={() => setShowTerms(true)}
                    className="text-emerald-600 hover:underline font-medium inline-flex items-center gap-1"
                  >
                    <FileText size={14} />
                    ข้อกำหนดและเงื่อนไขการใช้บริการ
                  </button>
                  {', '}
                  <button
                    type="button"
                    onClick={() => setShowPrivacy(true)}
                    className="text-emerald-600 hover:underline font-medium"
                  >
                    นโยบายความเป็นส่วนตัว
                  </button>
                  {' และ '}
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
              {loading ? t('auth.signing') : 'สมัครสมาชิก'}
            </button>
          </form>
        )}

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            {t('auth.have_account')}{' '}
            <Link to="/login" className="text-emerald-600 hover:underline font-medium">
              {t('auth.login')}
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
              <button onClick={() => setShowTerms(false)} className="text-slate-400 hover:text-slate-600">
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
                  dangerouslySetInnerHTML={{ __html: termsContent || '<p className="text-slate-500 text-center">ไม่พบเนื้อหา</p>' }}
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
              <button onClick={() => setShowPrivacy(false)} className="text-slate-400 hover:text-slate-600">
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
                  dangerouslySetInnerHTML={{ __html: privacyContent || '<p className="text-slate-500 text-center">ไม่พบเนื้อหา</p>' }}
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
              <button onClick={() => setShowCommunity(false)} className="text-slate-400 hover:text-slate-600">
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
                  dangerouslySetInnerHTML={{ __html: communityContent || '<p className="text-slate-500 text-center">กำลังปรับปรุงนโยบาย</p>' }}
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