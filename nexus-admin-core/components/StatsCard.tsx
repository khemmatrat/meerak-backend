import React from 'react';
import { LucideIcon, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string;
  trend?: string;
  trendUp?: boolean;
  icon: LucideIcon;
  color: string;
}

export const StatsCard: React.FC<StatsCardProps> = ({ title, value, trend, trendUp, icon: Icon, color }) => {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <h3 className="text-2xl font-bold text-slate-900 mt-1">{value}</h3>
        </div>
        <div className={`p-3 rounded-lg ${color} bg-opacity-10`}>
          <Icon size={24} className={color.replace('bg-', 'text-')} />
        </div>
      </div>
      {trend && (
        <div className="flex items-center gap-1 text-sm">
          {trendUp ? (
            <ArrowUpRight size={16} className="text-emerald-500" />
          ) : (
            <ArrowDownRight size={16} className="text-rose-500" />
          )}
          <span className={trendUp ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}>
            {trend}
          </span>
          <span className="text-slate-400">จากเดือนที่แล้ว</span>
        </div>
      )}
    </div>
  );
};