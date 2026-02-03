
import React from 'react';
import { Router, Shield, Globe, Activity, AlertTriangle, Zap } from 'lucide-react';
import { MOCK_API_METRICS, MOCK_WAF_EVENTS } from '../constants';

export const ApiGatewayView: React.FC = () => {
  return (
    <div className="space-y-8">
      
      {/* Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-indigo-900 text-white p-6 rounded-xl shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 p-20 bg-indigo-500 rounded-full blur-3xl opacity-20 -mr-10 -mt-10"></div>
          <div className="flex justify-between items-start mb-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-500/20 rounded-lg">
                <Globe className="text-indigo-300" size={24} />
              </div>
              <div>
                 <h3 className="font-bold text-xl">Global Traffic</h3>
                 <p className="text-indigo-200 text-sm">Real-time incoming requests</p>
              </div>
            </div>
            <div className="px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded text-xs font-bold border border-emerald-500/30">
              WAF ACTIVE
            </div>
          </div>
          <div className="text-4xl font-bold mb-2">45,280 <span className="text-lg font-normal text-indigo-300">req/sec</span></div>
          <div className="flex gap-4 text-sm text-indigo-200">
            <span>Bandwidth: 1.2 GB/s</span>
            <span>•</span>
            <span>Cached: 85%</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Shield size={20} className="text-rose-500" />
            WAF Threat Blocking (Last 1 Hour)
          </h3>
          <div className="space-y-4">
             {MOCK_WAF_EVENTS.map((evt) => (
               <div key={evt.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                 <div className="flex items-center gap-3">
                   <div className="font-mono text-xs bg-slate-200 px-2 py-1 rounded text-slate-600">{evt.ip}</div>
                   <div>
                     <p className="text-sm font-bold text-slate-700">{evt.attackType}</p>
                     <p className="text-xs text-slate-500">{evt.country} • {evt.timestamp}</p>
                   </div>
                 </div>
                 <span className="text-xs font-bold text-rose-600 px-2 py-1 bg-rose-50 rounded border border-rose-100">{evt.action}</span>
               </div>
             ))}
          </div>
        </div>
      </div>

      {/* Endpoint Health */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
           <Activity size={18} className="text-slate-500" />
           <h3 className="font-bold text-slate-800">Critical API Endpoints Health</h3>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-6 py-3 font-semibold">Endpoint</th>
              <th className="px-6 py-3 font-semibold">Method</th>
              <th className="px-6 py-3 font-semibold">Throughput (RPM)</th>
              <th className="px-6 py-3 font-semibold">P95 Latency</th>
              <th className="px-6 py-3 font-semibold">Error Rate</th>
              <th className="px-6 py-3 font-semibold text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {MOCK_API_METRICS.map((metric, idx) => (
              <tr key={idx} className="hover:bg-slate-50/50">
                <td className="px-6 py-4 font-mono text-slate-600">{metric.path}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded text-xs font-bold ${
                    metric.method === 'GET' ? 'bg-blue-100 text-blue-700' :
                    metric.method === 'POST' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
                  }`}>{metric.method}</span>
                </td>
                <td className="px-6 py-4">{metric.rpm.toLocaleString()}</td>
                <td className="px-6 py-4">
                  <span className={`${metric.p95Latency > 500 ? 'text-rose-600 font-bold' : 'text-slate-700'}`}>
                    {metric.p95Latency} ms
                  </span>
                </td>
                <td className="px-6 py-4">
                   <span className={`${metric.errorRate > 1 ? 'text-rose-600 font-bold' : 'text-slate-700'}`}>
                    {metric.errorRate}%
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    metric.status === 'HEALTHY' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                  }`}>
                    {metric.status === 'DEGRADED' && <AlertTriangle size={12} />}
                    {metric.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
};
