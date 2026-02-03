/**
 * Phase 4B: KYC Review — list submissions, view detail, approve/reject.
 * All decisions are logged in financial_audit_log (backend).
 */
import React, { useState, useEffect } from "react";
import {
  Search,
  Eye,
  CheckCircle,
  XCircle,
  FileText,
  Loader2,
  X,
  ShieldCheck,
} from "lucide-react";
import {
  getKycSubmissions,
  getKycDetail,
  approveKyc,
  rejectKyc,
  getAdminToken,
  type KycSubmissionRow,
  type KycDetailResponse,
} from "../services/adminApi";

export const KycReviewView: React.FC = () => {
  const [submissions, setSubmissions] = useState<KycSubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<KycDetailResponse | null>(null);
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const useBackend = !!getAdminToken();

  const fetchList = async () => {
    if (!useBackend) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await getKycSubmissions({
        status: "pending,under_review",
        limit: 100,
      });
      setSubmissions(res.submissions || []);
    } catch (e) {
      console.error("KYC list error:", e);
      setSubmissions([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchList();
  }, [useBackend]);

  const openDetail = async (userId: string) => {
    try {
      const res = await getKycDetail(userId);
      setDetail(res);
      setDetailUserId(userId);
      setRejectReason("");
    } catch (e: any) {
      alert("Failed to load KYC detail: " + (e?.message || e));
    }
  };

  const handleApprove = async () => {
    if (!detailUserId) return;
    setProcessing(true);
    try {
      await approveKyc(detailUserId);
      alert("KYC approved; decision recorded in audit log.");
      setDetail(null);
      setDetailUserId(null);
      fetchList();
    } catch (e: any) {
      alert("Failed to approve: " + (e?.message || e));
    }
    setProcessing(false);
  };

  const handleReject = async () => {
    if (!detailUserId) return;
    setProcessing(true);
    try {
      await rejectKyc(detailUserId, rejectReason || undefined);
      alert("KYC rejected; decision recorded in audit log.");
      setDetail(null);
      setDetailUserId(null);
      setRejectReason("");
      fetchList();
    } catch (e: any) {
      alert("Failed to reject: " + (e?.message || e));
    }
    setProcessing(false);
  };

  if (!useBackend) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
        <ShieldCheck size={48} className="mx-auto mb-4 text-slate-400" />
        <p>KYC Review requires admin login (backend JWT).</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-6 text-white">
        <h2 className="text-2xl font-bold mb-2">KYC Review</h2>
        <p className="text-indigo-100">
          List submissions, view detail, approve or reject. Every decision is
          logged in financial_audit_log.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h3 className="font-bold text-slate-800">Submissions (pending / under_review)</h3>
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-48 text-slate-400">
            <Loader2 size={32} className="animate-spin" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-6 py-3 text-left font-semibold">User</th>
                <th className="px-6 py-3 text-left font-semibold">Status</th>
                <th className="px-6 py-3 text-left font-semibold">Docs</th>
                <th className="px-6 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {submissions.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/50">
                  <td className="px-6 py-4">
                    <p className="font-medium text-slate-900">
                      {s.full_name || s.email}
                    </p>
                    <p className="text-xs text-slate-500">{s.email}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-800">
                      {s.kyc_status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {s.doc_count} total, {s.pending_docs} pending
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => openDetail(s.id)}
                      className="text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg text-xs font-medium"
                    >
                      <Eye size={14} className="inline mr-1" /> View
                    </button>
                  </td>
                </tr>
              ))}
              {submissions.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-12 text-center text-slate-400"
                  >
                    No pending KYC submissions
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 my-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <FileText size={24} className="text-indigo-600" /> KYC Detail
              </h3>
              <button
                onClick={() => setDetail(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={24} />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="bg-slate-50 p-4 rounded-lg">
                <p className="text-xs text-slate-500">Name</p>
                <p className="font-bold text-slate-900">
                  {(detail.user as any).full_name || (detail.user as any).email}
                </p>
              </div>
              <div className="bg-slate-50 p-4 rounded-lg">
                <p className="text-xs text-slate-500">Email</p>
                <p className="font-bold text-slate-900">
                  {(detail.user as any).email}
                </p>
              </div>
              <div className="bg-slate-50 p-4 rounded-lg">
                <p className="text-xs text-slate-500">KYC Status</p>
                <p className="font-bold text-slate-900">
                  {(detail.user as any).kyc_status}
                </p>
              </div>
              <div className="bg-slate-50 p-4 rounded-lg">
                <p className="text-xs text-slate-500">Documents</p>
                <p className="font-bold text-slate-900">
                  {detail.documents?.length || 0}
                </p>
              </div>
            </div>
            {detail.documents?.length > 0 && (
              <div className="mb-6">
                <h4 className="text-sm font-bold text-slate-700 mb-2">
                  Documents
                </h4>
                <ul className="space-y-2">
                  {(detail.documents as any[]).map((d: any) => (
                    <li
                      key={d.id}
                      className="flex justify-between items-center p-2 bg-slate-50 rounded"
                    >
                      <span>{d.document_type}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-200">
                        {d.verification_status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Rejection reason (optional)"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
              <button
                onClick={handleApprove}
                disabled={processing}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 flex items-center gap-2 disabled:opacity-50"
              >
                {processing ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <CheckCircle size={18} />
                )}
                Approve
              </button>
              <button
                onClick={handleReject}
                disabled={processing}
                className="px-4 py-2 bg-rose-600 text-white rounded-lg font-medium hover:bg-rose-700 flex items-center gap-2 disabled:opacity-50"
              >
                <XCircle size={18} /> Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
