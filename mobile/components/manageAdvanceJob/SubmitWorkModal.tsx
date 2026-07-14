import React from "react";
import { Upload, Send, Loader2 } from "lucide-react";

export function SubmitWorkModal({
  submitWorkUrl,
  setSubmitWorkUrl,
  submitWorkLinks,
  setSubmitWorkLinks,
  submitting,
  onSubmit,
  onClose,
}: {
  submitWorkUrl: string;
  setSubmitWorkUrl: (v: string) => void;
  submitWorkLinks: Array<{ url: string; label: string }>;
  setSubmitWorkLinks: React.Dispatch<
    React.SetStateAction<Array<{ url: string; label: string }>>
  >;
  submitting: boolean;
  onSubmit: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-charcoal-800 rounded-2xl border border-slate-600 shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-slate-100 mb-4 flex items-center gap-2">
          <Upload size={20} />
          ส่งงาน (Submit Final Work)
        </h3>
        <p className="text-sm text-slate-400 mb-4">
          แชร์ลิงก์งาน เช่น Google Drive, Figma, หรือ URL ตรง
        </p>
        <div className="space-y-4 mb-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              URL หลัก (หรือใช้ลิงก์เพิ่มเติมด้านล่าง)
            </label>
            <input
              type="url"
              value={submitWorkUrl}
              onChange={(e) => setSubmitWorkUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-4 py-3 rounded-xl bg-charcoal-900 border border-slate-600 text-slate-100"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              ลิงก์เพิ่มเติม (ถ้ามี)
            </label>
            {submitWorkLinks.map((link, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input
                  type="url"
                  value={link.url}
                  onChange={(e) =>
                    setSubmitWorkLinks((prev) =>
                      prev.map((p, j) => (j === i ? { ...p, url: e.target.value } : p)),
                    )
                  }
                  placeholder="https://..."
                  className="flex-1 px-4 py-2 rounded-lg bg-charcoal-900 border border-slate-600 text-slate-100"
                />
                <input
                  type="text"
                  value={link.label}
                  onChange={(e) =>
                    setSubmitWorkLinks((prev) =>
                      prev.map((p, j) => (j === i ? { ...p, label: e.target.value } : p)),
                    )
                  }
                  placeholder="ชื่อ"
                  className="w-24 px-3 py-2 rounded-lg bg-charcoal-900 border border-slate-600 text-slate-100"
                />
                {submitWorkLinks.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setSubmitWorkLinks((prev) => prev.filter((_, j) => j !== i))
                    }
                    className="p-2 text-red-400 hover:bg-red-500/20 rounded"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setSubmitWorkLinks((prev) => [...prev, { url: "", label: "" }])
              }
              className="text-sm text-amber-400 hover:underline"
            >
              + เพิ่มลิงก์
            </button>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-xl bg-slate-600 text-slate-100"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className="flex-1 py-2 rounded-xl bg-amber-500 text-charcoal-900 font-bold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Send size={18} />
            )}
            ส่งงาน
          </button>
        </div>
      </div>
    </div>
  );
}
