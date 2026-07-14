import React, { useState } from "react";
import { X, UserPlus, Loader2, AlertCircle } from "lucide-react";

interface AddTraineeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (traineeKey: string) => Promise<void>;
  myKey?: string;
}

export const AddTraineeModal: React.FC<AddTraineeModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  myKey,
}) => {
  const [traineeKey, setTraineeKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const key = traineeKey.trim().toUpperCase();
    if (!key) {
      setError("กรุณากรอกรหัสศิษย์");
      return;
    }
    if (myKey && key === myKey) {
      setError("ไม่สามารถเพิ่มตัวเองเป็นศิษย์ได้");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(key);
      setTraineeKey("");
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "ไม่สามารถเพิ่มศิษย์ได้");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-emerald-50">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <UserPlus size={20} className="text-emerald-600" />
            เพิ่มศิษย์
          </h3>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-white/80"
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              รหัสศิษย์ (8 หลัก)
            </label>
            <input
              type="text"
              value={traineeKey}
              onChange={(e) => {
                setTraineeKey(e.target.value.toUpperCase().replace(/\s/g, ""));
                setError(null);
              }}
              placeholder="กรอกรหัส เช่น ABCD1234"
              className="w-full px-4 py-3 border border-slate-300 rounded-xl font-mono text-lg tracking-widest focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
              maxLength={20}
              autoFocus
              disabled={submitting}
            />
            <p className="text-xs text-slate-500 mt-1">
              ศิษย์จะให้รหัสนี้กับคุณจากหน้า Connection ของเขา
            </p>
          </div>
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-lg text-red-700 text-sm">
              <AlertCircle size={18} />
              {error}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-slate-300 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 transition-colors"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={submitting || !traineeKey.trim()}
              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  กำลังเพิ่ม...
                </>
              ) : (
                <>
                  <UserPlus size={18} />
                  เพิ่มศิษย์
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
