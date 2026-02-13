// Phase 4: Admin dashboard uses backend JWT (role from user_roles). No bypass.
import React, { useState } from 'react';
import { Lock, Mail, User, ArrowRight, Loader2, ShieldCheck } from 'lucide-react';
import { MOCK_ADMIN_ACCOUNTS } from '../constants';
import { AdminUser } from '../types';
import { adminLogin, setAdminToken } from '../services/adminApi';

interface LoginViewProps {
  onLogin: (user: AdminUser) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await adminLogin(email.trim(), password);
      setAdminToken(res.access_token);
      onLogin({
        id: res.user.id,
        name: res.user.name || res.user.email,
        email: res.user.email,
        role: res.user.role as AdminUser['role'],
        avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
      });
      setLoading(false);
      return;
    } catch (err: any) {
      setError(err?.message || 'Invalid credentials');
    }
    setLoading(false);
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
                 <ShieldCheck size={32} className="text-emerald-400" />
              </div>
              <h1 className="text-3xl font-bold mb-2">Nexus Admin Core</h1>
              <p className="text-indigo-200">Enterprise Backend Management System</p>
           </div>

           <div className="relative z-10 space-y-4">
              <div className="flex items-center gap-3 text-sm text-indigo-100/80">
                 <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"><User size={14}/></div>
                 <span>Secure Access Control</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-indigo-100/80">
                 <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"><Lock size={14}/></div>
                 <span>End-to-End Encryption</span>
              </div>
           </div>
        </div>

        {/* Right: Login Form */}
        <div className="md:w-1/2 p-12 flex flex-col justify-center">
           <h2 className="text-2xl font-bold text-slate-800 mb-2">Welcome Back</h2>
           <p className="text-slate-500 mb-8">Please sign in to access the dashboard.</p>
           
           <form onSubmit={handleLogin} className="space-y-4">
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

           <div className="mt-8 text-center">
              <p className="text-xs text-slate-400">
                 By logging in, you agree to the <a href="#" className="text-indigo-600 hover:underline">Security Protocols</a> and <a href="#" className="text-indigo-600 hover:underline">Data Policy</a>.
              </p>
              <div className="mt-4 p-2 bg-slate-50 border border-slate-100 rounded text-xs text-slate-500">
                 Demo Account: <strong>admin@nexus.com</strong> / Pass: <strong>12345</strong>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};
