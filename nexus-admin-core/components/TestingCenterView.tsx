import React, { useState, useEffect } from "react";
import { Volume2, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { getAdminToken, sendTestNotification } from "../services/adminApi";
import type { AdminUser } from "../types";

interface TestingCenterViewProps {
  currentUser: AdminUser;
}

export const TestingCenterView: React.FC<TestingCenterViewProps> = ({
  currentUser,
}) => {
  const [userId, setUserId] = useState(currentUser.id);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const useBackend = !!getAdminToken();

  useEffect(() => {
    setUserId(currentUser.id);
  }, [currentUser.id]);

  const handleSend = async () => {
    setError(null);
    setMessage(null);
    if (!userId.trim()) {
      setError("กรุณาระบุ userId");
      return;
    }
    if (!useBackend) {
      setError("ต้อง Login ด้วย Backend (JWT) เพื่อส่ง Push จริง");
      return;
    }
    setLoading(true);
    try {
      const res = await sendTestNotification({ userId: userId.trim() });
      console.log(
        `Sent test push to ${res.userId} with sound: aqond_notification`
      );
      setMessage(
        `ส่งแล้ว — success: ${res.fcm?.success ?? 0}, failed: ${res.fcm?.failed ?? 0} (user: ${res.userId})`
      );
    } catch (e: unknown) {
      const err = e as Error;
      setError(err?.message || "ส่งไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-xl">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2.5 bg-violet-100 rounded-xl text-violet-700">
          <Volume2 size={24} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Testing Center</h1>
          <p className="text-sm text-slate-500">
            ทดสอบเสียงแจ้งเตือน Aqond (channel + FCM) บนเครื่องที่ลงทะเบียน token
          </p>
        </div>
      </div>

      <div className="mt-6 bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            User ID (UUID)
          </label>
          <input
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none font-mono text-sm"
            placeholder="uuid ของบัญชีที่ลงแอปมือถือ"
          />
          <p className="text-xs text-slate-500 mt-1">
            ค่าเริ่มต้นคือบัญชีแอดมินที่ล็อกอิน — แก้ได้ถ้าจะส่งหา user อื่น
          </p>
        </div>

        <button
          type="button"
          onClick={handleSend}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-semibold rounded-lg transition-colors"
        >
          {loading ? (
            <Loader2 size={20} className="animate-spin" />
          ) : (
            <Volume2 size={20} />
          )}
          ส่ง Push ทดสอบเสียง
        </button>

        {message && (
          <div className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm">
            <CheckCircle size={18} className="shrink-0 mt-0.5" />
            <span>{message}</span>
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-sm">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="text-xs text-slate-500 space-y-1 border-t border-slate-100 pt-4">
          <p>
            <strong>Payload:</strong> channel{" "}
            <code className="bg-slate-100 px-1 rounded">aqond_intercity_jobs</code>
            , sound{" "}
            <code className="bg-slate-100 px-1 rounded">aqond_notification</code>
          </p>
          <p>
            ถ้าได้ 404 — ตรวจสอบว่า user นี้มีแถวใน{" "}
            <code className="bg-slate-100 px-1">fcm_tokens</code> จากแอปมือถือ
          </p>
        </div>
      </div>
    </div>
  );
};
