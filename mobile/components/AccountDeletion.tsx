import React, { useState, useEffect } from 'react';
import { Trash2, AlertTriangle, Shield, X, Loader2 } from 'lucide-react';
import { api } from '../services/api';

interface DeletionRequest {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'cancelled';
  reason: string;
  requested_at: string;
  processed_at?: string;
  scheduled_deletion_date?: string;
  admin_notes?: string;
}

export const AccountDeletion: React.FC = () => {
  const [showWarning, setShowWarning] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadDeletionStatus();
  }, []);

  const loadDeletionStatus = async () => {
    try {
      const { data } = await api.get('/account/delete-status');
      setRequests(data.requests || []);
    } catch (err) {
      console.error('Failed to load deletion status:', err);
    }
  };

  const handleRequestDeletion = async () => {
    if (!reason.trim()) {
      setMessage({ type: 'error', text: 'กรุณาระบุเหตุผล' });
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post('/account/delete-request', { reason });
      setMessage({ 
        type: 'success', 
        text: 'ส่งคำขอลบบัญชีเรียบร้อย จะได้รับการตรวจสอบภายใน 7 วัน' 
      });
      setShowWarning(false);
      setReason('');
      loadDeletionStatus();
    } catch (err: any) {
      setMessage({ 
        type: 'error', 
        text: err?.response?.data?.message || 'เกิดข้อผิดพลาด' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCancelDeletion = async (requestId: string) => {
    if (!confirm('คุณต้องการยกเลิกคำขอลบบัญชีหรือไม่?')) return;

    try {
      await api.delete(`/account/cancel-deletion/${requestId}`);
      setMessage({ type: 'success', text: 'ยกเลิกคำขอเรียบร้อยแล้ว' });
      loadDeletionStatus();
    } catch (err: any) {
      setMessage({ type: 'error', text: 'ไม่สามารถยกเลิกได้' });
    }
  };

  const pendingRequest = requests.find(r => r.status === 'pending' || r.status === 'approved');

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="bg-white rounded-2xl shadow-lg p-8">
        <div className="flex items-center gap-3 mb-6">
          <AlertTriangle size={28} className="text-red-600" />
          <h2 className="text-2xl font-bold text-slate-800">Delete Account</h2>
        </div>

        {message && (
          <div className={`p-4 rounded-lg mb-6 ${
            message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            <p className="text-sm font-medium">{message.text}</p>
          </div>
        )}

        {pendingRequest ? (
          <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-6 mb-6">
            <div className="flex items-start gap-3">
              <Shield size={24} className="text-amber-600 flex-shrink-0 mt-1" />
              <div className="flex-1">
                <h3 className="font-bold text-amber-900 mb-2">
                  Deletion Request Submitted
                </h3>
                <p className="text-sm text-amber-800 mb-3">
                  Your account deletion request is {pendingRequest.status}.
                  {pendingRequest.scheduled_deletion_date && (
                    <> Scheduled for: {new Date(pendingRequest.scheduled_deletion_date).toLocaleDateString('th-TH')}</>
                  )}
                </p>
                <div className="text-xs text-amber-700 mb-3">
                  <p><strong>Reason:</strong> {pendingRequest.reason}</p>
                  <p><strong>Requested:</strong> {new Date(pendingRequest.requested_at).toLocaleString('th-TH')}</p>
                  {pendingRequest.admin_notes && (
                    <p className="mt-2"><strong>Admin Note:</strong> {pendingRequest.admin_notes}</p>
                  )}
                </div>
                {pendingRequest.status === 'pending' && (
                  <button
                    onClick={() => handleCancelDeletion(pendingRequest.id)}
                    className="px-4 py-2 bg-white border-2 border-amber-300 text-amber-800 rounded-lg text-sm font-bold hover:bg-amber-100"
                  >
                    Cancel Request
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-6 mb-6">
              <h3 className="font-bold text-red-900 mb-3">⚠️ Warning - This action is permanent</h3>
              <ul className="text-sm text-red-800 space-y-2 list-disc list-inside">
                <li>All your personal data will be permanently deleted</li>
                <li>Your wallet balance will be forfeited (withdraw first)</li>
                <li>You cannot recover your account after deletion</li>
                <li>All your bookings, reviews, and history will be removed</li>
                <li>Deletion will be processed within 30 days</li>
              </ul>
            </div>

            {!showWarning ? (
              <button
                onClick={() => setShowWarning(true)}
                className="w-full py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 flex items-center justify-center gap-2"
              >
                <Trash2 size={20} />
                Request Account Deletion
              </button>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Reason for Deletion (Required)
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={4}
                    className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-red-500 focus:ring-2 focus:ring-red-200"
                    placeholder="Please tell us why you want to delete your account..."
                    required
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowWarning(false)}
                    className="flex-1 py-3 border-2 border-slate-300 rounded-xl font-bold text-slate-700 hover:bg-slate-50"
                  >
                    <X size={18} className="inline mr-2" />
                    Cancel
                  </button>
                  <button
                    onClick={handleRequestDeletion}
                    disabled={loading || !reason.trim()}
                    className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Trash2 size={18} />
                        Confirm Deletion
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        <div className="mt-8 pt-6 border-t border-slate-200">
          <h4 className="font-bold text-slate-700 mb-2">📋 Deletion History</h4>
          {requests.length === 0 ? (
            <p className="text-sm text-slate-500">No deletion requests</p>
          ) : (
            <div className="space-y-2">
              {requests.map((req) => (
                <div key={req.id} className="text-xs bg-slate-50 p-3 rounded-lg">
                  <span className={`inline-block px-2 py-1 rounded text-white font-bold ${
                    req.status === 'approved' ? 'bg-red-600' :
                    req.status === 'pending' ? 'bg-amber-600' :
                    req.status === 'rejected' ? 'bg-slate-600' : 'bg-green-600'
                  }`}>
                    {req.status.toUpperCase()}
                  </span>
                  <span className="ml-2 text-slate-600">
                    {new Date(req.requested_at).toLocaleDateString('th-TH')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
