import React, { useState } from "react";
import { Link } from "react-router-dom";
import { MockApi } from "../services/mockApi";
import { useLanguage } from "../context/LanguageContext";
import { Lock, Smartphone, ArrowLeft, CheckCircle } from "lucide-react";

export const ForgotPassword: React.FC = () => {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useLanguage();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!phone.trim()) {
      setError("กรุณากรอกเบอร์โทรศัพท์ที่สมัครสมาชิก");
      return;
    }
    setLoading(true);
    try {
      await MockApi.requestPasswordReset(phone.trim());
      setSent(true);
    } catch (err: any) {
      setError(err.message || "ไม่สามารถส่งลิงก์รีเซ็ตรหัสผ่านได้");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-amber-500 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Lock className="text-white" size={24} />
          </div>
          <h1 className="text-xl font-bold text-gray-900">ลืมรหัสผ่าน</h1>
          <p className="text-sm text-gray-500 mt-1">
            กรอกเบอร์โทรที่ใช้สมัครสมาชิก เราจะส่งวิธีรีเซ็ตรหัสผ่านให้คุณ
          </p>
        </div>

        {sent ? (
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
              <CheckCircle className="text-emerald-600 shrink-0 mt-0.5" size={20} />
              <div className="text-sm text-emerald-800">
                <p className="font-medium">ส่งข้อมูลแล้ว</p>
                <p className="mt-1">
                  หากมีบัญชีผูกกับเบอร์นี้ คุณจะได้รับข้อความหรืออีเมลแนะนำวิธีรีเซ็ตรหัสผ่าน
                  กรุณาตรวจสอบกล่องข้อความและอีเมล
                </p>
              </div>
            </div>
            <Link
              to="/login"
              className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors text-sm font-medium"
            >
              <ArrowLeft size={18} /> กลับไปหน้าเข้าสู่ระบบ
            </Link>
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm border border-red-100">
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Smartphone size={14} className="inline mr-1" />
                  เบอร์โทรศัพท์
                </label>
                <input
                  type="tel"
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  placeholder="08xxxxxxxx"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? "กำลังส่ง..." : "ส่งลิงก์รีเซ็ตรหัสผ่าน"}
              </button>
            </form>
            <p className="mt-4 text-center text-sm text-gray-500">
              <Link to="/login" className="text-amber-600 hover:underline inline-flex items-center gap-1">
                <ArrowLeft size={14} /> กลับไปเข้าสู่ระบบ
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
};
