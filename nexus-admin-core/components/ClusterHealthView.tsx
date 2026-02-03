
import React from 'react';
import { Network, Server, Database, Globe, Cpu, AlertOctagon } from 'lucide-react';
import { MOCK_CLUSTER_NODES } from '../constants';

export const ClusterHealthView: React.FC = () => {
  return (
    <div className="space-y-8">
      
      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900 text-white p-6 rounded-xl shadow-lg">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-indigo-500/20 rounded-lg">
              <Globe className="text-indigo-400" size={24} />
            </div>
            <div>
              <p className="text-slate-400 text-sm">Global Active Users</p>
              <h3 className="text-2xl font-bold">1,024,592</h3>
            </div>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
             <div className="bg-indigo-500 h-full w-[85%]"></div>
          </div>
          <p className="text-xs text-slate-500 mt-2">85% of max capacity (Region Asia-SE1)</p>
        </div>

        <div className="bg-slate-900 text-white p-6 rounded-xl shadow-lg">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-emerald-500/20 rounded-lg">
              <Server className="text-emerald-400" size={24} />
            </div>
            <div>
              <p className="text-slate-400 text-sm">Active Worker Nodes</p>
              <h3 className="text-2xl font-bold">142 / 200</h3>
            </div>
          </div>
           <div className="flex gap-2 mt-3">
              <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs rounded border border-emerald-500/30">Auto-Scaling: ON</span>
              <span className="px-2 py-1 bg-slate-700 text-slate-300 text-xs rounded">Min: 50</span>
           </div>
        </div>

        <div className="bg-slate-900 text-white p-6 rounded-xl shadow-lg">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-amber-500/20 rounded-lg">
              <Database className="text-amber-400" size={24} />
            </div>
            <div>
              <p className="text-slate-400 text-sm">DB Write Operations</p>
              <h3 className="text-2xl font-bold">12,500 /sec</h3>
            </div>
          </div>
           <div className="flex items-center gap-2 text-xs text-amber-400">
             <AlertOctagon size={12} />
             <span>Replication Lag: 15ms</span>
           </div>
        </div>
      </div>

      {/* Node Grid */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Network size={20} className="text-slate-500" />
            Cluster Nodes (Kubernetes Pods)
          </h3>
          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-2"><span className="w-3 h-3 bg-emerald-500 rounded-full"></span> Healthy</div>
            <div className="flex items-center gap-2"><span className="w-3 h-3 bg-amber-500 rounded-full"></span> High Load</div>
            <div className="flex items-center gap-2"><span className="w-3 h-3 bg-rose-500 rounded-full"></span> Critical</div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {MOCK_CLUSTER_NODES.map((node) => (
            <div 
              key={node.id} 
              className={`p-4 rounded-xl border transition-all hover:shadow-md cursor-pointer ${
                node.status === 'Healthy' ? 'bg-white border-slate-200' :
                node.status === 'High Load' ? 'bg-amber-50 border-amber-200' :
                'bg-rose-50 border-rose-200'
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <Server size={18} className={`
                  ${node.status === 'Healthy' ? 'text-slate-400' : 
                    node.status === 'High Load' ? 'text-amber-500' : 'text-rose-500'}
                `} />
                <div className={`w-2 h-2 rounded-full ${
                  node.status === 'Healthy' ? 'bg-emerald-500' : 
                  node.status === 'High Load' ? 'bg-amber-500' : 'bg-rose-500'
                }`}></div>
              </div>
              <p className="font-mono text-xs font-bold text-slate-700 truncate">{node.id}</p>
              
              <div className="mt-3 space-y-1">
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>CPU</span>
                  <span>{node.cpuUsage}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1">
                  <div 
                    className={`h-1 rounded-full ${node.cpuUsage > 80 ? 'bg-rose-500' : 'bg-indigo-500'}`} 
                    style={{width: `${node.cpuUsage}%`}}
                  ></div>
                </div>
                
                <div className="flex justify-between text-[10px] text-slate-500 pt-1">
                  <span>MEM</span>
                  <span>{node.memoryUsage}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1">
                  <div 
                    className="bg-cyan-500 h-1 rounded-full" 
                    style={{width: `${node.memoryUsage}%`}}
                  ></div>
                </div>
              </div>
            </div>
          ))}
          
          {/* Add Node Button */}
          <button className="border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all min-h-[120px]">
            <Cpu size={24} className="mb-2" />
            <span className="text-xs font-bold">Scale Up</span>
          </button>
        </div>
      </div>

    </div>
  );
};
