
import React from 'react';
import { Cpu, Layers, Clock, AlertCircle, RefreshCw } from 'lucide-react';
import { MOCK_WORKER_QUEUES } from '../constants';

export const BackgroundWorkerView: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
           <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Cpu size={20} className="text-indigo-600" />
            Background Worker Monitor
          </h2>
          <p className="text-slate-500 text-sm">Managing asynchronous tasks to prevent main thread blocking.</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors">
            <RefreshCw size={16} /> Scale Workers
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {MOCK_WORKER_QUEUES.map((queue, idx) => (
          <div key={idx} className={`bg-white rounded-xl border p-6 shadow-sm relative overflow-hidden ${
             queue.status === 'CONGESTED' ? 'border-amber-200' : 
             queue.status === 'STALLED' ? 'border-rose-200' : 'border-slate-200'
          }`}>
             {queue.status === 'CONGESTED' && (
               <div className="absolute top-0 right-0 p-1.5 bg-amber-500 text-white text-[10px] font-bold rounded-bl-lg z-10">High Load</div>
             )}
             {queue.status === 'STALLED' && (
               <div className="absolute top-0 right-0 p-1.5 bg-rose-500 text-white text-[10px] font-bold rounded-bl-lg z-10">STALLED</div>
             )}

             <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                  <Layers size={20} />
                </div>
                <h3 className="font-bold text-slate-800 capitalize">{queue.name.replace('-', ' ')}</h3>
             </div>

             <div className="space-y-4">
                <div>
                   <div className="flex justify-between text-sm text-slate-600 mb-1">
                      <span>Pending Jobs</span>
                      <span className="font-mono font-bold">{queue.pendingJobs.toLocaleString()}</span>
                   </div>
                   <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${
                          queue.pendingJobs > 1000 ? 'bg-amber-500' : 'bg-indigo-500'
                        }`} 
                        style={{width: `${Math.min((queue.pendingJobs / 10000) * 100, 100)}%`}}
                      ></div>
                   </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <div className="bg-slate-50 p-3 rounded-lg">
                      <p className="text-xs text-slate-500 flex items-center gap-1"><Clock size={12}/> Throughput</p>
                      <p className="text-lg font-bold text-slate-800">{queue.completedPerMin}<span className="text-xs font-normal text-slate-400">/min</span></p>
                   </div>
                   <div className="bg-slate-50 p-3 rounded-lg">
                      <p className="text-xs text-slate-500 flex items-center gap-1"><AlertCircle size={12}/> Failed Rate</p>
                      <p className={`text-lg font-bold ${queue.failedRate > 1 ? 'text-rose-600' : 'text-emerald-600'}`}>{queue.failedRate}%</p>
                   </div>
                </div>
             </div>
          </div>
        ))}
      </div>
    </div>
  );
};
