
import React, { useState, useEffect, useCallback } from 'react';
import { TrendingUp, Server, DollarSign, Activity, Zap, Settings, AlertTriangle, Leaf, Gauge, ArrowUpRight, ArrowDownRight, Loader2, Save, RefreshCw } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { INITIAL_SCALING_POLICY } from '../constants';
import { ScalingPolicy, CostMetric } from '../types';
import { getResourceCost, patchResourceCost } from '../services/adminApi';

export const ResourceScalingView: React.FC = () => {
  const [policy, setPolicy] = useState<ScalingPolicy>(INITIAL_SCALING_POLICY);
  const [costMetrics, setCostMetrics] = useState<CostMetric>({
    currentMonthlyEst: 0,
    budgetCap: 6000,
    efficiencyScore: 0,
    dailyUsage: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getResourceCost();
      setPolicy(res.scalingPolicy as ScalingPolicy);
      setCostMetrics(res.costMetrics);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSave = async () => {
    setSaveLoading(true);
    setSaveSuccess(false);
    try {
      await patchResourceCost({ scalingPolicy: policy, budgetCap: costMetrics.budgetCap });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaveLoading(false);
    }
  };

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-lg text-sm flex items-center justify-between gap-4">
          <span className="flex items-center gap-2">
            <AlertTriangle size={18} /> {error}
          </span>
          <button
            onClick={() => fetchData()}
            className="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 rounded-lg font-medium text-rose-800"
          >
            Retry
          </button>
        </div>
      )}

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
        <div className="flex items-center gap-4">
          <button
            onClick={() => fetchData()}
            disabled={loading}
            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-50"
            title="Refresh data"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          <div className="flex items-center gap-3 bg-indigo-50 px-4 py-2 rounded-lg border border-indigo-100">
            <div className="text-right">
              <p className="text-xs text-slate-500">Estimated Monthly Cost (THB)</p>
              <p className="font-bold text-xl text-indigo-700">฿{costMetrics.currentMonthlyEst.toLocaleString()}</p>
            </div>
            <div className="h-8 w-[1px] bg-indigo-200"></div>
            <div className="text-right">
              <p className="text-xs text-slate-500">Budget Cap (THB)</p>
              <input
                type="number"
                min={1000}
                step={500}
                value={costMetrics.budgetCap}
                onChange={(e) => setCostMetrics({ ...costMetrics, budgetCap: Math.max(0, parseFloat(e.target.value) || 0) })}
                className="font-medium text-slate-600 text-sm w-24 bg-white border border-slate-200 rounded px-2 py-1"
              />
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={saveLoading}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              saveSuccess
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50'
            }`}
          >
            {saveLoading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            {saveSuccess ? 'Saved' : 'Save'}
          </button>
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
                         
                         <div>
                             <div className="flex justify-between items-center mb-1">
                                 <span className="text-sm text-slate-600 flex items-center gap-2">
                                     <ArrowUpRight size={16} className="text-emerald-500" /> Scale UP when CPU &gt;
                                 </span>
                                 <span className="font-mono font-bold text-indigo-600">{policy.cpuThresholdUp}%</span>
                             </div>
                             <input
                                 type="range" min="50" max="95" step="5"
                                 value={policy.cpuThresholdUp}
                                 onChange={(e) => setPolicy({...policy, cpuThresholdUp: parseInt(e.target.value)})}
                                 className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                             />
                         </div>

                         <div>
                             <div className="flex justify-between items-center mb-1">
                                 <span className="text-sm text-slate-600 flex items-center gap-2">
                                     <ArrowDownRight size={16} className="text-rose-500" /> Scale DOWN when CPU &lt;
                                 </span>
                                 <span className="font-mono font-bold text-indigo-600">{policy.cpuThresholdDown}%</span>
                             </div>
                             <input
                                 type="range" min="5" max="50" step="5"
                                 value={policy.cpuThresholdDown}
                                 onChange={(e) => setPolicy({...policy, cpuThresholdDown: parseInt(e.target.value)})}
                                 className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-rose-600"
                             />
                         </div>

                         <div className="grid grid-cols-2 gap-3 pt-2">
                             <div>
                                 <label className="text-xs text-slate-500 block mb-1">Scale Up Cooldown (sec)</label>
                                 <input
                                     type="number" min={30} max={600} step={30}
                                     value={policy.scaleUpCooldown ?? 60}
                                     onChange={(e) => setPolicy({...policy, scaleUpCooldown: Math.max(30, parseInt(e.target.value) || 60)})}
                                     className="w-full px-2 py-1 text-sm border border-slate-200 rounded"
                                 />
                             </div>
                             <div>
                                 <label className="text-xs text-slate-500 block mb-1">Scale Down Cooldown (sec)</label>
                                 <input
                                     type="number" min={60} max={900} step={60}
                                     value={policy.scaleDownCooldown ?? 300}
                                     onChange={(e) => setPolicy({...policy, scaleDownCooldown: Math.max(60, parseInt(e.target.value) || 300)})}
                                     className="w-full px-2 py-1 text-sm border border-slate-200 rounded"
                                 />
                             </div>
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
                        <AreaChart data={costMetrics.dailyUsage.length > 0 ? costMetrics.dailyUsage : [{ day: '-', cost: 0, traffic: 0 }]}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fontSize: 10}} />
                            <Tooltip contentStyle={{fontSize: '12px', borderRadius: '8px'}} />
                            <Area type="monotone" dataKey="traffic" stackId="1" stroke="#6366f1" fill="#6366f1" fillOpacity={0.1} name="Traffic" />
                            <Area type="monotone" dataKey="cost" stackId="2" stroke="#10b981" fill="#10b981" fillOpacity={0.3} name="Cost (฿)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Advice Panel — ใช้ข้อมูลจริงจาก dailyUsage และ costMetrics */}
            <div className="bg-indigo-900 text-white p-6 rounded-xl shadow-lg">
                <h4 className="font-bold mb-2 flex items-center gap-2">
                    <Settings size={16} /> Recommendation
                </h4>
                <p className="text-sm text-indigo-200 leading-relaxed mb-4">
                    {(() => {
                      const totalTraffic = costMetrics.dailyUsage.reduce((s, d) => s + d.traffic, 0);
                      const trafficValues = costMetrics.dailyUsage.map(d => d.traffic);
                      const maxTraffic = trafficValues.length ? Math.max(...trafficValues, 1) : 1;
                      const minTraffic = trafficValues.length ? Math.min(...trafficValues) : 0;
                      const hasSpikes = maxTraffic > minTraffic * 1.5 && totalTraffic > 0;
                      const overBudget = costMetrics.budgetCap > 0 && costMetrics.currentMonthlyEst > costMetrics.budgetCap;
                      const lowEfficiency = costMetrics.efficiencyScore < 70;

                      if (costMetrics.dailyUsage.length === 0 || totalTraffic === 0) {
                        return 'ยังไม่มีข้อมูล traffic จาก payment_ledger_audit — เพิ่มรายการใน Financial Strategy เพื่อดู metrics';
                      }
                      if (overBudget) {
                        return `ต้นทุนปัจจุบัน (฿${costMetrics.currentMonthlyEst.toLocaleString()}) สูงกว่า Budget Cap — พิจารณาเพิ่ม budget หรือเปลี่ยนโหมดเป็น Cost Saver`;
                      }
                      if (lowEfficiency) {
                        return `Efficiency Score ต่ำ (${costMetrics.efficiencyScore}) — พิจารณาโหมด Cost Saver หรือลด min instances เพื่อประหยัด`;
                      }
                      if (hasSpikes) {
                        return `Traffic มีความผันผวน (สูงสุด ${maxTraffic.toLocaleString()} รายการ/วัน) — โหมด "${policy.mode.replace('_', ' ')}" เหมาะสมกับการใช้งานปัจจุบัน`;
                      }
                      return `Traffic ค่อนข้างสม่ำเสมอ (รวม ${totalTraffic.toLocaleString()} รายการ/สัปดาห์) — โหมด "${policy.mode.replace('_', ' ')}" ทำงานได้ดี`;
                    })()}
                </p>
                <button
                  onClick={() => fetchData()}
                  className="w-full py-2 bg-white text-indigo-900 rounded-lg text-sm font-bold hover:bg-indigo-50 transition-colors"
                >
                  Refresh Data
                </button>
            </div>

        </div>

      </div>
    </div>
  );
};
