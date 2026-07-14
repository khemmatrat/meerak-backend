/**
 * InsuranceClaimsView.tsx — Nexus Admin Core
 * ─────────────────────────────────────────────────────────────────────
 * Insurance Claims Management:
 *  • รายการคำขอเคลมทั้งหมด (pending / approved / rejected)
 *  • ตรวจสอบหลักฐานก่อนอนุมัติ
 *  • อนุมัติ → จ่าย 40% ให้ผู้รับงานใหม่ (60% → Platform Stability Reserve)
 *  • ปฏิเสธ → ระบุเหตุผล
 *  • 40/60 Rule: คำนวณ replacement_payout อัตโนมัติ
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Shield, CheckCircle2, XCircle, Clock, RefreshCw,
  ChevronDown, ChevronUp, User, Briefcase, DollarSign,
  AlertTriangle, FileText, Star,
} from 'lucide-react';
import {
  getAdminInsuranceClaims,
  approveInsuranceClaim,
  rejectInsuranceClaim,
  InsuranceClaimRow,
} from '../services/adminApi';

// ─── helpers ─────────────────────────────────────────────────────────

function timeAgo(dateStr?: string): string {
  if (!dateStr) return '—';
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function fmt(n?: number | string): string {
  return Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_META: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  pending:  { label: 'รอพิจารณา', cls: 'bg-amber-100 text-amber-700',   icon: <Clock size={11} /> },
  approved: { label: 'อนุมัติแล้ว', cls: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle2 size={11} /> },
  rejected: { label: 'ปฏิเสธแล้ว', cls: 'bg-red-100 text-red-700',      icon: <XCircle size={11} /> },
};

// ─── Claim Detail Panel ───────────────────────────────────────────────

const ClaimDetailPanel: React.FC<{
  claim:       InsuranceClaimRow;
  onApprove:   (adminNote: string) => Promise<void>;
  onReject:    (adminNote: string) => Promise<void>;
  processing:  boolean;
}> = ({ claim, onApprove, onReject, processing }) => {
  const [adminNote, setAdminNote] = useState('');
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);

  const st = STATUS_META[claim.claim_status] || STATUS_META.pending;
  const isResolved = claim.claim_status !== 'pending';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden h-full flex flex-col">
      {/* Header */}
      <div className={`px-5 py-4 border-b ${isResolved ? 'bg-slate-50 border-slate-100' : 'bg-amber-50 border-amber-100'}`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <Shield size={18} className="text-amber-500" />
              {claim.job_title || 'งานไม่มีชื่อ'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {claim.job_category || '—'} &nbsp;•&nbsp; เคลมเมื่อ {timeAgo(claim.claimed_at)}
            </p>
          </div>
          <span className={`flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${st.cls}`}>
            {st.icon} {st.label}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Financial Summary — 40/60 Rule (Platform Stability Policy) */}
        <div className="bg-gradient-to-br from-amber-50 to-amber-100/60 rounded-xl p-4 border border-amber-200">
          <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-3">
            💰 วงเงินคุ้มครอง (40/60 Rule)
          </p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">วงเงินประกัน</span>
              <span className="font-semibold text-slate-800">฿{fmt(claim.original_price)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">ค่าจ้างผู้รับงานใหม่ (40%)</span>
              <span className="font-bold text-amber-700">฿{fmt(claim.replacement_payout)}</span>
            </div>
            <div className="flex justify-between border-t border-amber-200 pt-2">
              <span className="text-slate-500 text-xs">Platform Stability Reserve (60%)</span>
              <span className="text-slate-500 text-xs">฿{fmt(claim.reserve_amount)}</span>
            </div>
          </div>
        </div>

        {/* Worker & Client */}
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">ผู้รับงานเดิม</p>
            <div className="flex items-center gap-2">
              {claim.worker_avatar ? (
                <img src={claim.worker_avatar} alt={claim.worker_name}
                  className="w-8 h-8 rounded-full object-cover border border-slate-200" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
                  <User size={14} className="text-slate-400" />
                </div>
              )}
              <div>
                <p className="font-semibold text-slate-800 text-sm">{claim.worker_name || '—'}</p>
                <p className="text-xs text-slate-500">{claim.worker_email || '—'}</p>
                {claim.worker_grade && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded text-white ${
                    claim.worker_grade === 'A' ? 'bg-amber-500' :
                    claim.worker_grade === 'B' ? 'bg-indigo-500' : 'bg-slate-500'
                  }`}>
                    Grade {claim.worker_grade}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">ลูกค้า</p>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                <User size={14} className="text-indigo-500" />
              </div>
              <div>
                <p className="font-semibold text-slate-800 text-sm">{claim.client_name || '—'}</p>
                <p className="text-xs text-slate-500">{claim.client_email || '—'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Evidence */}
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <p className="text-xs font-bold text-slate-600 mb-2 flex items-center gap-1">
            <FileText size={13} /> หลักฐาน / คำอธิบายจากลูกค้า
          </p>
          <p className="text-sm text-slate-700 leading-relaxed">
            {claim.evidence_text || '(ไม่มีคำอธิบายเพิ่มเติม)'}
          </p>
        </div>

        {/* Admin Note (if resolved) */}
        {isResolved && claim.admin_note && (
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <p className="text-xs font-bold text-slate-500 mb-1">หมายเหตุจาก Admin</p>
            <p className="text-sm text-slate-700">{claim.admin_note}</p>
            {claim.resolved_at && (
              <p className="text-[11px] text-slate-400 mt-1">ตัดสินเมื่อ {new Date(claim.resolved_at).toLocaleString('th-TH')}</p>
            )}
          </div>
        )}

        {/* Action Area */}
        {!isResolved && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                หมายเหตุ Admin (ระบุก่อนตัดสิน)
              </label>
              <textarea
                rows={3}
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                placeholder="เหตุผลการอนุมัติหรือปฏิเสธ..."
                className="w-full border border-slate-300 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
              />
            </div>

            <div className="flex gap-3">
              {/* Reject */}
              {!showRejectConfirm ? (
                <button
                  onClick={() => setShowRejectConfirm(true)}
                  disabled={processing}
                  className="flex-1 py-2.5 border-2 border-red-300 text-red-600 font-bold rounded-xl hover:bg-red-50 transition-colors text-sm disabled:opacity-50"
                >
                  ❌ ปฏิเสธ
                </button>
              ) : (
                <button
                  onClick={() => { onReject(adminNote); setShowRejectConfirm(false); }}
                  disabled={processing}
                  className="flex-1 py-2.5 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors text-sm disabled:opacity-50"
                >
                  ยืนยันปฏิเสธ
                </button>
              )}

              {/* Approve */}
              <button
                onClick={() => onApprove(adminNote)}
                disabled={processing}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-colors text-sm disabled:opacity-50 flex items-center justify-center gap-1"
              >
                <CheckCircle2 size={16} />
                อนุมัติ ฿{fmt(claim.replacement_payout)}
              </button>
            </div>

            {showRejectConfirm && (
              <button
                onClick={() => setShowRejectConfirm(false)}
                className="w-full text-xs text-slate-400 hover:text-slate-600 py-1"
              >
                ยกเลิก
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Claim Row ────────────────────────────────────────────────────────

const ClaimRow: React.FC<{
  claim:    InsuranceClaimRow;
  selected: boolean;
  onClick:  () => void;
}> = ({ claim, selected, onClick }) => {
  const st = STATUS_META[claim.claim_status] || STATUS_META.pending;
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3.5 rounded-xl border transition-all ${
        selected
          ? 'border-amber-400 bg-amber-50 shadow-sm'
          : 'border-slate-200 bg-white hover:border-amber-200 hover:bg-amber-50/30'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
          claim.claim_status === 'pending'  ? 'bg-amber-400 animate-pulse' :
          claim.claim_status === 'approved' ? 'bg-emerald-500' : 'bg-red-400'
        }`} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-800 text-sm truncate">
            {claim.job_title || claim.job_id}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {claim.client_name || '—'} &nbsp;•&nbsp; {timeAgo(claim.claimed_at)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>
            {st.icon} {st.label}
          </span>
          <span className="text-xs font-bold text-amber-700">฿{fmt(claim.replacement_payout)}</span>
        </div>
      </div>
    </button>
  );
};

// ─── Summary Stats ────────────────────────────────────────────────────

const SummaryBar: React.FC<{ claims: InsuranceClaimRow[] }> = ({ claims }) => {
  const pending  = claims.filter((c) => c.claim_status === 'pending').length;
  const approved = claims.filter((c) => c.claim_status === 'approved').length;
  const rejected = claims.filter((c) => c.claim_status === 'rejected').length;
  const totalPayout = claims
    .filter((c) => c.claim_status === 'approved')
    .reduce((sum, c) => sum + Number(c.replacement_payout || 0), 0);

  return (
    <div className="grid grid-cols-4 gap-3 mb-6">
      {[
        { label: 'รอพิจารณา',  value: pending,  cls: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200' },
        { label: 'อนุมัติแล้ว', value: approved, cls: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
        { label: 'ปฏิเสธแล้ว', value: rejected,  cls: 'text-red-500',    bg: 'bg-red-50',     border: 'border-red-200' },
        { label: 'จ่ายทั้งหมด (55%)', value: `฿${fmt(totalPayout)}`, cls: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200' },
      ].map((s, i) => (
        <div key={i} className={`${s.bg} ${s.border} border rounded-xl p-3 text-center`}>
          <p className={`text-xl font-bold ${s.cls}`}>{s.value}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">{s.label}</p>
        </div>
      ))}
    </div>
  );
};

// ─── Main View ────────────────────────────────────────────────────────

export const InsuranceClaimsView: React.FC = () => {
  const [claims,    setClaims]    = useState<InsuranceClaimRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [selected,  setSelected]  = useState<InsuranceClaimRow | null>(null);
  const [processing, setProcessing] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');

  const fetchClaims = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getAdminInsuranceClaims({ status: filterStatus || undefined, limit: 100 });
      setClaims(data.claims);
      if (selected) {
        const updated = data.claims.find((c) => c.id === selected.id);
        if (updated) setSelected(updated);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load claims');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, selected]);

  useEffect(() => { fetchClaims(); }, [filterStatus]);

  const handleApprove = async (adminNote: string) => {
    if (!selected) return;
    if (!confirm(`อนุมัติคำขอเคลม ฿${fmt(selected.replacement_payout)} ให้กับงาน "${selected.job_title}"?`)) return;
    setProcessing(true);
    try {
      await approveInsuranceClaim(selected.id, { admin_note: adminNote });
      await fetchClaims();
    } catch (e: any) {
      alert(`❌ ${e.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async (adminNote: string) => {
    if (!selected) return;
    setProcessing(true);
    try {
      await rejectInsuranceClaim(selected.id, { admin_note: adminNote });
      await fetchClaims();
    } catch (e: any) {
      alert(`❌ ${e.message}`);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="h-full flex flex-col p-6 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Shield size={24} className="text-amber-500" /> Insurance Claims
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            ตรวจสอบและอนุมัติคำขอเคลมประกัน — 55% Rule สำหรับผู้รับงานคนแทน
          </p>
        </div>
        <button
          onClick={() => fetchClaims()}
          className="flex items-center gap-1.5 bg-white border border-slate-200 text-slate-600 px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors text-sm font-medium"
        >
          <RefreshCw size={14} /> รีเฟรช
        </button>
      </div>

      {/* Summary Stats */}
      {!loading && <SummaryBar claims={claims} />}

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4 shrink-0">
        {[
          { value: '',         label: 'ทั้งหมด' },
          { value: 'pending',  label: '⏳ รอพิจารณา' },
          { value: 'approved', label: '✅ อนุมัติแล้ว' },
          { value: 'rejected', label: '❌ ปฏิเสธแล้ว' },
        ].map((f) => (
          <button
            key={f.value}
            onClick={() => { setFilterStatus(f.value); setSelected(null); }}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
              filterStatus === f.value
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600 hover:border-amber-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 min-h-0 grid grid-cols-5 gap-4">
        {/* Claims List */}
        <div className="col-span-2 overflow-y-auto space-y-2 pr-1">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-slate-100 animate-pulse" />
            ))
          ) : claims.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400">
              <Shield size={32} className="mb-2 text-slate-300" />
              <p className="text-sm">ไม่มีคำขอเคลม</p>
            </div>
          ) : (
            claims.map((c) => (
              <ClaimRow
                key={c.id}
                claim={c}
                selected={selected?.id === c.id}
                onClick={() => setSelected(c)}
              />
            ))
          )}
        </div>

        {/* Detail Panel */}
        <div className="col-span-3 overflow-hidden">
          {selected ? (
            <ClaimDetailPanel
              claim={selected}
              processing={processing}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl">
              <Shield size={36} className="mb-2 text-slate-300" />
              <p className="text-sm">เลือกคำขอเคลมเพื่อดูรายละเอียด</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
