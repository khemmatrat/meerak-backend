
import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { Sparkles, Globe, Shield } from 'lucide-react';

export const Welcome: React.FC = () => {
  const { t, language, setLanguage } = useLanguage();

  return (
    <div className="min-h-screen bg-emerald-600 relative flex flex-col">
        {/* Language Switcher */}
        <div className="absolute top-4 right-4 z-10 flex items-center bg-white/10 backdrop-blur-sm px-3 py-1 rounded-full border border-white/20">
            <Globe size={14} className="text-white mr-2" />
            <select 
                value={language} 
                onChange={(e) => setLanguage(e.target.value as any)}
                className="bg-transparent text-white text-sm focus:outline-none cursor-pointer appearance-none"
            >
                <option value="en" className="text-gray-800">English</option>
                <option value="th" className="text-gray-800">ไทย</option>
                <option value="zh" className="text-gray-800">中文</option>
                <option value="ja" className="text-gray-800">日本語</option>
            </select>
        </div>

        {/* Hero Image */}
        <div className="flex-1 relative overflow-hidden">
            <div className="absolute inset-0">
                <img 
                    src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=800&auto=format&fit=crop" 
                    alt="Background" 
                    className="w-full h-full object-cover opacity-40"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-emerald-900"></div>
            </div>
            
            <div className="absolute bottom-0 left-0 w-full p-8 pb-12">
                <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mb-6 shadow-lg animate-in zoom-in duration-700">
                    <span className="text-emerald-600 font-bold text-4xl">M</span>
                </div>
                <h1 className="text-5xl font-bold text-white mb-2 tracking-tight">{t('welcome_screen.title')}</h1>
                <h2 className="text-xl text-emerald-200 font-medium mb-4">{t('welcome_screen.subtitle')}</h2>
                <p className="text-white/80 max-w-xs leading-relaxed">
                    {t('welcome_screen.desc')}
                </p>
            </div>
        </div>

        {/* Actions */}
        <div className="bg-white rounded-t-3xl p-8 -mt-6 z-10 shadow-[0_-10px_40px_rgba(0,0,0,0.1)]">
            <div className="space-y-4">
                <Link 
                    to="/register"
                    className="w-full block py-4 bg-emerald-600 text-white text-center font-bold rounded-xl text-lg shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-transform active:scale-95 flex items-center justify-center"
                >
                    <Sparkles size={20} className="mr-2" />
                    {t('welcome_screen.start')}
                </Link>
                <Link 
                    to="/login"
                    className="w-full block py-4 bg-gray-50 text-gray-700 text-center font-bold rounded-xl text-lg border border-gray-200 hover:bg-gray-100 transition-colors"
                >
                    {t('welcome_screen.login')}
                </Link>
            </div>
            <div className="mt-6 text-center flex flex-col items-center gap-2">
                <span className="text-xs text-gray-400">By continuing, you agree to our Terms & Privacy Policy.</span>
                <span className="flex items-center text-[10px] text-slate-400">
                    <Shield size={10} className="mr-1" /> Admin: nexus-admin-core (แอปแยก)
                </span>
            </div>
        </div>
    </div>
  );
};
