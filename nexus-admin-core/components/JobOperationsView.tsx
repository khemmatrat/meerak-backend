
import React, { useState } from 'react';
import { Briefcase, ArrowUpRight, Clock, AlertTriangle, PauseCircle, Activity, Zap, ZapOff, RotateCcw } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';
import { MOCK_JOB_STATS, MOCK_TRANSACTIONS, MOCK_CIRCUIT_BREAKERS } from '../constants';
import { CircuitBreaker } from '../types';

export const JobOperationsView: React.FC = () => {
  const [breakers, setBreakers] = useState<CircuitBreaker[]>(MOCK_CIRCUIT_BREAKERS);

  const toggleBreaker = (service: string) => {
    setBreakers(breakers.map(b => {
      if (b.service === service) {
        return { 
          ...b, 
          state: b.state === 'OPEN' ? 'HALF-OPEN' : 'OPEN',
          lastTripTime: b.state === 'OPEN' ? b.lastTripTime : new Date().toLocaleTimeString() 
        };
      }
      return b;
    }));
  };

  return (
    <div className="space-y-8">
      {/* Top Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Briefcase size={20} className="text-indigo-600" />
            Job Operations Center
          </h2>
          <p className="text-slate-500 text-sm">Real-time monitoring for Post/Accept job transactions</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3 py-1 bg-emerald-50 border border-emerald-100 rounded-full flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
            <span className="text-xs font-semibold text-emerald-700">Matching Engine: ACTIVE</span>
          </div>
          <button className="flex items-center gap-2 px-3 py-1.5 bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100 rounded-lg text-sm font-medium transition-colors">
            <PauseCircle size={16} /> Emergency Stop
          </button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <p className="text-sm text-slate-500 mb-1">Total Posts (Today)</p>
          <h3 className="text-2xl font-bold text-slate-800">524,102</h3>
          <div className="flex items-center gap-1 text-emerald-600 text-xs mt-2">
            <ArrowUpRight size={14} /> +12.5% vs yesterday
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <p className="text-sm text-slate-500 mb-1">Total Accepted (Today)</p>
          <h3 className="text-2xl font-bold text-slate-800">498,850</h3>
          <div className="flex items-center gap-1 text-emerald-600 text-xs mt-2">
            <ArrowUpRight size={14} /> 95.1% Fill Rate
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <p className="text-sm text-slate-500 mb-1">Queue Backlog</p>
          <h3 className="text-2xl font-bold text-amber-600">1,240</h3>
          <div className="flex items-center gap-1 text-amber-600 text-xs mt-2">
            <Clock size={14} /> Delay ~1.2s
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <p className="text-sm text-slate-500 mb-1">Failed Transactions</p>
          <h3 className="text-2xl font-bold text-rose-600">0.02%</h3>
          <div className="flex items-center gap-1 text-slate-400 text-xs mt-2">
            <Activity size={14} /> Within SLA
          </div>
        </div>
      </div>

      {/* Circuit Breakers Section (New) */}
      <div className="bg-slate-900 rounded-xl overflow-hidden shadow-lg">
         <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h3 className="font-bold text-white flex items-center gap-2">
              <Zap size={20} className="text-yellow-400" />
              Circuit Breakers Status
            </h3>
            <span className="text-xs text-slate-400">Protects system from cascading failures</span>
         </div>
         <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-slate-800">
            {breakers.map((cb, idx) => (
              <div key={idx} className="p-6 relative group">
                 <div className="flex justify-between items-start mb-3">
                    <span className="text-slate-300 font-medium text-sm">{cb.service}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                       cb.state === 'CLOSED' ? 'bg-emerald-500/20 text-emerald-400' :
                       cb.state === 'OPEN' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'
                    }`}>{cb.state}</span>
                 </div>
                 <div className="text-2xl font-mono text-white mb-1">{cb.failureRate}% <span className="text-xs text-slate-500">err</span></div>
                 
                 {cb.state !== 'CLOSED' && (
                    <div className="text-xs text-rose-400 mb-3 flex items-center gap-1">
                      <AlertTriangle size={10} /> Tripped at {cb.lastTripTime}
                    </div>
                 )}

                 <button 
                  onClick={() => toggleBreaker(cb.service)}
                  className={`w-full mt-2 py-2 rounded text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                    cb.state === 'OPEN' 
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white' 
                      : 'bg-rose-900/50 hover:bg-rose-600 text-rose-200 hover:text-white'
                  }`}>
                    {cb.state === 'OPEN' ? <><RotateCcw size={12}/> RESET</> : <><ZapOff size={12}/> TRIP</>}
                 </button>
              </div>
            ))}
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Real-time Throughput Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-100">
           <h3 className="font-bold text-slate-800 mb-6">Transaction Throughput (TPS)</h3>
           <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={MOCK_JOB_STATS}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                <Tooltip 
                  contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                />
                <Legend />
                <Line type="monotone" dataKey="postsPerSec" name="Post Jobs/Sec" stroke="#6366f1" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="acceptsPerSec" name="Accept Jobs/Sec" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Queue Health & Failures */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <h3 className="font-bold text-slate-800 mb-4">Message Queue Depth</h3>
            <div className="h-40">
               <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={MOCK_JOB_STATS}>
                  <defs>
                    <linearGradient id="colorQueue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="queueBacklog" stroke="#f59e0b" fill="url(#colorQueue)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 p-3 bg-amber-50 rounded-lg text-xs text-amber-800 flex gap-2">
              <AlertTriangle size={16} className="shrink-0" />
              <span>Queue depth spiked at 10:02 AM. Auto-scaling workers triggered.</span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <h3 className="font-bold text-slate-800 mb-4">Live Transactions</h3>
            <div className="space-y-3">
              {MOCK_TRANSACTIONS.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full ${
                      tx.status === 'SUCCESS' ? 'bg-emerald-500' :
                      tx.status === 'FAILED' ? 'bg-rose-500' : 'bg-blue-500 animate-pulse'
                    }`}></span>
                    <div>
                      <p className="font-medium text-slate-700">{tx.type} {tx.jobId}</p>
                      <p className="text-xs text-slate-400">{tx.userId} • {tx.processingTimeMs}ms</p>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-slate-400">{tx.timestamp}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
