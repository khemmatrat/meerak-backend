
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Lock, CheckCircle, AlertCircle } from 'lucide-react';
import { AdminRole } from '../../types';
import { AdminService } from '../../services/adminService';

export const AdminLogin: React.FC = () => {
  const [step, setStep] = useState<'password' | 'mfa'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [adminData, setAdminData] = useState<{email: string, role: AdminRole} | null>(null);
  const navigate = useNavigate();

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
        const admin = await AdminService.loginAdmin(email, password);
        if (admin) {
            setAdminData({ email: admin.email, role: admin.role });
            setStep('mfa');
        } else {
            setError('Invalid credentials. Multiple failures will lock account.');
        }
    } catch (err: any) {
        console.error(err);
        setError(err.message || 'Login failed. Check connection.');
    }
  };

  const handleMfaSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      
      // Mock OTP Check (Always 123456 for demo)
      if (otp === '123456' && adminData) {
          localStorage.setItem('meerak_admin_token', 'secret-token');
          localStorage.setItem('meerak_admin_email', adminData.email);
          localStorage.setItem('meerak_admin_role', adminData.role);
          navigate('/admin/dashboard');
      } else {
          setError('Invalid OTP Code');
      }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl w-full max-w-md border border-slate-700">
            <div className="flex justify-center mb-6">
                <div className="w-16 h-16 bg-red-600 rounded-2xl flex items-center justify-center shadow-lg shadow-red-500/20">
                    <Shield size={32} className="text-white" />
                </div>
            </div>
            
            <h1 className="text-2xl font-bold text-white text-center mb-2">Admin Portal</h1>
            <p className="text-slate-400 text-center mb-8 text-sm">
                {step === 'password' ? 'Authorized Personnel Only' : 'Two-Factor Authentication'}
            </p>
            
            {error && (
                <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-3 rounded-lg mb-6 text-sm text-center flex items-center justify-center">
                    <AlertCircle size={16} className="mr-2" /> {error}
                </div>
            )}

            {step === 'password' ? (
                <form onSubmit={handlePasswordSubmit} className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Email</label>
                        <input 
                            type="email" 
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-600 text-white px-4 py-3 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none transition-all"
                            placeholder="admin@meerak.app"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Password</label>
                        <input 
                            type="password" 
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-600 text-white px-4 py-3 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none transition-all"
                            placeholder="••••••••"
                        />
                    </div>
                    <button 
                        type="submit"
                        className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center shadow-lg shadow-red-900/20"
                    >
                        <Lock size={18} className="mr-2" /> Continue
                    </button>
                </form>
            ) : (
                <form onSubmit={handleMfaSubmit} className="space-y-6 animate-in slide-in-from-right">
                    <div className="text-center text-slate-300 text-sm mb-4">
                        Enter the 6-digit code sent to {adminData?.email}.<br/>
                        <span className="text-xs text-slate-500">(Demo Code: 123456)</span>
                    </div>
                    
                    <div className="flex justify-center">
                        <input 
                            type="text" 
                            maxLength={6}
                            value={otp}
                            onChange={e => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                            className="w-40 bg-slate-900 border border-slate-600 text-white text-center text-3xl tracking-widest px-4 py-3 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none transition-all font-mono"
                            placeholder="000000"
                            autoFocus
                        />
                    </div>

                    <button 
                        type="submit"
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center shadow-lg shadow-emerald-900/20"
                    >
                        <CheckCircle size={18} className="mr-2" /> Verify & Login
                    </button>
                    
                    <button 
                        type="button"
                        onClick={() => setStep('password')}
                        className="w-full text-slate-500 text-sm hover:text-white transition-colors"
                    >
                        Back to Login
                    </button>
                </form>
            )}
        </div>
    </div>
  );
};
