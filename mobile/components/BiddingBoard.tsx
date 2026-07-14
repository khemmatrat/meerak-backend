/**
 * AQOND Bidding Board — Battle Board style for Talent's Offer List
 * Shows up to 10 bidders with Profile Pic, Rating, Bid Amount, glowing Accept button
 */
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, User, CheckCircle, Loader2, Zap } from 'lucide-react';
import { bidsService } from '../services/bidsService';
import { joinBiddingRooms, onNewBidReceived, getSocket } from '../services/socketService';
import { useNotification } from '../context/NotificationContext';

interface BiddingBoardProps {
  talentId: string;
  onBidAccepted?: (bookingId: string) => void;
}

interface OfferWithBids {
  offer_id: string;
  title?: string;
  base_price: number;
  offer_date: string;
  bid_id: string;
  bidder_id: string;
  bidder_name: string;
  bidder_avatar?: string;
  bidder_rating?: number;
  amount: number;
  message?: string;
  bid_status: string;
  created_at: string;
}

export const BiddingBoard: React.FC<BiddingBoardProps> = ({ talentId, onBidAccepted }) => {
  const { notify } = useNotification();
  const [offers, setOffers] = useState<OfferWithBids[]>([]);
  const [loading, setLoading] = useState(true);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ bid: OfferWithBids } | null>(null);

  const load = async () => {
    if (!talentId) return;
    setLoading(true);
    try {
      const { data } = await bidsService.getActiveBids(talentId);
      setOffers(data?.offers || []);
    } catch (e: any) {
      notify(e.response?.data?.error || 'โหลดไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [talentId]);

  useEffect(() => {
    if (!talentId) return;
    joinBiddingRooms(talentId);
    onNewBidReceived(() => load());
    return () => {
      getSocket().off('new_bid_received');
    };
  }, [talentId]);

  const handleAcceptClick = (bid: OfferWithBids) => {
    setConfirmModal({ bid });
  };

  const handleConfirmAccept = async () => {
    if (!confirmModal) return;
    const { bid_id } = confirmModal.bid;
    setAcceptingId(bid_id);
    try {
      const { data } = await bidsService.acceptBid(bid_id);
      notify(`✅ เลือก ${confirmModal.bid.bidder_name} สำเร็จ — Escrow ล็อคแล้ว`, 'success');
      setConfirmModal(null);
      setOffers((prev) => prev.filter((o) => o.bid_id !== bid_id));
      onBidAccepted?.(data?.booking_id);
    } catch (e: any) {
      notify(e.response?.data?.error || 'Accept ไม่สำเร็จ', 'error');
    } finally {
      setAcceptingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  if (offers.length === 0) {
    return (
      <div className="text-center py-12 rounded-2xl bg-gray-900/50 border border-amber-500/20">
        <Zap size={48} className="mx-auto mb-3 text-amber-500/60" />
        <p className="text-gray-400">ยังไม่มี Bid ในช่วงนี้</p>
        <p className="text-sm text-gray-500 mt-1">ช่วงเวลารับ Bid: 18:00–20:00</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-gray-100 flex items-center gap-2">
        <Zap size={20} className="text-amber-400" /> Real-time Offer Board
      </h3>
      <div className="grid gap-3">
        <AnimatePresence>
          {offers.map((offer, i) => (
            <motion.div
              key={`${offer.offer_id}-${offer.bid_id}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-between gap-4 p-4 rounded-xl bg-gray-800/80 border border-amber-500/30 hover:border-amber-400/50 transition-all"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-700 flex-shrink-0 ring-2 ring-amber-500/50">
                  {offer.bidder_avatar ? (
                    <img src={offer.bidder_avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <User size={24} className="text-amber-400" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-white truncate">{offer.bidder_name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {offer.bidder_rating != null && (
                      <span className="flex items-center gap-1 text-amber-400 text-sm">
                        <Star size={14} fill="currentColor" /> {Number(offer.bidder_rating).toFixed(1)}
                      </span>
                    )}
                    <span className="text-amber-400 font-bold">{offer.amount.toLocaleString()} THB</span>
                  </div>
                </div>
              </div>
              <a
                href={`/profile/${offer.bidder_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-amber-400 hover:underline shrink-0"
              >
                Profile
              </a>
              <button
                onClick={() => handleAcceptClick(offer)}
                disabled={!!acceptingId}
                className="px-4 py-2 rounded-lg font-bold text-gray-900 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 shadow-lg shadow-amber-500/30 hover:shadow-amber-400/50 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {acceptingId === offer.bid_id ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <CheckCircle size={18} />
                )}
                Accept
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Confirm Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-gray-900 rounded-2xl p-6 max-w-sm w-full border border-amber-500/30"
          >
            <p className="text-gray-200 text-center mb-4">
              คุณเลือก <strong className="text-amber-400">{confirmModal.bid.bidder_name}</strong> สำหรับ{' '}
              <strong>{confirmModal.bid.amount.toLocaleString()} THB</strong>
            </p>
            <p className="text-sm text-gray-400 text-center mb-6">ยืนยันการ Match?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmModal(null)}
                className="flex-1 py-2.5 rounded-xl bg-gray-700 text-gray-300 hover:bg-gray-600"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleConfirmAccept}
                disabled={!!acceptingId}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 text-gray-900 font-bold hover:bg-amber-400 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {acceptingId ? <Loader2 size={18} className="animate-spin" /> : null}
                Confirm Match
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
