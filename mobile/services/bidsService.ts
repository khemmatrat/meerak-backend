/**
 * AQOND Bidding Service — API for Talent Offers & Bids
 */
import { api } from './api';

export interface TalentOffer {
  id: string;
  title?: string;
  base_price: number;
  offer_date: string;
  slot_id?: string | null;
  bid_window_start?: string;
  bid_window_end?: string;
  max_bidders?: number;
  status?: string;
  bid_count?: number;
  pending_bids?: number;
}

export interface Bid {
  bid_id: string;
  offer_id: string;
  bidder_id: string;
  bidder_name: string;
  bidder_avatar?: string;
  bidder_rating?: number;
  amount: number;
  message?: string;
  bid_status: string;
  created_at: string;
}

export const bidsService = {
  /** Get open offers for a talent (public, for clients to bid) */
  getOpenOffers: (talentId: string) =>
    api.get<{ offers: TalentOffer[] }>(`/bids/offers/open/${talentId}`),

  /** Get talent's offers (Provider dashboard) */
  getMyOffers: (talentId: string) =>
    api.get<{ offers: TalentOffer[] }>(`/bids/offers/${talentId}`),

  /** Get active bids for talent's offers (Provider dashboard) */
  getActiveBids: (talentId: string) =>
    api.get<{ offers: Array<TalentOffer & { bid_id: string; bidder_name: string; bidder_avatar?: string; bidder_rating?: number; amount: number; message?: string; bid_status: string; created_at: string }> }>(`/bids/active/${talentId}`),

  /** Client places bid */
  placeBid: (offerId: string, amount: number, message?: string) =>
    api.post<{ success: boolean; bid: { id: string; amount: number; status: string } }>('/bids/place', {
      offer_id: offerId,
      amount,
      message,
    }),

  /** Talent accepts a bid */
  acceptBid: (bidId: string) =>
    api.post<{ success: boolean; message: string; booking_id: string }>(`/bids/accept/${bidId}`),

  /** Talent creates offer */
  createOffer: (data: { title?: string; base_price: number; offer_date?: string; slot_id?: string; bid_window_start?: string; bid_window_end?: string }) =>
    api.post<{ success: boolean; offer: TalentOffer }>('/bids/offers', data),
};
