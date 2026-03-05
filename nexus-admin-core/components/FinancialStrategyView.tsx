
import React from 'react';
import { Landmark, TrendingUp, PieChart, Shield, Target, ArrowUpRight } from 'lucide-react';
import { PieChart as RechartsPie, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { MOCK_FINANCIAL_STRATEGY } from '../constants';

export const FinancialStrategyView: React.FC = () => {
  const data = MOCK_FINANCIAL_STRATEGY.allocation;
  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6'];

  return (
    <div className="space-y-8">
      <div className="bg-slate-900 text-white p-8 rounded-2xl shadow-xl border border-slate-700 relative overflow-hidden">
         <div className="absolute top-0 right-0 p-32 bg-indigo-500 rounded-full blur-3xl opacity-20 -mr-16 -mt-16 pointer-events-none"></div>
         <div className="relative z-10 flex justify-between items-start">
            <div>
               <h2 className="text-2xl font-bold flex items-center gap-3 mb-2">
                  <Landmark size={28} className="text-indigo-400" />
                  Financial Intelligence & Global Strategy
               </h2>
               <p className="text-indigo-200">Executive View: Capital Allocation, Reserves, and Expansion Planning</p>
            </div>
            <div className="text-right">
               <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">Total Reserves</p>
               <h3 className="text-4xl font-bold font-mono">฿{MOCK_FINANCIAL_STRATEGY.totalReserves.toLocaleString()}</h3>
               <p className="text-xs text-emerald-400 mt-2 flex items-center justify-end gap-1">
                  <TrendingUp size={12} /> Runway: {MOCK_FINANCIAL_STRATEGY.runwayMonths} Months
               </p>
            </div>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
         {/* Allocation Chart */}
         <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
               <PieChart size={20} className="text-indigo-600" /> Capital Allocation Strategy
            </h3>
            <div className="flex flex-col md:flex-row items-center gap-8">
               <div className="w-full md:w-1/2 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                     <RechartsPie>
                        <Pie
                           data={data}
                           cx="50%"
                           cy="50%"
                           innerRadius={60}
                           outerRadius={80}
                           paddingAngle={5}
                           dataKey="percentage"
                        >
                           {data.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                           ))}
                        </Pie>
                        <Tooltip />
                     </RechartsPie>
                  </ResponsiveContainer>
               </div>
               <div className="w-full md:w-1/2 space-y-4">
                  {data.map((item, index) => (
                     <div key={index} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <div className="flex items-center gap-3">
                           <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index] }}></div>
                           <div>
                              <p className="font-bold text-slate-700 text-sm">{item.category}</p>
                              <p className="text-xs text-slate-500">{item.description}</p>
                           </div>
                        </div>
                        <div className="text-right">
                           <p className="font-bold text-slate-800 text-sm">{item.percentage}%</p>
                           <p className="text-xs text-slate-500">฿{item.amount.toLocaleString()}</p>
                        </div>
                     </div>
                  ))}
               </div>
            </div>
         </div>

         {/* KPIs */}
         <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
               <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Shield size={20} className="text-emerald-600" /> Emergency Reserves
               </h3>
               <div className="relative pt-2">
                  <div className="flex justify-between text-sm mb-2">
                     <span className="text-slate-600">Funding Status</span>
                     <span className="font-bold text-emerald-600">Healthy</span>
                  </div>
                  <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                     <div className="h-full bg-emerald-500 w-[85%] rounded-full"></div>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">Target: 18 months runway</p>
               </div>
            </div>

            <div className="bg-indigo-50 p-6 rounded-xl border border-indigo-100">
               <h3 className="font-bold text-indigo-900 mb-2 flex items-center gap-2">
                  <Target size={20} /> Expansion Budget
               </h3>
               <p className="text-3xl font-bold text-indigo-800 mb-1">฿{MOCK_FINANCIAL_STRATEGY.expansionBudget.toLocaleString()}</p>
               <p className="text-sm text-indigo-600 mb-4">Allocated for Q4 Growth</p>
               <button className="w-full py-2 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2">
                  View Expansion Plan <ArrowUpRight size={16} />
               </button>
            </div>
         </div>
      </div>
    </div>
  );
};
