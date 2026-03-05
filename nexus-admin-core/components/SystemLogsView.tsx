import React, { useState } from 'react';
import { Search, Filter, AlertTriangle, Info, XCircle, RefreshCw } from 'lucide-react';
import { MOCK_LOGS } from '../constants';
import { SystemLog } from '../types';
import { analyzeLogEntry } from '../services/geminiService';

export const SystemLogsView: React.FC = () => {
  const [logs] = useState<SystemLog[]>(MOCK_LOGS);
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);

  const filteredLogs = logs.filter(log => {
    const matchesLevel = filterLevel === 'ALL' || log.level === filterLevel;
    const matchesSearch = log.message.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          log.source.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesLevel && matchesSearch;
  });

  const handleAnalyze = async (log: SystemLog) => {
    setAnalyzingId(log.id);
    const result = await analyzeLogEntry(`${log.level}: ${log.message} (Source: ${log.source})`);
    alert(`AI Analysis:\n${result}`);
    setAnalyzingId(null);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-[calc(100vh-200px)]">
      {/* Header & Controls */}
      <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-4 justify-between items-center bg-slate-50/50">
        <div className="flex items-center gap-2">
           <h2 className="font-bold text-slate-800">System Logs</h2>
           <span className="px-2 py-0.5 bg-slate-200 text-slate-600 rounded text-xs font-mono">{filteredLogs.length} entries</span>
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Search logs..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-1.5 text-sm border border-slate-200 rounded-lg w-full focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <select 
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value)}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
          >
            <option value="ALL">All Levels</option>
            <option value="INFO">INFO</option>
            <option value="WARNING">WARNING</option>
            <option value="ERROR">ERROR</option>
          </select>
          <button className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors">
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* Logs Table */}
      <div className="flex-1 overflow-auto bg-slate-900">
        <table className="w-full text-left font-mono text-sm">
          <thead className="bg-slate-800 text-slate-400 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-2 font-medium w-32">Timestamp</th>
              <th className="px-4 py-2 font-medium w-24">Level</th>
              <th className="px-4 py-2 font-medium w-24">Source</th>
              <th className="px-4 py-2 font-medium">Message</th>
              <th className="px-4 py-2 font-medium w-24 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filteredLogs.map((log) => (
              <tr key={log.id} className="hover:bg-slate-800/50 transition-colors">
                <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{log.timestamp}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold ${
                    log.level === 'INFO' ? 'bg-blue-500/10 text-blue-400' :
                    log.level === 'WARNING' ? 'bg-amber-500/10 text-amber-400' :
                    'bg-rose-500/10 text-rose-400'
                  }`}>
                    {log.level === 'INFO' && <Info size={10} />}
                    {log.level === 'WARNING' && <AlertTriangle size={10} />}
                    {log.level === 'ERROR' && <XCircle size={10} />}
                    {log.level}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-300">{log.source}</td>
                <td className="px-4 py-3 text-slate-300 break-words">{log.message}</td>
                <td className="px-4 py-3 text-right">
                  <button 
                    onClick={() => handleAnalyze(log)}
                    disabled={analyzingId === log.id}
                    className="text-xs text-indigo-400 hover:text-indigo-300 hover:underline disabled:opacity-50"
                  >
                    {analyzingId === log.id ? 'Analyzing...' : 'AI Explain'}
                  </button>
                </td>
              </tr>
            ))}
            {filteredLogs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No logs found matching your criteria
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};