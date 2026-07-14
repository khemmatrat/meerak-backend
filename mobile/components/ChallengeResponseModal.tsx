import React, { useEffect, useState } from "react";
import { X, Loader2, Wallet, Gift } from "lucide-react";
import { api } from "../services/api";

interface Challenge {
  id: string;
  challenger_name: string | null;
  original_amount: number;
  challenge_amount: number;
}

interface ChallengeResponseModalProps {
  bookingId: string;
  challenges: Challenge[];
  onClose: () => void;
  onResponded: () => void;
}

export const ChallengeResponseModal: React.FC<ChallengeResponseModalProps> = ({
  bookingId,
  challenges,
  onClose,
  onResponded,
}) => {
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleResponse = async (challengeId: string, action: "match" | "compensate") => {
    setActingId(challengeId);
    setError(null);
    try {
      await api.post(`/bookings/${bookingId}/challenge-response`, {
        challenge_id: challengeId,
        action,
      });
      onResponded();
    } catch (e: any) {
      setError(e?.response?.data?.error || "ดำเนินการไม่สำเร็จ");
    } finally {
      setActingId(null);
    }
  };

  const c = challenges[0];
  if (!c) return null;

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
            <h3 className="font-bold text-gray-900 text-lg">มีผู้ท้าชิงคิว</h3>
            <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100">
              <X size={20} />
            </button>
          </div>
          <p className="text-sm text-gray-600 mb-2">
            {c.challenger_name || "ผู้ใช้"} เสนอราคา <span className="font-bold text-amber-600">฿{c.challenge_amount.toLocaleString()}</span> (เดิม ฿{c.original_amount.toLocaleString()})
          </p>
          <p className="text-xs text-gray-500">
            เลือก Match ราคาเพื่อรักษาสิทธิ์ หรือรับค่าชดเชย 30% ของส่วนต่าง
          </p>
        </div>
        <div className="p-6 space-y-3">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}
          <button
            onClick={() => handleResponse(c.id, "match")}
            disabled={actingId === c.id}
            className="w-full py-3 rounded-xl bg-emerald-500 text-white font-semibold flex items-center justify-center gap-2 hover:bg-emerald-600 disabled:opacity-50"
          >
            {actingId === c.id ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <Wallet size={20} />
            )}
            Match ราคา (฿{c.challenge_amount.toLocaleString()}) — รักษาสิทธิ์
          </button>
          <button
            onClick={() => handleResponse(c.id, "compensate")}
            disabled={actingId === c.id}
            className="w-full py-3 rounded-xl border-2 border-amber-400 text-amber-700 font-semibold flex items-center justify-center gap-2 hover:bg-amber-50 disabled:opacity-50"
          >
            <Gift size={20} />
            รับค่าชดเชย 30% — สละสิทธิ์
          </button>
        </div>
      </div>
    </div>
  );
};
