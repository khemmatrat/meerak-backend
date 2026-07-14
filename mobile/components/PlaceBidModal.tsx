/**
 * AQOND Place Bid Modal — Client places bid on Talent's offer
 */
import React, { useState } from 'react';
import { X, Loader2, Wallet } from 'lucide-react';
import { bidsService, TalentOffer } from '../services/bidsService';
import { useNotification } from '../context/NotificationContext';

interface PlaceBidModalProps {
  offer: TalentOffer;
  talentId: string;
  walletBalance: number;
  onSuccess?: () => void;
  onClose: () => void;
}

export const PlaceBidModal: React.FC<PlaceBidModalProps> = ({
  offer,
  talentId,
  walletBalance,
  onSuccess,
  onClose,
}) => {
  const { notify } = useNotification();
  const [amount, setAmount] = useState(String(offer.base_price || 0));
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const bidAmount = Number(amount) || 0;
  const isValid = bidAmount >= offer.base_price && bidAmount <= walletBalance;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || submitting) return;
    setSubmitting(true);
    try {
      await bidsService.placeBid(offer.id, bidAmount, message || undefined);
      notify(`✅ ส่ง Bid ${bidAmount.toLocaleString()} THB สำเร็จ`, 'success');
      onSuccess?.();
      onClose();
    } catch (e: any) {
      const data = e.response?.data;
      const msg = data?.error || e.message || 'ส่ง Bid ไม่สำเร็จ';
      const retrySec = data?.retry_after;
      notify(retrySec ? `${msg} (ลองใหม่ใน ${retrySec} วินาที)` : msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-md w-full p-6 border border-amber-500/30">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Place Bid</h3>
          <button onClick={onClose} className="p-2 text-gray-500 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-2">{offer.title || 'Offer'}</p>
        <p className="text-amber-500 font-bold mb-4">Base: {offer.base_price.toLocaleString()} THB</p>

        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 mb-4 flex items-center gap-2">
          <Wallet size={18} className="text-amber-600" />
          <span className="text-sm">Wallet: {walletBalance.toLocaleString()} THB</span>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Amount (THB)</label>
          <input
            type="number"
            min={offer.base_price}
            step="10"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full p-3 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white mb-4"
          />
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Message (optional)</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="ข้อความถึง Talent..."
            rows={2}
            className="w-full p-3 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white mb-4"
          />
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={!isValid || submitting}
              className="flex-1 py-3 rounded-xl bg-amber-500 text-gray-900 font-bold hover:bg-amber-400 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 size={18} className="animate-spin" /> : null}
              Place Bid
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
