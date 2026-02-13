
import React, { useState } from 'react';
import { TrendingUp, Server, DollarSign, Activity, Zap, Settings, AlertTriangle, Leaf, Gauge, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { INITIAL_SCALING_POLICY, MOCK_COST_METRICS } from '../constants';
import { ScalingPolicy, CostMetric } from '../types';

export const ResourceScalingView: React.FC = () => {
  const [policy, setPolicy] = useState<ScalingPolicy>(INITIAL_SCALING_POLICY);
  const [costMetrics] = useState<CostMetric>(MOCK_COST_METRICS);

  const handlePresetChange = (mode: ScalingPolicy['mode']) => {
    let newSettings = { ...policy, mode };
    
    switch(mode) {
        case 'AUTO_SAVER':
            newSettings = { ...newSettings, minInstances: 1, maxInstances: 5, cpuThresholdUp: 80, cpuThresholdDown: 20 };
            break;
        case 'AUTO_BALANCED':
            newSettings = { ...newSettings, minInstances: 2, maxInstances: 10, cpuThresholdUp: 70, cpuThresholdDown: 30 };
            break;
        case 'AUTO_PERFORMANCE':
            newSettings = { ...newSettings, minInstances: 5, maxInstances: 50, cpuThresholdUp: 50, cpuThresholdDown: 40 };
            break;
    }
    setPolicy(newSettings);
  };

  return (
    <div className="space-y-8">
      
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between gap-6">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <TrendingUp size={20} className="text-indigo-600" />
            Smart Resource Scaling & Cost Control
          </h2>
          <p className="text-slate-500 text-sm">
            ระบบปรับขนาด Server อัตโนมัติ ช่วยประหยัดต้นทุนเมื่อคนน้อย และขยายตัวทันทีเมื่อคนเยอะ
          </p>
        </div>
        <div className="flex items-center gap-3 bg-indigo-50 px-4 py-2 rounded-lg border border-indigo-100">
            <div className="text-right">
                <p className="text-xs text-slate-500">Estimated Monthly Cost</p>
                <p className="font-bold text-xl text-indigo-700">${costMetrics.currentMonthlyEst.toLocaleString()}</p>
            </div>
            <div className="h-8 w-[1px] bg-indigo-200"></div>
            <div className="text-right">
                <p className="text-xs text-slate-500">Budget Cap</p>
                <p className="font-medium text-slate-600 text-sm">${costMetrics.budgetCap.toLocaleString()}</p>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Control Panel */}
        <div className="lg:col-span-2 space-y-6">
            
            {/* Scaling Strategy Presets */}
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Settings size={18} /> Scaling Strategy (โหมดการทำงาน)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <button 
                        onClick={() => handlePresetChange('AUTO_SAVER')}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${
                            policy.mode === 'AUTO_SAVER' 
                            ? 'border-emerald-500 bg-emerald-50 shadow-md' 
                            : 'border-slate-100 hover:border-emerald-200'
                        }`}
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <Leaf size={20} className={policy.mode === 'AUTO_SAVER' ? 'text-emerald-600' : 'text-slate-400'} />
                            <span className={`font-bold ${policy.mode === 'AUTO_SAVER' ? 'text-emerald-800' : 'text-slate-600'}`}>Cost Saver</span>
                        </div>
                        <p className="text-xs text-slate-500">เน้นประหยัดงบ ปรับตัวช้าลงนิดหน่อย เหมาะกับช่วงเริ่มต้นหรือคนน้อย</p>
                    </button>

                    <button 
                        onClick={() => handlePresetChange('AUTO_BALANCED')}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${
                            policy.mode === 'AUTO_BALANCED' 
                            ? 'border-blue-500 bg-blue-50 shadow-md' 
                            : 'border-slate-100 hover:border-blue-200'
                        }`}
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <Activity size={20} className={policy.mode === 'AUTO_BALANCED' ? 'text-blue-600' : 'text-slate-400'} />
                            <span className={`font-bold ${policy.mode === 'AUTO_BALANCED' ? 'text-blue-800' : 'text-slate-600'}`}>Balanced</span>
                        </div>
                        <p className="text-xs text-slate-500">สมดุลระหว่างความเร็วและความคุ้มค่า แนะนำสำหรับการใช้งานทั่วไป</p>
                    </button>

                    <button 
                        onClick={() => handlePresetChange('AUTO_PERFORMANCE')}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${
                            policy.mode === 'AUTO_PERFORMANCE' 
                            ? 'border-purple-500 bg-purple-50 shadow-md' 
                            : 'border-slate-100 hover:border-purple-200'
                        }`}
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <Zap size={20} className={policy.mode === 'AUTO_PERFORMANCE' ? 'text-purple-600' : 'text-slate-400'} />
                            <span className={`font-bold ${policy.mode === 'AUTO_PERFORMANCE' ? 'text-purple-800' : 'text-slate-600'}`}>Turbo / High Scale</span>
                        </div>
                        <p className="text-xs text-slate-500">เน้นความเร็วสูงสุด ไม่เกี่ยงงบ รองรับคนเป็นล้านคนได้ทันที</p>
                    </button>
                </div>
            </div>

            {/* Advanced Configuration */}
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <Server size={18} /> Capacity Boundaries (ขอบเขตการขยายตัว)
                    </h3>
                    <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-500">Manual Fine-Tuning</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Instance Limits */}
                    <div className="space-y-6">
                        <div>
                            <div className="flex justify-between mb-2">
                                <label className="text-sm font-medium text-slate-700">Minimum Instances (เครื่องขั้นต่ำ)</label>
                                <span className="text-sm font-bold text-indigo-600">{policy.minInstances} Nodes</span>
                            </div>
                            <input 
                                type="range" min="1" max="20" step="1"
                                value={policy.minInstances}
                                onChange={(e) => setPolicy({...policy, minInstances: parseInt(e.target.value)})}
                                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                            <p className="text-xs text-slate-400 mt-1">จำนวนเครื่องที่เปิดตลอดเวลา แม้ไม่มีคนใช้ (Base Cost)</p>
                        </div>

                        <div>
                            <div className="flex justify-between mb-2">
                                <label className="text-sm font-medium text-slate-700">Maximum Instances (ขีดจำกัดสูงสุด)</label>
                                <span className="text-sm font-bold text-indigo-600">{policy.maxInstances} Nodes</span>
                            </div>
                            <input 
                                type="range" min="5" max="200" step="5"
                                value={policy.maxInstances}
                                onChange={(e) => setPolicy({...policy, maxInstances: parseInt(e.target.value)})}
                                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                            <p className="text-xs text-slate-400 mt-1">จำนวนเครื่องสูงสุดที่ระบบจะสร้างเพิ่มให้ (Protection Cap)</p>
                        </div>
                    </div>

                    {/* Trigger Thresholds */}
                    <div className="space-y-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                         <h4 className="text-sm font-bold text-slate-700 mb-2">Auto-Scaling Triggers</h4>
                         
                         <div className="flex justify-between items-center">
                             <div className="text-sm text-slate-600 flex items-center gap-2">
                                 <ArrowUpRight size={16} className="text-emerald-500" /> Scale UP when CPU &gt;
                             </div>
                             <div className="font-mono font-bold bg-white px-2 py-1 rounded border border-slate-200">{policy.cpuThresholdUp}%</div>
                         </div>

                         <div className="flex justify-between items-center">
                             <div className="text-sm text-slate-600 flex items-center gap-2">
                                 <ArrowDownRight size={16} className="text-rose-500" /> Scale DOWN when CPU &lt;
                             </div>
                             <div className="font-mono font-bold bg-white px-2 py-1 rounded border border-slate-200">{policy.cpuThresholdDown}%</div>
                         </div>
                         
                         <div className="mt-2 p-2 bg-amber-50 border border-amber-100 rounded text-xs text-amber-700 flex gap-2">
                             <AlertTriangle size={14} className="shrink-0" />
                             <span>Setting thresholds too close causes "Flapping" (rapid restart loops).</span>
                         </div>
                    </div>
                </div>
            </div>
        </div>

        {/* Right Column: Metrics & Efficiency */}
        <div className="space-y-6">
            
            {/* Efficiency Gauge */}
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 flex flex-col items-center text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-rose-500 via-amber-500 to-emerald-500"></div>
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Gauge size={18} /> Cost Efficiency Score
                </h3>
                
                <div className="relative w-40 h-40 flex items-center justify-center">
                    <svg className="w-full h-full" viewBox="0 0 36 36">
                        <path
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none"
                            stroke="#f1f5f9"
                            strokeWidth="3"
                        />
                        <path
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none"
                            stroke={costMetrics.efficiencyScore > 80 ? '#10b981' : '#f59e0b'}
                            strokeWidth="3"
                            strokeDasharray={`${costMetrics.efficiencyScore}, 100`}
                        />
                    </svg>
                    <div className="absolute flex flex-col items-center">
                        <span className="text-4xl font-bold text-slate-800">{costMetrics.efficiencyScore}</span>
                        <span className="text-xs text-slate-400">/ 100</span>
                    </div>
                </div>
                <p className="text-sm text-slate-500 mt-2">
                    {costMetrics.efficiencyScore > 80 
                        ? 'Great! Resource usage matches demand perfectly.' 
                        : 'Warning: You are over-provisioned (paying for idle servers).'}
                </p>
            </div>

            {/* Cost vs Usage Chart */}
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <DollarSign size={18} /> Daily Cost vs Traffic
                </h3>
                <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={costMetrics.dailyUsage}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fontSize: 10}} />
                            <Tooltip contentStyle={{fontSize: '12px', borderRadius: '8px'}} />
                            <Area type="monotone" dataKey="traffic" stackId="1" stroke="#6366f1" fill="#6366f1" fillOpacity={0.1} name="Traffic" />
                            <Area type="monotone" dataKey="cost" stackId="2" stroke="#10b981" fill="#10b981" fillOpacity={0.3} name="Cost ($)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Advice Panel */}
            <div className="bg-indigo-900 text-white p-6 rounded-xl shadow-lg">
                <h4 className="font-bold mb-2 flex items-center gap-2">
                    <Settings size={16} /> Recommendation
                </h4>
                <p className="text-sm text-indigo-200 leading-relaxed mb-4">
                    Current traffic pattern shows spikes at 18:00-22:00. 
                    Your current "Balanced" mode is handling this well.
                </p>
                <button className="w-full py-2 bg-white text-indigo-900 rounded-lg text-sm font-bold hover:bg-indigo-50 transition-colors">
                    View Detailed Analysis
                </button>
            </div>

        </div>

      </div>
    </div>
  );
};
