import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MockApi } from '../services/mockApi';
import { useLanguage } from '../context/LanguageContext';
import { Globe, User, Briefcase } from 'lucide-react';
import { UserRole } from '../types';

export const Register: React.FC = () => {
  const [formData, setFormData] = useState({
      name: '',
      phone: '',
      password: '',
      role: UserRole.USER
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    if (formData.phone.length < 10) {
        setError('Phone number must be at least 10 digits');
        setLoading(false);
        return;
    }

    try {
      const { token, user } = await MockApi.register(formData);
      login(user, token);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
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
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-2xl">M</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t('auth.create_account')}</h1>
        </div>

        {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 border border-red-100 text-center">
                {error}
            </div>
        )}

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.name')}</label>
            <input
              type="text"
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
              placeholder="Alex Doe"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.phone')}</label>
            <input
              type="text"
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
              placeholder="0812345678"
              value={formData.phone}
              onChange={(e) => setFormData({...formData, phone: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.password')}</label>
            <input
              type="password"
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
              placeholder="••••••••"
              value={formData.password}
              onChange={(e) => setFormData({...formData, password: e.target.value})}
            />
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
          
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-colors shadow-lg shadow-emerald-200 disabled:opacity-50 mt-4"
          >
            {loading ? t('auth.signing') : t('auth.register')}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            {t('auth.have_account')}{' '}
            <Link to="/login" className="text-emerald-600 hover:underline font-medium">
              {t('auth.login')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};