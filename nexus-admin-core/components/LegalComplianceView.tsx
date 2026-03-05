
import React, { useState } from 'react';
import { Scale, FileText, UserMinus, ShieldAlert, Check, X, Eye, Download, Search, Clock, Plus } from 'lucide-react';
import { MOCK_LEGAL_REQUESTS, MOCK_LEGAL_DOCS } from '../constants';

export const LegalComplianceView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'requests' | 'docs' | 'police'>('requests');

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Scale size={20} className="text-indigo-600" />
            Legal Operations Center
          </h2>
          <p className="text-slate-500 text-sm">Manage user rights, legal documents, and official requests.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button 
          onClick={() => setActiveTab('requests')}
          className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'requests' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500'}`}
        >
          User Requests (PDPA)
        </button>
        <button 
          onClick={() => setActiveTab('docs')}
          className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'docs' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500'}`}
        >
          Legal Documents (Versioning)
        </button>
        <button 
          onClick={() => setActiveTab('police')}
          className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'police' ? 'border-rose-600 text-rose-700' : 'border-transparent text-slate-500'}`}
        >
          Law Enforcement (Police/Court)
        </button>
      </div>

      {activeTab === 'requests' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
             <div className="flex gap-2">
                <span className="px-3 py-1 bg-white border border-slate-200 rounded-full text-xs font-bold text-slate-600">All PDPA</span>
                <span className="px-3 py-1 bg-white border border-slate-200 rounded-full text-xs font-medium text-slate-500">Data Export</span>
                <span className="px-3 py-1 bg-white border border-slate-200 rounded-full text-xs font-medium text-slate-500">Account Deletion</span>
             </div>
             <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input type="text" placeholder="Search Request ID..." className="pl-9 pr-4 py-1.5 text-sm border border-slate-200 rounded-full focus:outline-none focus:ring-1 focus:ring-indigo-500 w-48" />
             </div>
          </div>
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 font-medium">
              <tr>
                <th className="px-6 py-4">Request ID</th>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Requester</th>
                <th className="px-6 py-4">Deadline</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {MOCK_LEGAL_REQUESTS.filter(r => r.type.startsWith('PDPA')).map((req) => (
                <tr key={req.id} className="hover:bg-slate-50/50">
                   <td className="px-6 py-4 font-mono text-slate-600 font-medium">{req.id}</td>
                   <td className="px-6 py-4">
                      <span className="flex items-center gap-1.5 text-slate-700">
                         {req.type === 'PDPA_DELETE' ? <UserMinus size={14} /> : <Download size={14} />}
                         {req.type.replace('PDPA_', '')}
                      </span>
                   </td>
                   <td className="px-6 py-4 text-slate-600">{req.userId}</td>
                   <td className="px-6 py-4">
                      <div className="flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-0.5 rounded w-fit text-xs font-medium">
                        <Clock size={12} /> {req.deadline}
                      </div>
                   </td>
                   <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                         req.status === 'PENDING' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'
                      }`}>{req.status}</span>
                   </td>
                   <td className="px-6 py-4 text-right">
                      <button className="text-indigo-600 hover:underline font-bold text-xs">Process</button>
                   </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'docs' && (
         <div className="space-y-4">
            <div className="flex justify-end">
                <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700">
                    <Plus size={16} /> Draft New Policy
                </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {MOCK_LEGAL_DOCS.map((doc) => (
                <div key={doc.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 hover:shadow-md transition-shadow relative overflow-hidden">
                    <div className={`absolute top-0 right-0 w-16 h-16 rounded-bl-full opacity-20 ${doc.status === 'PUBLISHED' ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-slate-100 rounded-lg text-slate-600">
                            <FileText size={24} />
                        </div>
                        <span className={`px-2 py-1 rounded text-xs font-bold relative z-10 ${
                            doc.status === 'PUBLISHED' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'
                        }`}>{doc.status}</span>
                    </div>
                    <h3 className="font-bold text-slate-800 text-lg mb-1">{doc.title}</h3>
                    <div className="flex items-center gap-4 text-sm text-slate-500 mb-6">
                        <span className="font-mono bg-slate-100 px-2 rounded">v{doc.version}</span>
                        <span>Updated: {doc.lastUpdated}</span>
                    </div>
                    
                    <div className="pt-4 border-t border-slate-100 flex gap-2">
                        <button className="flex-1 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-bold hover:bg-indigo-100 transition-colors">Edit</button>
                        <button className="px-3 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600"><Eye size={18} /></button>
                    </div>
                </div>
                ))}
            </div>
         </div>
      )}

      {activeTab === 'police' && (
          <div className="bg-rose-50 border border-rose-100 rounded-xl p-6">
             <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-rose-200 rounded-full text-rose-700"><ShieldAlert size={24} /></div>
                <div>
                   <h3 className="text-xl font-bold text-rose-800">Law Enforcement Portal</h3>
                   <p className="text-rose-600 text-sm">Secure channel for processing official warrants and court orders.</p>
                </div>
             </div>
             
             <div className="bg-white rounded-xl border border-rose-100 shadow-sm overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-rose-50 text-rose-800">
                        <tr>
                            <th className="px-6 py-3">Case ID</th>
                            <th className="px-6 py-3">Agency</th>
                            <th className="px-6 py-3">Target User</th>
                            <th className="px-6 py-3">Document</th>
                            <th className="px-6 py-3">Deadline</th>
                            <th className="px-6 py-3 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-rose-50">
                        {MOCK_LEGAL_REQUESTS.filter(r => r.type === 'LAW_ENFORCEMENT').map((req) => (
                             <tr key={req.id} className="hover:bg-rose-50/30">
                                <td className="px-6 py-4 font-bold text-slate-700">{req.id}</td>
                                <td className="px-6 py-4">Cyber Crime Division</td>
                                <td className="px-6 py-4 font-mono">{req.userId}</td>
                                <td className="px-6 py-4 text-indigo-600 underline cursor-pointer">{req.documents?.[0] || 'Warrant.pdf'}</td>
                                <td className="px-6 py-4 text-rose-600 font-bold">{req.deadline}</td>
                                <td className="px-6 py-4 text-right">
                                    <button className="px-3 py-1 bg-rose-600 text-white rounded text-xs font-bold hover:bg-rose-700">Respond</button>
                                </td>
                             </tr>
                        ))}
                    </tbody>
                </table>
             </div>
          </div>
      )}
    </div>
  );
};
