import React, { useState } from "react";
import { X, Loader2, Camera, Shield } from "lucide-react";
import { api } from "../services/api";

interface CheckInScanModalProps {
  bookingId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const CheckInScanModal: React.FC<CheckInScanModalProps> = ({
  bookingId,
  onClose,
  onSuccess,
}) => {
  const [payload, setPayload] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const p = payload.trim();
    if (!p) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/bookings/${bookingId}/check-in`, { qr_payload: p });
      onSuccess();
    } catch (e: any) {
      setError(e?.response?.data?.error || "Check-in ไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 flex justify-between items-center border-b bg-gradient-to-r from-emerald-50 to-amber-50">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <Camera size={20} className="text-emerald-600" />
            สแกน QR เพื่อเริ่มงาน
          </h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>
        <div className="p-6">
          <p className="text-sm text-gray-600 mb-4">
            สแกน QR จากมือถือของ Talent หรือวางรหัสที่ได้จาก QR ด้านล่าง
          </p>
          <textarea
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            placeholder="วางรหัส QR ที่สแกนได้..."
            className="w-full h-24 px-4 py-3 rounded-xl border border-gray-200 text-sm font-mono resize-none"
          />
          {error && (
            <p className="text-sm text-red-600 mt-2">{error}</p>
          )}
          <button
            onClick={handleSubmit}
            disabled={!payload.trim() || submitting}
            className="w-full mt-4 py-3 rounded-xl bg-emerald-500 text-white font-semibold flex items-center justify-center gap-2 hover:bg-emerald-600 disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <Shield size={20} />
            )}
            เริ่มงาน
          </button>
        </div>
      </div>
    </div>
  );
};
