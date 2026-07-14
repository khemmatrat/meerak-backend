import React from "react";

export const StatsCard: React.FC<{
  title: string;
  value: string | number;
  subtitle?: string;
  color?: string;
}> = ({ title, value, subtitle, color = "bg-indigo-500" }) => (
  <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
    <p className="text-sm text-slate-500">{title}</p>
    <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
    {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
    <div className={`mt-3 h-1 rounded-full ${color} opacity-30`} />
  </div>
);
