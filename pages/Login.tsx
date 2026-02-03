import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MockApi } from '../services/mockApi';
import { useLanguage } from '../context/LanguageContext';
import { Globe, User, Briefcase, AlertOctagon, Shield, Smartphone, CheckCircle, Clock, Lock } from 'lucide-react';
import { UserRole } from '../types';

// Phase 1: Import new services
import { requestOTP, verifyOTP } from '../services/otpService';
import { registerDevice, isTrustedDevice, trustDevice } from '../services/deviceService';
import { generateTokens } from '../services/jwtService.browser';
import { createRequestContext } from '../utils/tracing';

export const Login: React.FC = () => {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const navigate = useNavigate();

  // Phase 1: OTP State
  const [step, setStep] = useState<'phone' | 'otp'>('phone'); // 2-step flow
  const [otpId, setOtpId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [shouldTrustDevice, setShouldTrustDevice] = useState(false);
  const [deviceId] = useState(() => {
    // Get or create device ID
    let id = localStorage.getItem('meerak_device_id');
    if (!id) {
      id = 'device_' + Date.now() + '_' + Math.random().toString(36).substring(7);
      localStorage.setItem('meerak_device_id', id);
    }
    return id;
  });

  // Countdown timer for OTP
  useEffect(() => {
    if (otpCountdown > 0) {
      const timer = setTimeout(() => setOtpCountdown(otpCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [otpCountdown]);

  // Old login (for demo buttons)
  const handleLogin = async (e?: React.FormEvent, demoPhone?: string) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const p = demoPhone || phone;
      const pass = demoPhone ? 'demo' : password;
      const { token, user } = await MockApi.login(p, pass);
      login(user, token);
      handleLoginSuccess(user);
    } catch (error: any) {
      setError(error.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  // Phase 1: New OTP-based login
  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Check if device is trusted
      const userId = await MockApi.getUserIdByPhone(phone);
      
      if (userId) {
        const trusted = await isTrustedDevice(deviceId, userId);
        
        if (trusted) {
          console.log('✅ Trusted device - skip OTP');
          // Skip OTP, login directly
          await handleDirectLogin(userId);
          return;
        }
      }

      // Create request context for tracing
      const context = createRequestContext('web');

      // Request OTP
      const result = await requestOTP(
        phone,
        'login',
        deviceId,
        context,
        {
          ip_address: window.location.hostname,
          user_agent: navigator.userAgent
        }
      );

      if (!result.success) {
        setError(result.error || 'Failed to send OTP');
        return;
      }

      setOtpId(result.id);
      setStep('otp');
      setOtpCountdown(300); // 5 minutes
      
      console.log('📱 OTP sent to:', phone);
      console.log('📱 Check console for OTP code (development mode)');

    } catch (error: any) {
      console.error('OTP request error:', error);
      setError(error.message || 'Failed to request OTP');
    } finally {
      setLoading(false);
    }
  };

  // Phase 1: Verify OTP and complete login
  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!otpId) {
      setError('No OTP session found');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const context = createRequestContext('web');

      // Verify OTP
      const verification = await verifyOTP(otpId, otpCode, context);

      if (!verification.success) {
        setError(verification.error || 'Invalid OTP');
        return;
      }

      console.log('✅ OTP verified for phone:', verification.phone);

      // Get or create user
      let user = await MockApi.getUserByPhone(phone);
      
      if (!user) {
        // Auto-register new user
        console.log('🆕 New user - auto registering');
        user = await MockApi.autoRegisterUser(phone);
      }

      // Register device
      await registerDevice(
        user.id,
        deviceId,
        {
          device_name: getBrowserName(),
          platform: 'web',
          app_version: '1.0.0',
          ip_address: window.location.hostname,
          user_agent: navigator.userAgent
        },
        context
      );

      // Generate JWT tokens
      const tokens = await generateTokens(
        user.id,
        user.role,
        deviceId,
        context,
        { ip_address: window.location.hostname }
      );

      // Trust device if requested
      if (shouldTrustDevice) {
        await trustDevice(deviceId, user.id, 30, context);
        console.log('✅ Device trusted for 30 days');
      }

      // Save tokens
      localStorage.setItem('meerak_access_token', tokens.access_token);
      localStorage.setItem('meerak_refresh_token', tokens.refresh_token);

      // Login with old system (for compatibility)
      login(user, tokens.access_token);
      
      console.log('✅ Login complete');
      handleLoginSuccess(user);

    } catch (error: any) {
      console.error('OTP verification error:', error);
      setError(error.message || 'Failed to verify OTP');
    } finally {
      setLoading(false);
    }
  };

  // Direct login for trusted devices
  const handleDirectLogin = async (userId: string) => {
    try {
      const user = await MockApi.getUserById(userId);
      const context = createRequestContext('web');

      // Generate tokens
      const tokens = await generateTokens(
        user.id,
        user.role,
        deviceId,
        context
      );

      // Save tokens
      localStorage.setItem('meerak_access_token', tokens.access_token);
      localStorage.setItem('meerak_refresh_token', tokens.refresh_token);

      // Login
      login(user, tokens.access_token);
      handleLoginSuccess(user);

    } catch (error: any) {
      setError('Failed to login with trusted device');
    }
  };

  const handleLoginSuccess = (user: any) => {
    if (user.role === UserRole.PROVIDER) {
      navigate('/provider/dashboard');
    } else {
      navigate('/employer/dashboard');
    }
  };

  const getBrowserName = (): string => {
    const ua = navigator.userAgent;
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari')) return 'Safari';
    if (ua.includes('Edge')) return 'Edge';
    return 'Browser';
  };

  const handleResendOTP = async () => {
    setOtpCode('');
    setStep('phone');
    setOtpId(null);
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
            <span className="text-white font-bold text-2xl">M</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t('auth.welcome')}</h1>
          <p className="text-gray-500 text-sm mt-1">
            {step === 'phone' ? t('auth.subtitle') : 'Enter verification code'}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg text-sm mb-6 border border-red-100 flex items-center">
            <AlertOctagon className="mr-2 flex-shrink-0" size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* Demo Quick Login Buttons */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <button 
            onClick={() => handleLogin(undefined, '0800000001')}
            className="p-3 bg-pink-50 border border-pink-100 rounded-lg flex flex-col items-center hover:bg-pink-100 transition-colors"
          >
            <User className="text-pink-600 mb-1" size={20} />
            <span className="text-xs font-bold text-pink-700">Anna (Employer)</span>
          </button>
          <button 
            onClick={() => handleLogin(undefined, '0800000002')}
            className="p-3 bg-blue-50 border border-blue-100 rounded-lg flex flex-col items-center hover:bg-blue-100 transition-colors"
          >
            <Briefcase className="text-blue-600 mb-1" size={20} />
            <span className="text-xs font-bold text-blue-700">Bob (Provider)</span>
          </button>
        </div>

        <div className="relative flex py-2 items-center mb-4">
          <div className="flex-grow border-t border-gray-200"></div>
          <span className="flex-shrink-0 mx-4 text-gray-400 text-xs uppercase">
            {step === 'phone' ? 'Or login with OTP' : 'Verify OTP'}
          </span>
          <div className="flex-grow border-t border-gray-200"></div>
        </div>

        {/* Step 1: Enter Phone Number */}
        {step === 'phone' && (
          <form onSubmit={handleRequestOTP} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Smartphone size={16} className="inline mr-1" />
                {t('auth.phone')}
              </label>
              <input
                type="tel"
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500 transition-all"
                placeholder="+66 81 234 5678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">
                📱 We'll send you a verification code
              </p>
            </div>
            
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-colors shadow-lg shadow-emerald-200 disabled:opacity-50"
            >
              {loading ? 'Sending OTP...' : 'Send OTP'}
            </button>
          </form>
        )}

        {/* Step 2: Enter OTP Code */}
        {step === 'otp' && (
          <form onSubmit={handleVerifyOTP} className="space-y-6">
            {/* OTP Info */}
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm">
              <div className="flex items-start mb-2">
                <CheckCircle className="text-blue-600 mr-2 flex-shrink-0 mt-0.5" size={16} />
                <div>
                  <p className="font-medium text-blue-900">OTP sent to {phone}</p>
                  <p className="text-blue-700 text-xs mt-1">
                    Check your SMS or console log (dev mode)
                  </p>
                </div>
              </div>
              
              {otpCountdown > 0 && (
                <div className="flex items-center text-blue-600 text-xs mt-2">
                  <Clock size={12} className="mr-1" />
                  Expires in {Math.floor(otpCountdown / 60)}:{String(otpCountdown % 60).padStart(2, '0')}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Lock size={16} className="inline mr-1" />
                Enter 6-digit OTP
              </label>
              <input
                type="text"
                required
                maxLength={6}
                pattern="[0-9]{6}"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500 transition-all text-center text-2xl tracking-widest font-mono"
                placeholder="● ● ● ● ● ●"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                autoFocus
              />
            </div>

            {/* Trust Device Option */}
            <div className="flex items-center">
              <input
                type="checkbox"
                id="trustDevice"
                checked={shouldTrustDevice}
                onChange={(e) => setShouldTrustDevice(e.target.checked)}
                className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
              />
              <label htmlFor="trustDevice" className="ml-2 text-sm text-gray-700">
                Trust this device for 30 days
              </label>
            </div>
            
            <button
              type="submit"
              disabled={loading || otpCode.length !== 6}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-colors shadow-lg shadow-emerald-200 disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Verify & Login'}
            </button>

            <button
              type="button"
              onClick={handleResendOTP}
              className="w-full py-2 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
            >
              Didn't receive code? Send again
            </button>
          </form>
        )}

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            {t('auth.no_account')}{' '}
            <Link to="/register" className="text-emerald-600 hover:underline font-medium">
              {t('auth.register')}
            </Link>
          </p>
        </div>

        {/* Admin Link */}
        <div className="mt-8 pt-6 border-t border-gray-100 text-center">
          <Link to="/admin/login" className="inline-flex items-center text-xs text-slate-400 hover:text-slate-600 transition-colors">
            <Shield size={12} className="mr-1" /> Admin Portal Access
          </Link>
        </div>

        {/* Phase 1 Info */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
            <p className="text-xs text-purple-700 font-medium">🔐 Phase 1: OTP Auth Active</p>
            <p className="text-[10px] text-purple-600 mt-1">
              Device ID: {deviceId.substring(0, 20)}...
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
