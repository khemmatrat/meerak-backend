
import React from 'react';
import { Database, HardDrive, Activity, ArrowRight, Layers } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { MOCK_SHARDS } from '../constants';

export const DatabaseShardingView: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
           <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Layers size={20} className="text-indigo-600" />
            Database Sharding Monitor
          </h2>
          <p className="text-slate-500 text-sm">Managing 3,000+ Transactions/Min via Horizontal Partitioning</p>
        </div>
        <div className="flex gap-2">
          <span className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-mono">Strategy: RANGE_BASED</span>
          <span className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-mono">Total Shards: 4</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {MOCK_SHARDS.map((shard) => (
          <div key={shard.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
            {shard.load > 85 && (
              <div className="absolute top-0 right-0 p-1.5 bg-rose-500 text-white text-[10px] font-bold rounded-bl-lg z-10">
                HOT SHARD
              </div>
            )}
            <div className="flex items-center gap-3 mb-3">
              <div className={`p-2 rounded-lg ${shard.load > 85 ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-500'}`}>
                <Database size={20} />
              </div>
              <div>
                <h4 className="font-bold text-slate-800 text-sm">{shard.id}</h4>
                <p className="text-xs text-slate-500">Range: {shard.range}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-500">Load Capacity</span>
                  <span className={`font-bold ${shard.load > 85 ? 'text-rose-600' : 'text-slate-700'}`}>{shard.load}%</span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full ${shard.load > 85 ? 'bg-rose-500' : 'bg-indigo-500'}`} 
                    style={{width: `${shard.load}%`}}
                  ></div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 bg-slate-50 rounded">
                  <p className="text-slate-400">Size</p>
                  <p className="font-mono font-medium text-slate-700">{shard.sizeGB} GB</p>
                </div>
                <div className="p-2 bg-slate-50 rounded">
                  <p className="text-slate-400">IOPS</p>
                  <p className="font-mono font-medium text-slate-700">{shard.iops}</p>
                </div>
              </div>
            </div>
            
            {shard.status === 'Rebalancing' && (
               <div className="mt-3 text-xs bg-amber-50 text-amber-700 p-2 rounded flex items-center gap-2">
                 <Activity size={12} className="animate-spin" />
                 Rebalancing Data...
               </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Load Distribution Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-6">Write Distribution (Real-time)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={MOCK_SHARDS}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} />
                <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '8px', border: 'none'}} />
                <Bar dataKey="iops" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Action Panel */}
        <div className="space-y-4">
           <div className="bg-indigo-900 text-white p-6 rounded-xl shadow-lg">
             <h3 className="font-bold text-lg mb-2">Shard Manager</h3>
             <p className="text-indigo-300 text-sm mb-4">Use this tool to manually move users between shards if a specific shard becomes too hot.</p>
             <button className="w-full py-2 bg-white text-indigo-900 rounded-lg font-bold text-sm hover:bg-indigo-50 transition-colors">
               Open Shard Allocator
             </button>
           </div>

           <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
             <h3 className="font-bold text-slate-800 mb-4">Data Migration Status</h3>
             <div className="flex items-center justify-between text-sm mb-2">
               <span>Shard 002 <ArrowRight size={12} className="inline mx-1"/> Shard 004</span>
               <span className="text-emerald-600 font-bold">85%</span>
             </div>
             <div className="w-full h-1.5 bg-slate-100 rounded-full mb-4">
               <div className="bg-emerald-500 h-full rounded-full w-[85%]"></div>
             </div>
             <p className="text-xs text-slate-500">Est. completion: 12 mins</p>
           </div>
        </div>
      </div>
    </div>
  );
};
