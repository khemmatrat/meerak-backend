import { api } from "./api";

export type GoldLottoCampaign = {
  id: string;
  title: string;
  status: string;
  period_start: string;
  period_end: string;
  draw_at: string;
  ticket_count_employer: number;
  ticket_count_provider: number;
  frozen_at?: string | null;
  drawn_at?: string | null;
  published_at?: string | null;
};

export type GoldLottoConfig = {
  enabled: boolean;
  campaign_id: string;
  title: string;
  draw_at: string;
  public_results_enabled?: boolean;
};

export type GoldLottoWinnerPublic = {
  id: string;
  pool_side: string;
  prize_rank: number;
  prize_name: string;
  winning_display_code?: string;
  winner_name?: string;
  winning_job?: Record<string, unknown>;
  published_at?: string;
};

export type GoldLottoPrizeWin = {
  id: string;
  campaign_id: string;
  pool_side: string;
  prize_rank: number;
  prize_name: string;
  winning_display_code?: string;
  delivery_status: string;
  delivery_address_json?: Record<string, unknown> | null;
  delivery_consent_at?: string | null;
  delivery_delivered_at?: string | null;
  delivery_confirmed_at?: string | null;
  published_at?: string | null;
  kyc_status?: string | null;
};

export async function fetchGoldLottoCampaign() {
  const { data } = await api.get<{
    ok: boolean;
    enabled: boolean;
    config?: GoldLottoConfig;
    campaign?: GoldLottoCampaign | null;
  }>("/gold-lotto/campaign");
  return data;
}

export async function fetchGoldLottoWinners() {
  const { data } = await api.get<{
    ok: boolean;
    winners: GoldLottoWinnerPublic[];
  }>("/gold-lotto/winners");
  return data.winners || [];
}

export async function fetchGoldLottoMe() {
  const { data } = await api.get<{
    ok: boolean;
    employer: number;
    provider: number;
    total: number;
    wins: unknown[];
  }>("/gold-lotto/me");
  return data;
}

export async function fetchGoldLottoMyPrize() {
  const { data } = await api.get<{ ok: boolean; wins: GoldLottoPrizeWin[] }>(
    "/gold-lotto/my-prize",
  );
  return data.wins || [];
}

export async function submitGoldLottoDelivery(body: {
  winnerId: string;
  recipient_name: string;
  phone: string;
  address_line: string;
  subdistrict?: string;
  district?: string;
  province: string;
  postal_code?: string;
  consent: boolean;
}) {
  const { data } = await api.post<{ ok: boolean; winner: GoldLottoPrizeWin }>(
    "/gold-lotto/my-prize/delivery",
    body,
  );
  return data.winner;
}

export async function confirmGoldLottoReceipt(winnerId: string) {
  const { data } = await api.post<{ ok: boolean; winner: GoldLottoPrizeWin }>(
    "/gold-lotto/my-prize/confirm-receipt",
    { winnerId },
  );
  return data.winner;
}

export async function fetchGoldLottoLive(campaignId: string) {
  const { data } = await api.get<{
    ok: boolean;
    winners: GoldLottoWinnerPublic[];
    draw_runs: Record<string, unknown>[];
  }>(`/gold-lotto/draw/${encodeURIComponent(campaignId)}/live`);
  return data;
}
