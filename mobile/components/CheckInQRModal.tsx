import React, { useEffect, useState } from "react";
import { X, Loader2, Shield } from "lucide-react";
import { api } from "../services/api";

interface CheckInQRModalProps {
  bookingId: string;
  onClose: () => void;
}

export const CheckInQRModal: React.FC<CheckInQRModalProps> = ({
  bookingId,
  onClose,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ qr_data_url?: string; qr_payload?: string; error?: string }>(
        `/bookings/${bookingId}/check-in-qr`
      )
      .then((res) => {
        setQrDataUrl(res.data?.qr_data_url || null);
        if (res.data?.error) setError(res.data.error);
      })
      .catch((e: any) => {
        setError(e?.response?.data?.error || "โหลด QR ไม่สำเร็จ");
      })
      .finally(() => setLoading(false));
  }, [bookingId]);

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
            <Shield size={20} className="text-emerald-600" />
            เริ่มงาน (Check-in)
          </h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>
        <div className="p-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 size={32} className="animate-spin text-emerald-500" />
            </div>
          ) : error ? (
            <p className="text-center text-red-600 py-6">{error}</p>
          ) : qrDataUrl ? (
            <>
              <p className="text-sm text-gray-600 text-center mb-4">
                ให้นายจ้างสแกน QR นี้เพื่อเริ่มงานอย่างเป็นทางการ
              </p>
              <div className="flex justify-center">
                <img
                  src={qrDataUrl}
                  alt="QR Check-in"
                  className="w-64 h-64 rounded-xl border-2 border-emerald-200"
                />
              </div>
              <p className="text-xs text-amber-600 text-center mt-4">
                QR ใช้ได้ 5 นาที — หมดอายุแล้วขอใหม่ได้
              </p>
            </>
          ) : (
            <p className="text-center text-gray-500 py-6">ไม่สามารถสร้าง QR ได้</p>
          )}
        </div>
      </div>
    </div>
  );
};
