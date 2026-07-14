import React, { useState, useEffect, useCallback } from 'react';
import { FileText, X, Shield, AlertCircle } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useMobileAppConfig } from '../context/MobileAppConfigContext';

export const ComplianceModal: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const { bootstrap } = useMobileAppConfig();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [needsAcceptance, setNeedsAcceptance] = useState(false);
  const [termsData, setTermsData] = useState<any>(null);
  const [privacyData, setPrivacyData] = useState<any>(null);
  const [termsContent, setTermsContent] = useState('');
  const [privacyContent, setPrivacyContent] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [showType, setShowType] = useState<'terms' | 'privacy' | null>(null);

  const checkComplianceStatus = useCallback(async () => {
    try {
      setLoading(true);
      const { data: status } = await api.get('/compliance/user/status');
      
      if (status.needs_acceptance) {
        setNeedsAcceptance(true);
        setIsOpen(true);
        
        // โหลดนโยบายที่ต้องยอมรับ
        if (status.terms?.needs_update) {
          const { data: termsRes } = await api.get('/compliance/terms');
          setTermsData(termsRes.policy);
          setTermsContent(termsRes.policy.content);
        }
        
        if (status.privacy?.needs_update) {
          const { data: privacyRes } = await api.get('/compliance/privacy');
          setPrivacyData(privacyRes.policy);
          setPrivacyContent(privacyRes.policy.content);
        }
      } else {
        setNeedsAcceptance(false);
        setIsOpen(false);
      }
    } catch (err) {
      console.error('Failed to check compliance status:', err);
      // ถ้า error ไม่ block user (อาจจะยังไม่มี policy หรือ backend ยังไม่พร้อม)
      setIsOpen(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      void checkComplianceStatus();
    }
  }, [
    isAuthenticated,
    checkComplianceStatus,
    bootstrap.complianceVersions.terms,
    bootstrap.complianceVersions.privacy,
  ]);

  const handleAcceptAll = async () => {
    try {
      setAccepting(true);
      
      if (termsData) {
        await api.post('/compliance/accept', {
          policy_id: termsData.id,
          policy_type: 'terms',
          policy_version: termsData.version
        });
      }
      
      if (privacyData) {
        await api.post('/compliance/accept', {
          policy_id: privacyData.id,
          policy_type: 'privacy',
          policy_version: privacyData.version
        });
      }
      
      setIsOpen(false);
      setNeedsAcceptance(false);
    } catch (err) {
      console.error('Failed to accept policies:', err);
      alert('ไม่สามารถบันทึกการยอมรับได้ กรุณาลองใหม่');
    } finally {
      setAccepting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-gradient-to-r from-amber-50 to-orange-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-xl">
              <AlertCircle size={24} className="text-amber-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">📋 นโยบายใหม่ที่ต้องยอมรับ</h2>
              <p className="text-sm text-slate-600 mt-1">กรุณาอ่านและยอมรับนโยบายที่อัปเดตก่อนใช้งานต่อ</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto"></div>
              <p className="text-slate-500 mt-4">กำลังตรวจสอบนโยบาย...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Terms Preview */}
              {termsData && (
                <div className="border-2 border-slate-200 rounded-xl p-4 bg-slate-50">
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                      <FileText size={20} className="text-emerald-600" />
                      <h3 className="font-bold text-slate-800">ข้อกำหนดและเงื่อนไขการใช้บริการ</h3>
                    </div>
                    <button
                      onClick={() => setShowType('terms')}
                      className="text-sm px-3 py-1 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                    >
                      อ่านเต็ม
                    </button>
                  </div>
                  <p className="text-sm text-slate-600">
                    <strong>เวอร์ชัน:</strong> {termsData.version} •{' '}
                    <strong>อัปเดต:</strong> {new Date(termsData.published_at || termsData.created_at).toLocaleDateString('th-TH')}
                  </p>
                </div>
              )}

              {/* Privacy Preview */}
              {privacyData && (
                <div className="border-2 border-slate-200 rounded-xl p-4 bg-slate-50">
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                      <Shield size={20} className="text-blue-600" />
                      <h3 className="font-bold text-slate-800">นโยบายความเป็นส่วนตัว</h3>
                    </div>
                    <button
                      onClick={() => setShowType('privacy')}
                      className="text-sm px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      อ่านเต็ม
                    </button>
                  </div>
                  <p className="text-sm text-slate-600">
                    <strong>เวอร์ชัน:</strong> {privacyData.version} •{' '}
                    <strong>อัปเดต:</strong> {new Date(privacyData.published_at || privacyData.created_at).toLocaleDateString('th-TH')}
                  </p>
                </div>
              )}

              {/* Notice */}
              <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-lg">
                <p className="text-sm text-amber-800">
                  <strong>⚠️ สำคัญ:</strong> คุณต้องยอมรับนโยบายที่อัปเดตเพื่อใช้งาน AQOND ต่อไป
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!loading && needsAcceptance && (
          <div className="p-6 border-t border-slate-200 bg-slate-50">
            <div className="flex justify-end gap-3">
              <button
                onClick={handleAcceptAll}
                disabled={accepting}
                className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
              >
                {accepting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    กำลังบันทึก...
                  </>
                ) : (
                  '✅ ยอมรับทั้งหมด'
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Full Content Modal */}
      {showType && (
        <div className="fixed inset-0 bg-black/80 z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                {showType === 'terms' ? <FileText size={20} className="text-emerald-600" /> : <Shield size={20} className="text-blue-600" />}
                {showType === 'terms' ? 'ข้อกำหนดและเงื่อนไขการใช้บริการ' : 'นโยบายความเป็นส่วนตัว'}
              </h3>
              <button onClick={() => setShowType(null)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <div 
                className="prose prose-slate max-w-none"
                dangerouslySetInnerHTML={{ __html: showType === 'terms' ? termsContent : privacyContent }}
              />
            </div>
            <div className="p-6 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setShowType(null)}
                className="px-6 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
