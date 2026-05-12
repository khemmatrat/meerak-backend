import React, { useState, useEffect } from 'react';
import { Link2, Users, TrendingUp, Gift, Copy, Check, Loader2, Trophy } from 'lucide-react';
import { api } from '../services/api';

const API_BASE =
  import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || 'https://api.aqond.com';

interface ReferralStats {
  referralCode: string | null;
  referralLink: string | null;
  totalReferrals: number;
  activeWorkers: number;
  totalEarned: number;
}

interface LeaderboardEntry {
  userId: string;
  fullName: string;
  referralCode: string;
  referralCount: number;
  earnedThisWeek: number;
}

export const Referral: React.FC = () => {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('meerak_token');
      const [statsRes, leaderRes] = await Promise.all([
        api.get<ReferralStats>('/referral/me', { headers: token ? { Authorization: `Bearer ${token}` } : {} }),
        api.get<{ leaderboard: LeaderboardEntry[] }>('/referral/leaderboard?limit=10'),
      ]);
      setStats(statsRes.data);
      setLeaderboard(leaderRes.data?.leaderboard || []);
    } catch (e) {
      setStats(null);
      setLeaderboard([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCopyLink = () => {
    if (stats?.referralLink) {
      navigator.clipboard.writeText(stats.referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[300px]">
        <Loader2 size={32} className="animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center justify-center gap-2">
          <Gift size={28} className="text-amber-500" />
          แนะนำเพื่อน ได้รับ 1.5%
        </h1>
        <p className="text-slate-600 mt-2">เพื่อนได้งาน คุณได้ตังค์ — รายได้ 1.5% จากยอดจ้างงาน ภายใน 7 วันแรก</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-100 p-6 shadow-sm">
          <Users size={24} className="text-indigo-500 mb-2" />
          <p className="text-sm text-slate-500">เพื่อนที่สมัคร</p>
          <p className="text-2xl font-bold text-slate-800">{stats?.totalReferrals ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 p-6 shadow-sm">
          <TrendingUp size={24} className="text-emerald-500 mb-2" />
          <p className="text-sm text-slate-500">เพื่อนที่มีงานจ้างแล้ว</p>
          <p className="text-2xl font-bold text-slate-800">{stats?.activeWorkers ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-amber-100 p-6 shadow-sm bg-amber-50/30">
          <Gift size={24} className="text-amber-600 mb-2" />
          <p className="text-sm text-slate-500">รายได้สะสม (1.5%)</p>
          <p className="text-2xl font-bold text-amber-700">฿{(stats?.totalEarned ?? 0).toLocaleString()}</p>
        </div>
      </div>

      {/* Referral Link */}
      <div className="bg-white rounded-xl border border-slate-100 p-6 shadow-sm">
        <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Link2 size={20} /> ลิงก์แนะนำของคุณ
        </h2>
        {stats?.referralLink ? (
          <div className="flex gap-2">
            <input
              readOnly
              value={stats.referralLink}
              className="flex-1 px-4 py-2 border border-slate-200 rounded-lg bg-slate-50 text-sm font-mono"
            />
            <button
              onClick={handleCopyLink}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium flex items-center gap-2 hover:bg-emerald-700"
            >
              {copied ? <Check size={18} /> : <Copy size={18} />}
              {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
            </button>
          </div>
        ) : (
          <p className="text-slate-500 text-sm">กรุณารอระบบสร้างรหัสแนะนำให้คุณ</p>
        )}
      </div>

      {/* Leaderboard */}
      <div className="bg-white rounded-xl border border-slate-100 p-6 shadow-sm">
        <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Trophy size={20} className="text-amber-500" />
          อันดับผู้แนะนำประจำสัปดาห์
        </h2>
        <div className="space-y-2">
          {leaderboard.length === 0 ? (
            <p className="text-slate-500 text-sm py-4 text-center">ยังไม่มีข้อมูล</p>
          ) : (
            leaderboard.map((entry, idx) => (
              <div
                key={entry.userId}
                className={`flex items-center justify-between p-3 rounded-lg ${idx < 3 ? 'bg-amber-50 border border-amber-100' : 'bg-slate-50'}`}
              >
                <div className="flex items-center gap-3">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    idx === 0 ? 'bg-amber-400 text-amber-900' :
                    idx === 1 ? 'bg-slate-300 text-slate-700' :
                    idx === 2 ? 'bg-amber-700 text-amber-100' :
                    'bg-slate-200 text-slate-600'
                  }`}>
                    {idx + 1}
                  </span>
                  <div>
                    <p className="font-medium text-slate-800">{entry.fullName}</p>
                    <p className="text-xs text-slate-500">{entry.referralCount} คน • ฿{entry.earnedThisWeek.toLocaleString()} สัปดาห์นี้</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
