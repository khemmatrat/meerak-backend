import React, { useState } from "react";
import { X, Loader2, Zap } from "lucide-react";
import { api } from "../services/api";

interface BookedSlot {
  booking_id: string;
  slot_id: string;
  deposit_amount: number;
  start_time: string;
  end_time: string;
  min_challenge_amount: number;
}

interface ChallengeSubmitModalProps {
  talentId: string;
  slot: BookedSlot;
  onClose: () => void;
  onSuccess: () => void;
}

export const ChallengeSubmitModal: React.FC<ChallengeSubmitModalProps> = ({
  talentId,
  slot,
  onClose,
  onSuccess,
}) => {
  const [amount, setAmount] = useState(String(slot.min_challenge_amount));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const numAmount = parseInt(amount, 10) || 0;
  const isValid = numAmount >= slot.min_challenge_amount;

  const formatSlot = (start: string, end: string) => {
    const d = new Date(start);
    const e = new Date(end);
    return {
      date: d.toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" }),
      time: `${d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} – ${e.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`,
    };
  };

  const handleSubmit = async () => {
    if (!isValid) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/bookings/${slot.booking_id}/challenge`, { amount: numAmount });
      onSuccess();
    } catch (e: any) {
      setError(e?.response?.data?.error || "ส่งคำท้าชิงไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  const slotFmt = formatSlot(slot.start_time, slot.end_time);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-gray-100 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 bg-gradient-to-r from-amber-50 via-white to-emerald-50 border-b border-gray-100">
          <div className="flex justify-between items-start mb-4">
            <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
              <Zap size={22} className="text-amber-500" />
              ท้าชิงคิว
            </h3>
            <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100">
              <X size={20} />
            </button>
          </div>
          <p className="text-sm text-gray-600">
            {slotFmt.date} • {slotFmt.time}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            ราคาเดิม ฿{slot.deposit_amount.toLocaleString()} — ต้องเสนออย่างน้อย ฿{slot.min_challenge_amount.toLocaleString()} (สูงกว่า 20%)
          </p>
        </div>
        <div className="p-6 space-y-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ราคาที่เสนอ (บาท)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={slot.min_challenge_amount}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-emerald-500 text-white font-semibold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <Zap size={20} />
            )}
            ส่งคำท้าชิง
          </button>
        </div>
      </div>
    </div>
  );
};
