import React, { useState, useEffect } from 'react';
import { Cookie, X } from 'lucide-react';
import { fetchCompliancePolicy } from '../services/compliancePolicyService';

export const CookieConsentBanner: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [cookieContent, setCookieContent] = useState('');
  const [showFullPolicy, setShowFullPolicy] = useState(false);

  useEffect(() => {
    const consentGiven = localStorage.getItem('akonda_cookie_consent');
    if (!consentGiven) {
      // โหลด Cookie Policy
      const fetchCookiePolicy = async () => {
        try {
          const p = await fetchCompliancePolicy('cookie');
          if (p?.content) {
            setCookieContent(p.content);
            setIsVisible(true);
          }
        } catch (err) {
          console.error('Failed to load cookie policy:', err);
        }
      };
      fetchCookiePolicy();
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('akonda_cookie_consent', 'true');
    localStorage.setItem('akonda_cookie_consent_date', new Date().toISOString());
    setIsVisible(false);
  };

  const handleReject = () => {
    localStorage.setItem('akonda_cookie_consent', 'false');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <>
      {/* Banner */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-900 text-white shadow-2xl z-50 border-t-4 border-amber-500">
        <div className="max-w-7xl mx-auto p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex items-center gap-3 flex-1">
              <Cookie size={32} className="text-amber-400 flex-shrink-0" />
              <div>
                <h3 className="font-bold text-lg mb-1">🍪 เราใช้คุกกี้</h3>
                <p className="text-sm text-slate-300">
                  เราใช้คุกกี้เพื่อปรับปรุงประสบการณ์ของคุณและวิเคราะห์การใช้งาน{' '}
                  <button
                    onClick={() => setShowFullPolicy(true)}
                    className="text-amber-400 underline hover:text-amber-300"
                  >
                    อ่านนโยบายคุกกี้
                  </button>
                </p>
              </div>
            </div>
            <div className="flex gap-3 w-full sm:w-auto">
              <button
                onClick={handleReject}
                className="flex-1 sm:flex-none px-6 py-2 border-2 border-slate-600 rounded-lg font-bold hover:bg-slate-800 transition"
              >
                ปฏิเสธ
              </button>
              <button
                onClick={handleAccept}
                className="flex-1 sm:flex-none px-6 py-2 bg-amber-500 text-slate-900 rounded-lg font-bold hover:bg-amber-400 transition"
              >
                ยอมรับทั้งหมด
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Full Policy Modal */}
      {showFullPolicy && (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Cookie size={20} className="text-amber-600" />
                นโยบายคุกกี้ - Akonda
              </h3>
              <button onClick={() => setShowFullPolicy(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 bg-white">
              <div 
                className="prose prose-slate max-w-none text-gray-800"
                dangerouslySetInnerHTML={{ __html: cookieContent || '<p className="text-slate-500 text-center">กำลังปรับปรุงนโยบาย</p>' }}
              />
            </div>
            <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => setShowFullPolicy(false)}
                className="px-6 py-2 border border-slate-300 rounded-lg font-bold text-slate-700 hover:bg-slate-50"
              >
                ปิด
              </button>
              <button
                onClick={() => {
                  handleAccept();
                  setShowFullPolicy(false);
                }}
                className="px-6 py-2 bg-amber-500 text-white rounded-lg font-bold hover:bg-amber-600"
              >
                ยอมรับคุกกี้
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
