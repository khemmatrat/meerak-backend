import React, { useState, useCallback } from "react";
import { Mail, Loader2, Send, Eye } from "lucide-react";
import { postAdminEmailBroadcast } from "../services/adminApi";

/**
 * Super Admin — ส่งอีเมลถึงผู้ใช้จากอีเมลที่บันทึกใน users (email หรือ contact_email)
 * ต้องตั้ง SMTP ใน backend (SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM)
 */
export const EmailBroadcastView: React.FC = () => {
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState<"preview" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    recipient_count: number;
    max_recipients: number;
    sample: string[];
  } | null>(null);
  const [result, setResult] = useState<{
    sent: number;
    recipient_count: number;
    failed: number;
  } | null>(null);

  const runPreview = useCallback(async () => {
    setError(null);
    setResult(null);
    setLoading("preview");
    try {
      const r = await postAdminEmailBroadcast({
        subject: subject.trim() || "(ไม่มีหัวข้อ)",
        text: text.trim() || "(ว่าง)",
        preview: true,
      });
      setPreview({
        recipient_count: r.recipient_count ?? 0,
        max_recipients: r.max_recipients ?? 0,
        sample: r.sample || [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
      setPreview(null);
    } finally {
      setLoading(null);
    }
  }, [subject, text]);

  const runSend = useCallback(async () => {
    if (!confirm("ยืนยันส่งอีเมลถึงผู้ใช้ทุกคนที่มีอีเมลในระบบ (จำกัดจำนวนต่อรอบตามเซิร์ฟเวอร์)?")) return;
    setError(null);
    setResult(null);
    setLoading("send");
    try {
      const r = await postAdminEmailBroadcast({
        subject: subject.trim(),
        text: text.trim(),
        preview: false,
      });
      setResult({
        sent: r.sent ?? 0,
        recipient_count: r.recipient_count ?? 0,
        failed: r.failed ?? 0,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setLoading(null);
    }
  }, [subject, text]);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-indigo-100 rounded-xl">
          <Mail className="text-indigo-700" size={28} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-600">Email ถึงผู้ใช้</h1>
          <p className="text-sm text-slate-500">
            ดึงอีเมลจากฐานข้อมูล (ใช้ contact_email ถ้ามี ไม่เช่นนั้นใช้ email บัญชี) — เฉพาะ Super Admin
          </p>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
        ต้องตั้งค่า SMTP บนเซิร์ฟเวอร์ (เช่น SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM) และจำกัดจำนวนต่อครั้งด้วย{" "}
        <code className="bg-amber-100 px-1 rounded">EMAIL_BROADCAST_MAX</code> (ค่าเริ่มต้น 100)
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-sm">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">หัวข้อ (Subject)</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="เช่น อัปเดตจาก AQOND"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">ข้อความ (Plain text)</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
            placeholder="เนื้อหาอีเมล..."
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={loading !== null}
            onClick={runPreview}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-800 rounded-lg text-sm font-semibold hover:bg-slate-200 disabled:opacity-50"
          >
            {loading === "preview" ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}
            ดูจำนวนผู้รับ (ตัวอย่าง)
          </button>
          <button
            type="button"
            disabled={loading !== null || !subject.trim() || !text.trim()}
            onClick={runSend}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading === "send" ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            ส่งอีเมล
          </button>
        </div>
      </div>

      {preview && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 text-sm">
          <p className="font-semibold text-slate-700">
            ผู้รับโดยประมาณ: {preview.recipient_count} (สูงสุดต่อรอบ {preview.max_recipients})
          </p>
          {preview.sample.length > 0 && (
            <p className="text-slate-600 mt-2">
              ตัวอย่าง: {preview.sample.join(", ")}
            </p>
          )}
        </div>
      )}

      {result && (
        <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4 text-sm text-emerald-900">
          ส่งสำเร็จ {result.sent} / {result.recipient_count} รายการ
          {result.failed > 0 && ` (ล้มเหลว ${result.failed} รายการ — ดู log เซิร์ฟเวอร์)`}
        </div>
      )}
    </div>
  );
};
