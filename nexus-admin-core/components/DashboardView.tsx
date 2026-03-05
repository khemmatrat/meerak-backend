
import React, { useState, useEffect } from 'react';
import { Users, DollarSign, Smartphone, Zap, Sparkles, Loader2, Database } from 'lucide-react';
import { StatsCard } from './StatsCard';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { MOCK_ANALYTICS, MOCK_USERS, MOCK_LOGS, INITIAL_SYSTEM_CONFIG } from '../constants';
import { generateDashboardInsight } from '../services/geminiService';

export const DashboardView: React.FC = () => {
  const [insight, setInsight] = useState<string>('');
  const [loadingInsight, setLoadingInsight] = useState(false);
  const isFirebase = INITIAL_SYSTEM_CONFIG.useFirebase;

  const fetchInsight = async () => {
    setLoadingInsight(true);
    const result = await generateDashboardInsight(MOCK_USERS, MOCK_ANALYTICS, MOCK_LOGS);
    setInsight(result);
    setLoadingInsight(false);
  };

  // Auto-fetch insight on mount
  useEffect(() => {
    // Optional: fetchInsight(); 
  }, []);

  return (
    <div className="space-y-6">
      {/* Backend Status Indicator */}
      <div className={`flex items-center justify-between px-4 py-2 rounded-lg text-sm font-medium ${isFirebase ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
        <div className="flex items-center gap-2">
           <Database size={16} />
           <span>Backend Source: <strong>{isFirebase ? 'Firebase Realtime (Live)' : 'Mock Data System (Simulation)'}</strong></span>
        </div>
        {!isFirebase && (
          <span className="text-xs opacity-75">Connect API keys in firebaseConfig.ts to go live</span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard 
          title="ผู้ใช้งานทั้งหมด" 
          value="12,450" 
          trend="+12%" 
          trendUp={true} 
          icon={Users} 
          color="bg-indigo-500" 
        />
        <StatsCard 
          title="รายได้รวม (เดือนนี้)" 
          value="฿1,240,500" 
          trend="+8.2%" 
          trendUp={true} 
          icon={DollarSign} 
          color="bg-emerald-500" 
        />
        <StatsCard 
          title="Active Sessions" 
          value="892" 
          trend="-2%" 
          trendUp={false} 
          icon={Smartphone} 
          color="bg-blue-500" 
        />
        <StatsCard 
          title="Server Load" 
          value="42%" 
          trend="Stable" 
          trendUp={true} 
          icon={Zap} 
          color="bg-amber-500" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-slate-800">Traffic Real-time</h3>
            <select className="text-sm border-slate-200 rounded-md text-slate-500 bg-slate-50 p-1">
              <option>วันนี้</option>
              <option>สัปดาห์นี้</option>
              <option>เดือนนี้</option>
            </select>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={MOCK_ANALYTICS}>
                <defs>
                  <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                <Tooltip 
                  contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                />
                <Area type="monotone" dataKey="users" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorUsers)" />
                <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* AI Insight Panel */}
        <div className="bg-gradient-to-br from-indigo-900 to-slate-900 p-6 rounded-xl text-white shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-32 bg-indigo-500 rounded-full blur-3xl opacity-20 -mr-16 -mt-16 pointer-events-none"></div>
          
          <div className="flex items-center gap-2 mb-4 relative z-10">
            <Sparkles className="text-yellow-400" />
            <h3 className="font-bold text-lg">AI Analytics</h3>
          </div>
          
          <div className="min-h-[200px] mb-4 relative z-10">
            {loadingInsight ? (
              <div className="flex flex-col items-center justify-center h-48 text-indigo-200">
                <Loader2 className="animate-spin mb-3" size={32} />
                <p>Gemini กำลังวิเคราะห์ข้อมูล...</p>
              </div>
            ) : insight ? (
              <div className="prose prose-invert prose-sm">
                <p className="whitespace-pre-line text-indigo-100 leading-relaxed text-sm">
                  {insight}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-48 text-indigo-300 text-center">
                <p className="mb-4">ให้ AI ช่วยวิเคราะห์ข้อมูลเชิงลึกและสรุปสถานการณ์ปัจจุบันของระบบ</p>
              </div>
            )}
          </div>

          <button 
            onClick={fetchInsight}
            disabled={loadingInsight}
            className="w-full py-3 bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/10 rounded-lg font-medium transition-colors text-white flex justify-center items-center gap-2 relative z-10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loadingInsight ? 'กำลังประมวลผล...' : 'วิเคราะห์ข้อมูลด้วย Gemini'}
          </button>
        </div>
      </div>
    </div>
  );
};
