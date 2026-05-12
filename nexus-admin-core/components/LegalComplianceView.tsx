import React, { useState, useEffect } from 'react';
import { Scale, FileText, UserMinus, ShieldAlert, Check, X, Eye, Download, Search, Clock, Plus, Save, AlertCircle, CheckCircle, History, Loader2 } from 'lucide-react';
import { 
  getAllCompliancePolicies, 
  createCompliancePolicy, 
  getCompliancePolicy, 
  activateCompliancePolicy,
  getCompliancePolicyHistory,
  getAdminAccountDeletions,
  patchAdminAccountDeletion,
  getAdminPdpaExport,
  patchAdminPdpaExport,
  getAdminLawEnforcement,
  patchAdminLawEnforcement,
  postAdminLawEnforcement
} from '../services/adminApi';

const POLICY_TYPES = [
  'terms', 'privacy', 'cookie', 'refund', 'community_guidelines', 'kyc_policy', 'escrow_policy',
  'talent_policy', 'night_work_policy', 'prohibited_services', 'platform_enforcement', 'anti_fraud',
  'dispute', 'enforcement', 'freelancer_agreement', 'client_agreement', 'content_chat',
  'talent_category_rules', 'off_platform_transaction', 'escrow_legal_clause', 'liability_limitation',
  'aml_policy', 'risk_monitoring_policy', 'trust_safety_manual', 'managed_marketplace_policy',
  'high_risk_services_policy', 'safety_incident_policy'
] as const;
type PolicyType = (typeof POLICY_TYPES)[number];

const POLICY_LABELS: Record<string, string> = {
  terms: 'Terms of Service', privacy: 'Privacy Policy', cookie: 'Cookie Policy', refund: 'Refund Policy',
  community_guidelines: 'Community Guidelines', kyc_policy: 'KYC Policy', escrow_policy: 'Escrow Policy',
  talent_policy: 'Talent Policy', night_work_policy: 'Safety & Night Work', prohibited_services: 'Prohibited Services',
  platform_enforcement: 'Platform Enforcement', anti_fraud: 'Anti-Fraud', dispute: 'Dispute', enforcement: 'Enforcement',
  freelancer_agreement: 'Freelancer Agreement', client_agreement: 'Client Agreement', content_chat: 'Content & Chat',
  talent_category_rules: 'Talent Category Rules', off_platform_transaction: 'Off-Platform Transaction',
  escrow_legal_clause: 'Escrow Legal Clause', liability_limitation: 'Liability Limitation',
  aml_policy: 'AML Policy', risk_monitoring_policy: 'Risk Monitoring', trust_safety_manual: 'Trust & Safety Manual',
  managed_marketplace_policy: 'Managed Marketplace Policy', high_risk_services_policy: 'High-Risk Services Policy',
  safety_incident_policy: 'Safety Incident Policy'
};

interface Policy {
  id: string;
  type: string;
  version: string;
  content?: string;
  is_active: boolean;
  created_at: string;
  published_at?: string;
  notes?: string;
  content_length?: number;
  created_by_name?: string;
}

export const LegalComplianceView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'requests' | 'docs' | 'police'>('requests');
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [pdpaDeletions, setPdpaDeletions] = useState<Array<{ id: string; user_id: string; status: string; requested_at: string; reason: string | null; full_name: string | null; email: string | null }>>([]);
  const [pdpaExports, setPdpaExports] = useState<Array<{ id: string; user_id: string; status: string; requested_at: string; deadline: string | null; full_name: string | null; email: string | null }>>([]);
  const [lawEnforcement, setLawEnforcement] = useState<Array<{ id: string; case_id: string | null; agency: string | null; target_user_id: string | null; status: string; requested_at: string; deadline: string | null; documents: unknown; target_name: string | null; target_email: string | null }>>([]);
  const [pdpaFilter, setPdpaFilter] = useState<'pending' | 'all'>('pending');
  const [loadingPdpa, setLoadingPdpa] = useState(false);
  const [loadingPolice, setLoadingPolice] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedType, setSelectedType] = useState<string>(POLICY_TYPES[0]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorContent, setEditorContent] = useState('');
  const [editorVersion, setEditorVersion] = useState('');
  const [editorNotes, setEditorNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyData, setHistoryData] = useState<Policy[]>([]);
  const [viewPolicy, setViewPolicy] = useState<Policy | null>(null);

  useEffect(() => {
    if (activeTab === 'docs') {
      loadPolicies();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'requests') {
      loadPdpaRequests();
    }
  }, [activeTab, pdpaFilter]);

  useEffect(() => {
    if (activeTab === 'police') {
      loadLawEnforcement();
    }
  }, [activeTab]);

  const loadPdpaRequests = async () => {
    setLoadingPdpa(true);
    try {
      const [delRes, expRes] = await Promise.all([
        getAdminAccountDeletions(pdpaFilter === 'all' ? 'all' : 'pending'),
        getAdminPdpaExport(pdpaFilter === 'all' ? 'all' : 'pending')
      ]);
      setPdpaDeletions(delRes.requests || []);
      setPdpaExports(expRes.requests || []);
    } catch (err) {
      console.error('Failed to load PDPA requests:', err);
      setMessage({ type: 'error', text: 'ไม่สามารถโหลดคำขอ PDPA ได้' });
    } finally {
      setLoadingPdpa(false);
    }
  };

  const loadLawEnforcement = async () => {
    setLoadingPolice(true);
    try {
      const res = await getAdminLawEnforcement();
      setLawEnforcement(res.requests || []);
    } catch (err) {
      console.error('Failed to load law enforcement:', err);
      setMessage({ type: 'error', text: 'ไม่สามารถโหลดคำสั่งศาลได้' });
    } finally {
      setLoadingPolice(false);
    }
  };

  const handleProcessDeletion = async (id: string, approved: boolean) => {
    if (!confirm(approved ? 'อนุมัติคำขอลบบัญชี?' : 'ปฏิเสธคำขอลบบัญชี?')) return;
    try {
      await patchAdminAccountDeletion(id, { status: approved ? 'approved' : 'rejected' });
      setMessage({ type: 'success', text: approved ? '✅ อนุมัติคำขอลบบัญชีแล้ว' : '✅ ปฏิเสธคำขอลบบัญชีแล้ว' });
      loadPdpaRequests();
    } catch (err: unknown) {
      setMessage({ type: 'error', text: (err as Error).message || 'เกิดข้อผิดพลาด' });
    }
  };

  const handleProcessExport = async (id: string, status: 'completed' | 'rejected') => {
    if (!confirm(status === 'completed' ? 'ยืนยันการส่งมอบข้อมูลให้ผู้ใช้?' : 'ปฏิเสธคำขอ export?')) return;
    try {
      await patchAdminPdpaExport(id, { status });
      setMessage({ type: 'success', text: status === 'completed' ? '✅ บันทึกสำเร็จ' : '✅ ปฏิเสธคำขอแล้ว' });
      loadPdpaRequests();
    } catch (err: unknown) {
      setMessage({ type: 'error', text: (err as Error).message || 'เกิดข้อผิดพลาด' });
    }
  };

  const handleRespondLawEnforcement = async (id: string) => {
    const notes = prompt('กรอกหมายเหตุการตอบ (ถ้ามี):');
    if (notes === null) return;
    try {
      await patchAdminLawEnforcement(id, { status: 'responded', response_notes: notes || undefined });
      setMessage({ type: 'success', text: '✅ บันทึกการตอบแล้ว' });
      loadLawEnforcement();
    } catch (err: unknown) {
      setMessage({ type: 'error', text: (err as Error).message || 'เกิดข้อผิดพลาด' });
    }
  };

  const loadPolicies = async () => {
    setLoading(true);
    try {
      const data = await getAllCompliancePolicies();
      setPolicies(data.policies || []);
    } catch (err) {
      console.error('Failed to load policies:', err);
      setMessage({ type: 'error', text: 'ไม่สามารถโหลดนโยบายได้' });
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async (type: string) => {
    try {
      const data = await getCompliancePolicyHistory(type);
      setHistoryData(data.policies || []);
      setHistoryOpen(true);
    } catch (err) {
      console.error('Failed to load history:', err);
      setMessage({ type: 'error', text: 'ไม่สามารถโหลดประวัติได้' });
    }
  };

  const handleSavePolicy = async () => {
    if (!editorContent.trim() || !editorVersion.trim()) {
      setMessage({ type: 'error', text: 'กรุณากรอก Content และ Version' });
      return;
    }
    
    // Check for duplicate version
    const isDuplicate = policies.some(
      p => p.type === selectedType && p.version === editorVersion.trim()
    );
    
    if (isDuplicate) {
      setMessage({ 
        type: 'error', 
        text: `❌ Version ${editorVersion} สำหรับ ${selectedType} มีอยู่แล้ว กรุณาใช้เวอร์ชันใหม่` 
      });
      return;
    }
    
    setSaving(true);
    setMessage(null);
    try {
      const result = await createCompliancePolicy({
        type: selectedType,
        version: editorVersion.trim(),
        content: editorContent.trim(),
        notes: editorNotes.trim() || undefined
      });
      
      if (result.success) {
        setMessage({ type: 'success', text: `✅ บันทึกนโยบาย ${selectedType} v${editorVersion} สำเร็จ!` });
        setEditorOpen(false);
        setEditorContent('');
        setEditorVersion('');
        setEditorNotes('');
        await loadPolicies();
      } else {
        setMessage({ type: 'error', text: 'เกิดข้อผิดพลาดในการบันทึก' });
      }
    } catch (err: any) {
      console.error('Save policy error:', err);
      const errorMsg = err.message || 'ไม่สามารถบันทึกนโยบายได้';
      if (errorMsg.includes('duplicate key') || errorMsg.includes('unique constraint')) {
        setMessage({ type: 'error', text: '❌ Version นี้มีอยู่แล้ว กรุณาใช้เวอร์ชันใหม่' });
      } else {
        setMessage({ type: 'error', text: errorMsg });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleActivatePolicy = async (policyId: string) => {
    if (!confirm('ต้องการเปิดใช้นโยบายเวอร์ชันนี้หรือไม่?')) return;
    try {
      const result = await activateCompliancePolicy(policyId);
      if (result.success) {
        setMessage({ type: 'success', text: '✅ เปิดใช้นโยบายสำเร็จ!' });
        await loadPolicies();
        setHistoryOpen(false);
      } else {
        setMessage({ type: 'error', text: 'เกิดข้อผิดพลาด' });
      }
    } catch (err: any) {
      console.error('Activate policy error:', err);
      setMessage({ type: 'error', text: err.message || 'ไม่สามารถเปิดใช้นโยบายได้' });
    }
  };

  const handleViewPolicy = async (policyId: string) => {
    try {
      const data = await getCompliancePolicy(policyId);
      setViewPolicy(data.policy);
    } catch (err: any) {
      console.error('Failed to view policy:', err);
      setMessage({ type: 'error', text: err.message || 'ไม่สามารถโหลดนโยบายได้' });
    }
  };

  const activePolicies = policies.filter(p => p.is_active);
  const activePolicyByType = (type: string) => activePolicies.find(p => p.type === type);

  return (
    <div className="space-y-6">
      {message && (
        <div className={`p-4 rounded-xl border ${message.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'} flex items-center gap-3`}>
          {message.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          <span className="font-medium">{message.text}</span>
          <button onClick={() => setMessage(null)} className="ml-auto text-slate-500 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>
      )}
      
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Scale size={20} className="text-indigo-600" />
            Legal Compliance Center
          </h2>
          <p className="text-slate-500 text-sm">Manage legal documents, policies, and compliance versioning.</p>
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
                <button
                  onClick={() => setPdpaFilter('pending')}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${pdpaFilter === 'pending' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
                  รอดำเนินการ
                </button>
                <button
                  onClick={() => setPdpaFilter('all')}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${pdpaFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
                  ทั้งหมด
                </button>
             </div>
          </div>
          {loadingPdpa ? (
            <div className="flex justify-center py-12">
              <Loader2 size={32} className="animate-spin text-slate-400" />
            </div>
          ) : (
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
                {pdpaDeletions.map((req) => (
                  <tr key={`del-${req.id}`} className="hover:bg-slate-50/50">
                    <td className="px-6 py-4 font-mono text-slate-600 font-medium">{String(req.id).slice(0, 8)}...</td>
                    <td className="px-6 py-4">
                      <span className="flex items-center gap-1.5 text-slate-700">
                        <UserMinus size={14} /> Account Deletion
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{req.full_name || req.email || req.user_id}</td>
                    <td className="px-6 py-4 text-slate-500">30 วัน</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        req.status === 'pending' ? 'bg-blue-50 text-blue-600' : req.status === 'approved' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'
                      }`}>{req.status.toUpperCase()}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {req.status === 'pending' && (
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => handleProcessDeletion(req.id, true)} className="text-emerald-600 hover:underline font-bold text-xs">อนุมัติ</button>
                          <button onClick={() => handleProcessDeletion(req.id, false)} className="text-red-600 hover:underline font-bold text-xs">ปฏิเสธ</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {pdpaExports.map((req) => (
                  <tr key={`exp-${req.id}`} className="hover:bg-slate-50/50">
                    <td className="px-6 py-4 font-mono text-slate-600 font-medium">{String(req.id).slice(0, 8)}...</td>
                    <td className="px-6 py-4">
                      <span className="flex items-center gap-1.5 text-slate-700">
                        <Download size={14} /> Data Export
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{req.full_name || req.email || req.user_id}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-0.5 rounded w-fit text-xs font-medium">
                        <Clock size={12} /> {req.deadline ? new Date(req.deadline).toLocaleDateString('th-TH') : '30 วัน'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        req.status === 'pending' ? 'bg-blue-50 text-blue-600' : req.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                      }`}>{req.status.toUpperCase()}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {req.status === 'pending' && (
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => handleProcessExport(req.id, 'completed')} className="text-emerald-600 hover:underline font-bold text-xs">เสร็จแล้ว</button>
                          <button onClick={() => handleProcessExport(req.id, 'rejected')} className="text-red-600 hover:underline font-bold text-xs">ปฏิเสธ</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {pdpaDeletions.length === 0 && pdpaExports.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                      ไม่มีคำขอ PDPA ในขณะนี้
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'docs' && (
         <div className="space-y-4">
            <div className="flex justify-between items-center">
                <div className="flex gap-2 overflow-x-auto pb-2 max-w-full">
                  {POLICY_TYPES.map(type => (
                    <button
                      key={type}
                      onClick={() => setSelectedType(type)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap flex-shrink-0 ${
                        selectedType === type 
                          ? 'bg-indigo-600 text-white' 
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {POLICY_LABELS[type] || type}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => loadHistory(selectedType)}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-200"
                  >
                    <History size={16} /> Version History
                  </button>
                  <button 
                    onClick={() => {
                      // Auto-suggest next version
                      const currentVersions = policies
                        .filter(p => p.type === selectedType)
                        .map(p => p.version)
                        .sort();
                      
                      let nextVersion = '1.0';
                      if (currentVersions.length > 0) {
                        const latest = currentVersions[currentVersions.length - 1];
                        const match = latest.match(/^(\d+)\.(\d+)$/);
                        if (match) {
                          const major = parseInt(match[1]);
                          const minor = parseInt(match[2]);
                          nextVersion = `${major}.${minor + 1}`;
                        }
                      }
                      
                      setEditorContent('');
                      setEditorVersion(nextVersion);
                      setEditorNotes('');
                      setEditorOpen(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700"
                  >
                    <Plus size={16} /> Create New Version
                  </button>
                </div>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 size={32} className="animate-spin text-slate-400" />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {POLICY_TYPES.map(type => {
                  const activePolicy = activePolicyByType(type);
                  return (
                    <div key={type} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 hover:shadow-md transition-shadow relative overflow-hidden">
                      <div className={`absolute top-0 right-0 w-16 h-16 rounded-bl-full opacity-20 ${activePolicy ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                      <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-slate-100 rounded-lg text-slate-600">
                          <FileText size={24} />
                        </div>
                        <span className={`px-2 py-1 rounded text-xs font-bold relative z-10 ${
                          activePolicy ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {activePolicy ? 'ACTIVE' : 'NO ACTIVE'}
                        </span>
                      </div>
                      <h3 className="font-bold text-slate-800 text-lg mb-1">{POLICY_LABELS[type] || type}</h3>
                      <div className="flex items-center gap-4 text-sm text-slate-500 mb-6">
                        {activePolicy && (
                          <>
                            <span className="font-mono bg-slate-100 px-2 rounded">v{activePolicy.version}</span>
                            <span>Updated: {new Date(activePolicy.created_at).toLocaleDateString('th-TH')}</span>
                          </>
                        )}
                        {!activePolicy && <span className="text-amber-600">ยังไม่มีนโยบาย</span>}
                      </div>
                      
                      <div className="pt-4 border-t border-slate-100 flex gap-2">
                        <button 
                          onClick={() => {
                            setSelectedType(type);
                            setEditorContent(activePolicy?.content || '');
                            setEditorVersion('');
                            setEditorNotes('');
                            setEditorOpen(true);
                          }}
                          className="flex-1 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-bold hover:bg-indigo-100 transition-colors"
                        >
                          {activePolicy ? 'Edit' : 'Create'}
                        </button>
                        {activePolicy && (
                          <button 
                            onClick={() => handleViewPolicy(activePolicy.id)}
                            className="px-3 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600"
                          >
                            <Eye size={18} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
         </div>
      )}

      {/* Editor Modal */}
      {editorOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-8">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-800">
                Edit {POLICY_LABELS[selectedType]}
              </h3>
              <button onClick={() => setEditorOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Policy Type</label>
                  <input 
                    type="text" 
                    value={POLICY_LABELS[selectedType]}
                    disabled
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Version *</label>
                  <input 
                    type="text" 
                    placeholder="e.g., 1.1, 2.0"
                    value={editorVersion}
                    onChange={(e) => setEditorVersion(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                  {(() => {
                    const existingVersions = policies
                      .filter(p => p.type === selectedType)
                      .map(p => p.version)
                      .sort();
                    if (existingVersions.length > 0) {
                      return (
                        <p className="text-xs text-slate-500 mt-1">
                          มีอยู่แล้ว: {existingVersions.join(', ')}
                        </p>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Content * (HTML)</label>
                <textarea
                  value={editorContent}
                  onChange={(e) => setEditorContent(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-3 text-sm font-mono"
                  style={{ height: '350px', resize: 'vertical' }}
                  placeholder="<h1>หัวข้อ</h1><p>เนื้อหา...</p>"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Notes (Optional)</label>
                <textarea 
                  placeholder="เช่น: แก้ไขข้อกำหนดการคืนเงิน..."
                  value={editorNotes}
                  onChange={(e) => setEditorNotes(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  rows={3}
                />
              </div>
            </div>
            <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
              <button 
                onClick={() => setEditorOpen(false)}
                className="px-6 py-2 border border-slate-300 rounded-lg font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button 
                onClick={handleSavePolicy}
                disabled={saving}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 disabled:bg-slate-300 flex items-center gap-2"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {saving ? 'Saving...' : 'Publish'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {historyOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl my-8">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <History size={20} />
                Version History: {POLICY_LABELS[selectedType]}
              </h3>
              <button onClick={() => setHistoryOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            <div className="p-6">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-700 font-bold">
                  <tr>
                    <th className="px-4 py-3 text-left">Version</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Created</th>
                    <th className="px-4 py-3 text-left">Notes</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {historyData.map(policy => (
                    <tr key={policy.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono font-bold text-indigo-600">v{policy.version}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          policy.is_active ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {policy.is_active ? 'ACTIVE' : 'ARCHIVED'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {new Date(policy.created_at).toLocaleString('th-TH')}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{policy.notes || '-'}</td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button 
                          onClick={() => handleViewPolicy(policy.id)}
                          className="text-indigo-600 hover:underline font-bold text-xs"
                        >
                          View
                        </button>
                        {!policy.is_active && (
                          <button 
                            onClick={() => handleActivatePolicy(policy.id)}
                            className="text-emerald-600 hover:underline font-bold text-xs"
                          >
                            Activate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* View Policy Modal */}
      {viewPolicy && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-8">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-slate-800">
                  {POLICY_LABELS[viewPolicy.type] || viewPolicy.type} v{viewPolicy.version}
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  Published: {viewPolicy.published_at ? new Date(viewPolicy.published_at).toLocaleString('th-TH') : 'N/A'}
                </p>
              </div>
              <button onClick={() => setViewPolicy(null)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            <div className="p-6 max-h-[70vh] overflow-y-auto">
              <div 
                className="prose prose-slate max-w-none"
                dangerouslySetInnerHTML={{ __html: viewPolicy.content || '' }}
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'police' && (
          <div className="bg-rose-50 border border-rose-100 rounded-xl p-6">
             <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-rose-200 rounded-full text-rose-700"><ShieldAlert size={24} /></div>
                  <div>
                     <h3 className="text-xl font-bold text-rose-800">Law Enforcement Portal</h3>
                     <p className="text-rose-600 text-sm">Secure channel for processing official warrants and court orders.</p>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    const caseId = prompt('Case ID (เลขคดี):');
                    const agency = prompt('Agency (หน่วยงาน):', 'Cyber Crime Division');
                    if (!caseId && !agency) return;
                    try {
                      await postAdminLawEnforcement({ case_id: caseId || undefined, agency: agency || undefined });
                      setMessage({ type: 'success', text: '✅ เพิ่มคำสั่งศาลแล้ว' });
                      loadLawEnforcement();
                    } catch (err: unknown) {
                      setMessage({ type: 'error', text: (err as Error).message || 'เกิดข้อผิดพลาด' });
                    }
                  }}
                  className="px-4 py-2 bg-rose-600 text-white rounded-lg text-sm font-bold hover:bg-rose-700 flex items-center gap-2"
                >
                  <Plus size={16} /> เพิ่มคำสั่งศาล
                </button>
             </div>
             
             {loadingPolice ? (
               <div className="flex justify-center py-12">
                 <Loader2 size={32} className="animate-spin text-slate-400" />
               </div>
             ) : (
             <div className="bg-white rounded-xl border border-rose-100 shadow-sm overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-rose-50 text-rose-800">
                        <tr>
                            <th className="px-6 py-3">Case ID</th>
                            <th className="px-6 py-3">Agency</th>
                            <th className="px-6 py-3">Target User</th>
                            <th className="px-6 py-3">Document</th>
                            <th className="px-6 py-3">Deadline</th>
                            <th className="px-6 py-3">Status</th>
                            <th className="px-6 py-3 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-rose-50">
                        {lawEnforcement.map((req) => (
                             <tr key={req.id} className="hover:bg-rose-50/30">
                                <td className="px-6 py-4 font-bold text-slate-700">{req.case_id || '-'}</td>
                                <td className="px-6 py-4">{req.agency || '-'}</td>
                                <td className="px-6 py-4 font-mono">{req.target_name || req.target_email || req.target_user_id || '-'}</td>
                                <td className="px-6 py-4 text-indigo-600">
                                  {Array.isArray(req.documents) && req.documents.length > 0
                                    ? (req.documents as { name?: string }[])[0]?.name || 'Document'
                                    : 'Warrant'}
                                </td>
                                <td className="px-6 py-4 text-rose-600 font-bold">{req.deadline ? new Date(req.deadline).toLocaleDateString('th-TH') : '-'}</td>
                                <td className="px-6 py-4">
                                  <span className={`px-2 py-1 rounded text-xs font-bold ${
                                    req.status === 'pending' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
                                  }`}>{req.status.toUpperCase()}</span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    {req.status === 'pending' && (
                                      <button 
                                        onClick={() => handleRespondLawEnforcement(req.id)}
                                        className="px-3 py-1 bg-rose-600 text-white rounded text-xs font-bold hover:bg-rose-700"
                                      >
                                        Respond
                                      </button>
                                    )}
                                </td>
                             </tr>
                        ))}
                        {lawEnforcement.length === 0 && (
                          <tr>
                            <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                              ไม่มีคำสั่งศาล/หมายเรียกในขณะนี้
                            </td>
                          </tr>
                        )}
                    </tbody>
                </table>
             </div>
             )}
          </div>
      )}
    </div>
  );
};
