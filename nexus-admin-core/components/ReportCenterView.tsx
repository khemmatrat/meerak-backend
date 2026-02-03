
import React from 'react';
import { FileText, Download, Calendar, Filter, PieChart, BarChart2, TrendingUp } from 'lucide-react';
import { MOCK_REPORTS } from '../constants';

export const ReportCenterView: React.FC = () => {
  return (
    <div className="space-y-8">
      
      {/* Header with Generate Action */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <FileText size={20} className="text-indigo-600" />
            Report Center & BI
          </h2>
          <p className="text-slate-500 text-sm">Generate automated reports for accounting and management.</p>
        </div>
        <div className="flex gap-2">
           <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">
             <Calendar size={16} /> Schedule Report
           </button>
           <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 shadow-lg shadow-indigo-200">
             <Download size={16} /> Generate Now
           </button>
        </div>
      </div>

      {/* Quick Generate Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer group">
           <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <TrendingUp size={24} />
           </div>
           <h3 className="font-bold text-slate-800 mb-1">Financial Report</h3>
           <p className="text-xs text-slate-500 mb-4">Revenue, Tax, P&L Summary</p>
           <div className="flex gap-2">
              <span className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded">PDF</span>
              <span className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded">CSV</span>
              <span className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded">Excel</span>
           </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer group">
           <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <BarChart2 size={24} />
           </div>
           <h3 className="font-bold text-slate-800 mb-1">User Growth & Retention</h3>
           <p className="text-xs text-slate-500 mb-4">DAU/MAU, Churn Rate, New Signups</p>
           <div className="flex gap-2">
              <span className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded">PDF</span>
              <span className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded">CSV</span>
           </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer group">
           <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <PieChart size={24} />
           </div>
           <h3 className="font-bold text-slate-800 mb-1">System Health Audit</h3>
           <p className="text-xs text-slate-500 mb-4">Uptime, Incidents, API Latency</p>
           <div className="flex gap-2">
              <span className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded">PDF</span>
           </div>
        </div>
      </div>

      {/* History Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
           <h3 className="font-bold text-slate-800">Available Reports</h3>
           <div className="flex items-center gap-2 text-sm text-slate-500 cursor-pointer hover:text-indigo-600">
             <Filter size={14} /> Filter
           </div>
        </div>
        <table className="w-full text-left text-sm">
           <thead className="bg-slate-50 text-slate-600">
              <tr>
                 <th className="px-6 py-3 font-semibold">Report Name</th>
                 <th className="px-6 py-3 font-semibold">Type</th>
                 <th className="px-6 py-3 font-semibold">Format</th>
                 <th className="px-6 py-3 font-semibold">Generated On</th>
                 <th className="px-6 py-3 font-semibold text-right">Action</th>
              </tr>
           </thead>
           <tbody className="divide-y divide-slate-50">
              {MOCK_REPORTS.map((rpt) => (
                 <tr key={rpt.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-4 font-medium text-slate-800">{rpt.name}</td>
                    <td className="px-6 py-4">
                       <span className="px-2 py-1 bg-slate-100 rounded text-xs text-slate-600 font-bold">{rpt.type}</span>
                    </td>
                    <td className="px-6 py-4">
                       <span className={`px-2 py-1 rounded text-xs font-bold ${
                          rpt.format === 'PDF' ? 'bg-rose-100 text-rose-700' : 
                          rpt.format === 'XLSX' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                       }`}>{rpt.format}</span>
                    </td>
                    <td className="px-6 py-4 text-slate-500">{rpt.lastGenerated}</td>
                    <td className="px-6 py-4 text-right">
                       <button className="text-indigo-600 hover:text-indigo-800 font-bold text-xs flex items-center gap-1 justify-end w-full">
                          <Download size={14} /> Download
                       </button>
                    </td>
                 </tr>
              ))}
           </tbody>
        </table>
      </div>

    </div>
  );
};
