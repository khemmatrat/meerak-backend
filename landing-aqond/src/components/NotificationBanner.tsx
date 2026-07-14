/**
 * Web Push Opt-in Banner — AQOND Brand
 * แสดงเฉพาะเมื่อผู้ใช้ยังไม่อนุมัติการแจ้งเตือน
 */
import React from 'react';
import { Bell, X, Loader2 } from 'lucide-react';
import { useNotifications } from '../hooks/useNotifications';

export const NotificationBanner: React.FC = () => {
  const { permission, loading, supported, requestPermission } = useNotifications();
  const [dismissed, setDismissed] = React.useState(false);

  const showBanner =
    supported &&
    permission !== 'granted' &&
    permission !== 'denied' &&
    !dismissed;

  if (!showBanner) return null;

  const handleEnable = async () => {
    const ok = await requestPermission();
    if (ok) setDismissed(true);
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[70] md:left-auto md:right-6 md:max-w-md">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/30 shadow-2xl shadow-indigo-500/20">
        <div className="absolute top-0 right-0 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative p-5">
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center">
              <Bell className="w-6 h-6 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-white text-lg mb-1">
                รับการแจ้งเตือนจาก AQOND
              </h4>
              <p className="text-slate-300 text-sm leading-relaxed mb-4">
                รับข่าวสารโปรโมชั่น โอกาสงานใหม่ และอัปเดตสำคัญ — ไม่พลาดทุกโอกาส
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleEnable}
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition-all shadow-lg shadow-amber-500/20 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Bell size={18} />
                  )}
                  {loading ? 'กำลังตั้งค่า...' : 'เปิดการแจ้งเตือน'}
                </button>
                <button
                  onClick={() => setDismissed(true)}
                  className="px-3 py-2.5 text-slate-400 hover:text-slate-200 text-sm font-medium transition-colors"
                >
                  ไม่ตอนนี้
                </button>
              </div>
            </div>
            <button
              onClick={() => setDismissed(true)}
              className="shrink-0 p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-white/5 transition-colors"
              aria-label="ปิด"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
