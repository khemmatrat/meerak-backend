
import React, { useState } from 'react';
import { ShieldCheck, AlertOctagon, DollarSign, Search, CheckCircle, XCircle, FileText, Wallet, Landmark, ArrowUpRight, History, Lock, Download, RefreshCw, X, MapPin, Smartphone, Globe } from 'lucide-react';
import { MOCK_FINANCIAL_TXS } from '../constants';
import { FinancialTransaction } from '../types';

interface FinancialAuditViewProps {
  currentUserRole: string;
}

export const FinancialAuditView: React.FC<FinancialAuditViewProps> = ({ currentUserRole }) => {
  // State for Wallet & Transactions
  const [balance, setBalance] = useState(2450800); // Initial Company Revenue
  const [transactions, setTransactions] = useState<FinancialTransaction[]>(MOCK_FINANCIAL_TXS);
  
  // UI States
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawBank, setWithdrawBank] = useState('KBANK');
  
  const [isReconciling, setIsReconciling] = useState(false);
  const [showInvestigateModal, setShowInvestigateModal] = useState<FinancialTransaction | null>(null);

  // STRICT SECURITY CHECK
  const isSuperAdmin = currentUserRole === 'SUPER_ADMIN';

  // --- Handlers ---

  const handleWithdrawSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(withdrawAmount);

    if (amount <= 0 || amount > balance) {
      alert("ยอดเงินไม่ถูกต้องหรือเกินวงเงินที่มีอยู่");
      return;
    }

    if (confirm(`ยืนยันการโอนเงินจำนวน ฿${amount.toLocaleString()} เข้าบัญชี ${withdrawBank}?`)) {
      setIsWithdrawing(true);
      setTimeout(() => {
        setBalance(prev => prev - amount); // Deduct balance
        
        // Add Withdrawal Record to Table
        const newTx: FinancialTransaction = {
          id: `WTX-${Date.now()}`,
          userId: 'COMPANY_WALLET',
          amount: amount,
          type: 'WITHDRAWAL',
          status: 'COMPLETED',
          fraudScore: 0,
          timestamp: new Date().toLocaleTimeString(),
          note: `Owner Withdrawal to ${withdrawBank}`
        };
        setTransactions([newTx, ...transactions]);
        
        setIsWithdrawing(false);
        setShowWithdrawModal(false);
        setWithdrawAmount('');
        alert(`ดำเนินการโอนเงินสำเร็จ! ยอดเงินคงเหลือ ฿${(balance - amount).toLocaleString()}`);
      }, 2000);
    }
  };

  const handleExportCSV = () => {
    const header = "ID,User,Type,Amount,Status,FraudScore,Time,Note\n";
    const rows = transactions.map(t => `${t.id},${t.userId},${t.type},${t.amount},${t.status},${t.fraudScore},${t.timestamp},${t.note || ''}`).join("\n");
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `financial_audit_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const handleReconcile = () => {
    setIsReconciling(true);
    setTimeout(() => {
      setIsReconciling(false);
      alert("Bank Reconciliation Complete: All 14,250 transactions match bank records. (Green Status)");
    }, 2500);
  };

  const handleInvestigateAction = (action: 'SAFE' | 'FRAUD') => {
    if (!showInvestigateModal) return;
    
    const newStatus = action === 'SAFE' ? 'COMPLETED' : 'FAILED';
    const note = action === 'SAFE' ? 'Manually verified by Admin' : 'Blocked due to fraud suspicion';

    setTransactions(prev => prev.map(t => 
      t.id === showInvestigateModal.id ? { ...t, status: newStatus, note: note } : t
    ));
    
    setShowInvestigateModal(null);
  };

  return (
    <div className="space-y-6">
      
      {/* --- SECTION FOR THE BOSS (OWNER WALLET) --- */}
      {isSuperAdmin ? (
        <div className="bg-gradient-to-r from-slate-900 to-indigo-900 rounded-2xl p-8 text-white shadow-xl relative overflow-hidden border border-indigo-700">
          <div className="absolute top-0 right-0 p-32 bg-indigo-500 rounded-full blur-3xl opacity-20 -mr-16 -mt-16 pointer-events-none"></div>
          
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-indigo-500/30 rounded-lg backdrop-blur-sm">
                  <Wallet size={24} className="text-emerald-400" />
                </div>
                <h2 className="text-xl font-bold">Platform Revenue Wallet (กระเป๋าเงินรายได้บริษัท)</h2>
              </div>
              <p className="text-indigo-200 text-sm max-w-lg">
                ส่วนแบ่งรายได้ (Commission Fees) สะสมทั้งหมด พร้อมถอนเข้าบัญชีบริษัท
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/10 min-w-[320px]">
               <p className="text-sm text-indigo-200 mb-1">ยอดเงินที่ถอนได้ (Available Balance)</p>
               <h3 className="text-4xl font-bold text-white tracking-tight">฿{balance.toLocaleString(undefined, {minimumFractionDigits: 2})}</h3>
               <div className="mt-4 pt-4 border-t border-white/10">
                  <button 
                    onClick={() => setShowWithdrawModal(true)}
                    className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold rounded-lg transition-all shadow-lg hover:shadow-emerald-500/30 flex items-center justify-center gap-2"
                  >
                     <Landmark size={18} /> ถอนเงินเข้าบัญชีบริษัท
                  </button>
               </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-slate-100 rounded-xl p-8 border border-slate-200 flex flex-col items-center justify-center text-center opacity-75">
            <div className="p-4 bg-slate-200 rounded-full mb-3 text-slate-500">
               <Lock size={32} />
            </div>
            <h3 className="text-lg font-bold text-slate-700">Access Restricted</h3>
            <p className="text-slate-500 text-sm max-w-md">
               Platform Wallet is only accessible to <strong>Super Admins</strong>.
            </p>
        </div>
      )}

      {/* --- WITHDRAW MODAL --- */}
      {showWithdrawModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
           <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200 overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                 <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                    <Landmark size={20} className="text-emerald-600"/> ถอนเงิน (Withdraw)
                 </h3>
                 <button onClick={() => setShowWithdrawModal(false)}><X size={20} className="text-slate-400 hover:text-slate-600"/></button>
              </div>
              <form onSubmit={handleWithdrawSubmit} className="p-6 space-y-5">
                 <div className="bg-indigo-50 p-4 rounded-xl text-center border border-indigo-100">
                    <p className="text-xs text-indigo-500 uppercase font-bold mb-1">ยอดเงินคงเหลือ</p>
                    <p className="text-3xl font-bold text-indigo-900">฿{balance.toLocaleString()}</p>
                 </div>
                 
                 <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">เลือกบัญชีธนาคารปลายทาง</label>
                    <select 
                      value={withdrawBank} 
                      onChange={(e) => setWithdrawBank(e.target.value)}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium"
                    >
                       <option value="KBANK">Kasikorn Bank (KBANK) ••••-8892</option>
                       <option value="SCB">Siam Commercial Bank (SCB) ••••-1120</option>
                       <option value="BBL">Bangkok Bank (BBL) ••••-4431</option>
                    </select>
                 </div>

                 <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">จำนวนเงินที่ต้องการถอน</label>
                    <div className="relative">
                       <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                       <input 
                         type="number" 
                         required
                         min="1"
                         max={balance}
                         value={withdrawAmount}
                         onChange={(e) => setWithdrawAmount(e.target.value)}
                         className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-lg text-slate-800 placeholder-slate-300"
                         placeholder="0.00"
                       />
                       <button 
                         type="button" 
                         onClick={() => setWithdrawAmount(balance.toString())}
                         className="absolute right-3 top-1/2 -translate-y-1/2 text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded font-bold hover:bg-slate-200"
                       >
                         MAX
                       </button>
                    </div>
                 </div>

                 <button 
                   type="submit" 
                   disabled={isWithdrawing}
                   className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-base shadow-lg shadow-emerald-200 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                 >
                    {isWithdrawing ? <RefreshCw className="animate-spin" /> : <CheckCircle size={20} />}
                    {isWithdrawing ? 'กำลังดำเนินการ...' : 'ยืนยันการโอนเงิน'}
                 </button>
              </form>
           </div>
        </div>
      )}

      {/* --- OPERATIONS BAR --- */}
      <div className="flex flex-col md:flex-row justify-between items-center mt-8 gap-4">
        <div>
           <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <ShieldCheck size={20} className="text-indigo-600" />
            User Transaction Audit
          </h2>
          <p className="text-slate-500 text-sm">ตรวจสอบธุรกรรมของผู้ใช้งานและการป้องกันการฟอกเงิน (AML)</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            <Download size={16} /> Export Audit Log
          </button>
          <button 
            onClick={handleReconcile}
            disabled={isReconciling}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
          >
            {isReconciling ? <RefreshCw size={16} className="animate-spin"/> : <RefreshCw size={16}/>}
            {isReconciling ? 'Reconciling...' : 'Run Reconciliation'}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600">
              <DollarSign size={20} />
            </div>
            <span className="text-sm font-medium text-slate-500">Total User Volume</span>
          </div>
          <h3 className="text-2xl font-bold text-slate-800">฿14,250,500</h3>
          <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
             <CheckCircle size={12} /> 100% Reconciled with Bank
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-rose-100 rounded-lg text-rose-600">
              <AlertOctagon size={20} />
            </div>
            <span className="text-sm font-medium text-slate-500">Fraud Attempts (Today)</span>
          </div>
          <h3 className="text-2xl font-bold text-rose-600">24</h3>
          <p className="text-xs text-rose-600 mt-1">Blocked automatically by AI</p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
           <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-amber-100 rounded-lg text-amber-600">
              <Search size={20} />
            </div>
            <span className="text-sm font-medium text-slate-500">Flagged for Review</span>
          </div>
          <h3 className="text-2xl font-bold text-slate-800">
             {transactions.filter(t => t.status === 'FLAGGED').length}
          </h3>
          <p className="text-xs text-amber-600 mt-1">Requires admin attention</p>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-bold text-slate-800">Recent High-Risk Transactions</h3>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-6 py-3 font-semibold">Transaction ID</th>
              <th className="px-6 py-3 font-semibold">User</th>
              <th className="px-6 py-3 font-semibold">Type</th>
              <th className="px-6 py-3 font-semibold">Amount</th>
              <th className="px-6 py-3 font-semibold">Fraud Score</th>
              <th className="px-6 py-3 font-semibold">Status</th>
              <th className="px-6 py-3 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {transactions.map((tx) => (
              <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4 font-mono text-slate-600">{tx.id}</td>
                <td className="px-6 py-4">{tx.userId}</td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 bg-slate-100 rounded text-xs font-medium text-slate-600">{tx.type}</span>
                </td>
                <td className="px-6 py-4 font-medium">฿{tx.amount.toLocaleString()}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${tx.fraudScore > 80 ? 'bg-rose-500' : tx.fraudScore > 50 ? 'bg-amber-500' : 'bg-emerald-500'}`} 
                        style={{width: `${tx.fraudScore}%`}}
                      ></div>
                    </div>
                    <span className={`font-bold ${tx.fraudScore > 80 ? 'text-rose-600' : tx.fraudScore > 50 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {tx.fraudScore}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    tx.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700' :
                    tx.status === 'FLAGGED' ? 'bg-rose-50 text-rose-700' :
                    tx.status === 'FAILED' ? 'bg-slate-200 text-slate-600' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {tx.status === 'FLAGGED' && <AlertOctagon size={12} />}
                    {tx.status}
                  </span>
                  {tx.note && <div className="text-xs text-slate-500 mt-1 truncate max-w-[150px]">{tx.note}</div>}
                </td>
                <td className="px-6 py-4 text-right">
                  {tx.status === 'FLAGGED' ? (
                    <button 
                      onClick={() => setShowInvestigateModal(tx)}
                      className="text-indigo-600 hover:text-indigo-800 font-bold text-xs bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 hover:bg-indigo-100 transition-colors"
                    >
                      Investigate
                    </button>
                  ) : (
                    <span className="text-slate-400 text-xs">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* --- INVESTIGATION MODAL --- */}
      {showInvestigateModal && (
         <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
               {/* Modal Header */}
               <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                  <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                     <Search size={20} className="text-indigo-600"/> Fraud Investigation: <span className="font-mono text-slate-600">{showInvestigateModal.id}</span>
                  </h3>
                  <button onClick={() => setShowInvestigateModal(null)}><X size={20} className="text-slate-400 hover:text-slate-600"/></button>
               </div>
               
               <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left: Transaction Details */}
                  <div className="space-y-4">
                     <h4 className="text-xs font-bold text-slate-400 uppercase">Transaction Details</h4>
                     <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-3">
                        <div className="flex justify-between">
                           <span className="text-sm text-slate-500">Amount</span>
                           <span className="text-sm font-bold text-slate-800">฿{showInvestigateModal.amount.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                           <span className="text-sm text-slate-500">User ID</span>
                           <span className="text-sm font-mono text-slate-800">{showInvestigateModal.userId}</span>
                        </div>
                        <div className="flex justify-between">
                           <span className="text-sm text-slate-500">Time</span>
                           <span className="text-sm text-slate-800">{showInvestigateModal.timestamp}</span>
                        </div>
                        <div className="pt-2 border-t border-slate-200">
                           <span className="text-xs text-rose-600 font-bold flex items-center gap-1">
                              <AlertOctagon size={12} /> Reason: {showInvestigateModal.note}
                           </span>
                        </div>
                     </div>
                  </div>

                  {/* Right: Technical Signals */}
                  <div className="space-y-4">
                     <h4 className="text-xs font-bold text-slate-400 uppercase">Risk Signals</h4>
                     <div className="space-y-2">
                        <div className="flex items-center gap-3 p-2 border border-slate-100 rounded-lg">
                           <MapPin className="text-rose-500" size={16} />
                           <div className="text-xs">
                              <p className="font-bold text-slate-700">Location Mismatch</p>
                              <p className="text-slate-500">IP: Russia (RU) vs User: Thailand (TH)</p>
                           </div>
                        </div>
                        <div className="flex items-center gap-3 p-2 border border-slate-100 rounded-lg">
                           <Smartphone className="text-amber-500" size={16} />
                           <div className="text-xs">
                              <p className="font-bold text-slate-700">Device Anomaly</p>
                              <p className="text-slate-500">New Device (Emulator Detected)</p>
                           </div>
                        </div>
                        <div className="flex items-center gap-3 p-2 border border-slate-100 rounded-lg">
                           <Globe className="text-slate-400" size={16} />
                           <div className="text-xs">
                              <p className="font-bold text-slate-700">Network</p>
                              <p className="text-slate-500">VPN / Proxy Detected</p>
                           </div>
                        </div>
                     </div>
                  </div>
               </div>

               {/* Action Footer */}
               <div className="p-5 bg-slate-50 border-t border-slate-100 flex gap-3 justify-end">
                  <button 
                     onClick={() => handleInvestigateAction('SAFE')}
                     className="px-4 py-2 bg-white border border-slate-200 text-slate-600 font-bold text-sm rounded-lg hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 transition-colors flex items-center gap-2"
                  >
                     <CheckCircle size={16} /> Mark as Safe (Allow)
                  </button>
                  <button 
                     onClick={() => handleInvestigateAction('FRAUD')}
                     className="px-4 py-2 bg-rose-600 text-white font-bold text-sm rounded-lg hover:bg-rose-700 transition-colors flex items-center gap-2 shadow-lg shadow-rose-200"
                  >
                     <XCircle size={16} /> Confirm Fraud (Block)
                  </button>
               </div>
            </div>
         </div>
      )}

    </div>
  );
};
