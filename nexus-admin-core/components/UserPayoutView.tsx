
import React, { useState } from 'react';
import { Banknote, CheckCircle, XCircle, AlertTriangle, Search, Filter, ShieldCheck, Download, Edit2, PauseCircle, Save, X } from 'lucide-react';
import { MOCK_PAYOUTS } from '../constants';
import { PayoutRequest } from '../types';

export const UserPayoutView: React.FC = () => {
  const [requests, setRequests] = useState<PayoutRequest[]>(MOCK_PAYOUTS);
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // Edit Modal State
  const [editingRequest, setEditingRequest] = useState<PayoutRequest | null>(null);
  const [editForm, setEditForm] = useState({ bankName: '', accountNumber: '' });

  // Filter Logic
  const filteredRequests = requests.filter(req => filterStatus === 'ALL' || req.status === filterStatus);

  // Actions
  const handleAction = (id: string, action: 'APPROVED' | 'REJECTED') => {
    if(confirm(`ยืนยันการเปลี่ยนสถานะเป็น ${action}?`)) {
       setRequests(prev => prev.map(req => req.id === id ? { ...req, status: action } : req));
    }
  };

  const handleBulkApprove = () => {
    if (confirm(`ยืนยันอนุมัติ ${selectedIds.length} รายการที่เลือก?`)) {
      setRequests(prev => prev.map(req => selectedIds.includes(req.id) ? { ...req, status: 'APPROVED' } : req));
      setSelectedIds([]);
    }
  };

  const handleExportCSV = () => {
    const header = "ID,User,Bank,Account,Amount,Status,Date\n";
    const rows = filteredRequests.map(r => `${r.id},${r.userName},${r.bankName},${r.accountNumber},${r.amount},${r.status},${r.requestedAt}`).join("\n");
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payouts-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const openEditModal = (req: PayoutRequest) => {
    setEditingRequest(req);
    setEditForm({ bankName: req.bankName, accountNumber: req.accountNumber });
  };

  const saveEdit = () => {
    if (!editingRequest) return;
    setRequests(prev => prev.map(req => req.id === editingRequest.id ? { ...req, ...editForm } : req));
    setEditingRequest(null);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Banknote size={20} className="text-indigo-600" />
            อนุมัติการถอนเงิน (User Payout Requests)
          </h2>
          <p className="text-slate-500 text-sm">ตรวจสอบและดำเนินการโอนเงินให้ผู้ใช้งาน</p>
        </div>
        <div className="flex gap-2">
           <div className="flex bg-white border border-slate-200 rounded-lg p-1">
              {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map(status => (
                <button 
                  key={status}
                  onClick={() => setFilterStatus(status as any)}
                  className={`px-3 py-1.5 text-xs font-bold rounded transition-colors ${filterStatus === status ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                  {status}
                </button>
              ))}
           </div>
           <button onClick={handleExportCSV} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 shadow-md">
             <Download size={16} /> Export CSV
           </button>
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-lg flex items-center justify-between">
          <span className="text-sm font-bold text-indigo-700">{selectedIds.length} items selected</span>
          <button onClick={handleBulkApprove} className="px-4 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700">
            Bulk Approve
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600 font-medium">
            <tr>
              <th className="px-6 py-4 w-10"><input type="checkbox" onChange={(e) => setSelectedIds(e.target.checked ? filteredRequests.map(r => r.id) : [])} /></th>
              <th className="px-6 py-4">Request Details</th>
              <th className="px-6 py-4">Risk Score</th>
              <th className="px-6 py-4">Bank Info</th>
              <th className="px-6 py-4 text-right">Amount</th>
              <th className="px-6 py-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredRequests.map((req) => (
              <tr key={req.id} className="hover:bg-slate-50/50">
                 <td className="px-6 py-4"><input type="checkbox" checked={selectedIds.includes(req.id)} onChange={() => toggleSelect(req.id)} /></td>
                 <td className="px-6 py-4">
                    <div className="font-bold text-slate-800">{req.id}</div>
                    <div className="text-slate-500 text-xs mt-1">{req.requestedAt}</div>
                    <div className="flex items-center gap-1 mt-1 text-xs">
                       <span className="text-slate-600 font-medium">{req.userName}</span>
                       {req.kycStatus === 'VERIFIED' && <ShieldCheck size={12} className="text-emerald-500" />}
                    </div>
                 </td>
                 <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                       <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${req.riskScore > 50 ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{width: `${req.riskScore}%`}}></div>
                       </div>
                       <span className={`font-bold text-xs ${req.riskScore > 50 ? 'text-rose-600' : 'text-emerald-600'}`}>{req.riskScore}</span>
                    </div>
                 </td>
                 <td className="px-6 py-4">
                    <div className="font-bold text-slate-700">{req.bankName}</div>
                    <div className="font-mono text-xs text-slate-500 flex items-center gap-2">
                      {req.accountNumber}
                      <button onClick={() => openEditModal(req)} className="text-indigo-400 hover:text-indigo-600"><Edit2 size={12} /></button>
                    </div>
                 </td>
                 <td className="px-6 py-4 text-right font-bold text-slate-800 text-lg">฿{req.amount.toLocaleString()}</td>
                 <td className="px-6 py-4">
                    {req.status === 'PENDING' ? (
                       <div className="flex justify-center gap-2">
                          <button onClick={() => handleAction(req.id, 'APPROVED')} className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100" title="Approve"><CheckCircle size={18} /></button>
                          <button onClick={() => handleAction(req.id, 'REJECTED')} className="p-2 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100" title="Reject"><XCircle size={18} /></button>
                       </div>
                    ) : (
                       <div className={`text-center text-xs font-bold px-2 py-1 rounded-full ${req.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>{req.status}</div>
                    )}
                 </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* EDIT MODAL */}
      {editingRequest && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl shadow-xl w-96 animate-in zoom-in-95">
            <h3 className="font-bold text-lg mb-4">แก้ไขข้อมูลธนาคาร</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">ธนาคาร</label>
                <input type="text" value={editForm.bankName} onChange={e => setEditForm({...editForm, bankName: e.target.value})} className="w-full border p-2 rounded" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">เลขบัญชี</label>
                <input type="text" value={editForm.accountNumber} onChange={e => setEditForm({...editForm, accountNumber: e.target.value})} className="w-full border p-2 rounded" />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setEditingRequest(null)} className="flex-1 py-2 border rounded text-slate-600 font-bold">Cancel</button>
                <button onClick={saveEdit} className="flex-1 py-2 bg-indigo-600 text-white rounded font-bold">Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
