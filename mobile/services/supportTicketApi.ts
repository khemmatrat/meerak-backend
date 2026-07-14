/**
 * Support tickets — ฝั่งผู้ใช้ (เดียวกับที่ nexus-admin-core ดูผ่าน /api/admin/support/...)
 */
import { api } from "./api";

export type SupportTicketApiSender = "USER" | "ADMIN" | "BOT" | "PROVIDER";

export interface SupportTicketApiMessage {
  id: string;
  ticketId: string;
  sender: SupportTicketApiSender | string;
  message: string;
  timestamp: string;
  source?: string;
  faqScore?: number | null;
  ai_actions?: string[];
  quick_actions?: SupportQuickAction[];
  diagnostic_summary?: string | null;
  escalation?: { level?: string; reason?: string } | null;
  feedback?: { helpful: boolean; reason?: string | null; at?: string };
  care_timeline?: SupportCareTimelineEvent[];
  situation_cards?: SupportSituationCard[];
  reroute_sla?: SupportRerouteSla | null;
}

export interface SupportCareTimelineEvent {
  id: string;
  stage: string;
  label: string;
  status?: string;
  detail?: string | null;
  candidate_count?: number | null;
  provider_id?: string | null;
  provider_name?: string | null;
  action?: string | null;
  at: string;
}

export interface SupportSituationCard {
  id: string;
  title: string;
  description: string;
  action_type: string;
  recommended?: boolean;
  reason?: string;
}

export interface SupportRerouteSla {
  status?: string;
  stage?: string;
  started_at?: string;
  updated_at?: string;
  job_id?: string;
  candidate_count?: number;
  invited_count?: number;
  accept_window_ms?: number;
  accept_deadline_at?: string | null;
  active_invitation_id?: string;
  confirmed_provider_id?: string;
  confirmed_at?: string;
}

export interface SupportQuickAction {
  id: string;
  label: string;
  type:
    | "self_unlock_rate_limit"
    | "refresh_session"
    | "check_account_status"
    | "retry_guidance"
    | "feedback_not_helpful"
    | "open_ticket"
    | "open_job_detail";
  url?: string;
}

export function getUserSupportMessages(
  ticketId: string,
): Promise<SupportTicketApiMessage[]> {
  return api
    .get<{
      messages: SupportTicketApiMessage[];
    }>(`/support/tickets/${encodeURIComponent(ticketId)}/messages`)
    .then((r) => r.data?.messages || []);
}

export function postUserSupportMessage(
  ticketId: string,
  message: string,
): Promise<void> {
  return api
    .post(`/support/tickets/${encodeURIComponent(ticketId)}/messages`, {
      message,
    })
    .then(() => undefined);
}

export function postSupportAiBridgeReply(
  ticketId: string,
  message: string,
  meta: {
    source?: string;
    score?: number | null;
    ai_actions?: string[];
    quick_actions?: SupportQuickAction[];
    diagnostic_summary?: string | null;
    escalation?: { level?: string; reason?: string } | null;
    job_id?: string | null;
  } = {},
): Promise<void> {
  return api
    .post(`/support/tickets/${encodeURIComponent(ticketId)}/ai-replies`, {
      message,
      source: meta.source || "support_ai_bridge",
      score: meta.score ?? null,
      ai_actions: meta.ai_actions || [],
      quick_actions: meta.quick_actions || [],
      diagnostic_summary: meta.diagnostic_summary || null,
      escalation: meta.escalation || null,
      job_id: meta.job_id || null,
    })
    .then(() => undefined);
}

export function startSupportCareReroute(
  ticketId: string,
  body: { job_id?: string | null } = {},
): Promise<{
  ok: boolean;
  candidate_count?: number;
  candidates?: Array<{ id: string; full_name?: string; worker_grade?: string }>;
  invitation?: {
    id: string;
    status: string;
    expires_at?: string | null;
    accept_window_ms?: number;
  } | null;
}> {
  return api
    .post(`/support/tickets/${encodeURIComponent(ticketId)}/care-reroute`, body)
    .then((r) => r.data);
}

export function postSupportAiFeedback(
  ticketId: string,
  body: { message_id?: string; helpful: boolean; reason?: string },
): Promise<{ ok: boolean; escalated: boolean }> {
  return api
    .post(`/support/tickets/${encodeURIComponent(ticketId)}/feedback`, body)
    .then((r) => r.data);
}

export function selfUnlockRateLimit(): Promise<{
  ok: boolean;
  message: string;
  unlock?: {
    self_unlocks_remaining_today: number;
    self_unlock_daily_limit: number;
    expires_at: string | null;
  };
}> {
  return api.post("/rate-limit/self-unlock").then((r) => r.data);
}

/** แปลงข้อความจาก API เป็นรูปแบบที่ UI แชทเจ้าหน้าที่ใช้ */
export function mapSupportMessagesToStaffUi(
  rows: SupportTicketApiMessage[],
): Array<{
  id: string;
  text: string;
  isMe: boolean;
  timestamp: number;
  variant?: "system";
  quickActions?: SupportQuickAction[];
  diagnosticSummary?: string | null;
  aiActions?: string[];
  source?: string;
  careTimeline?: SupportCareTimelineEvent[];
  situationCards?: SupportSituationCard[];
  rerouteSla?: SupportRerouteSla | null;
}> {
  return rows.map((m) => {
    const ts = new Date(m.timestamp).getTime();
    return {
      id: m.id,
      text: m.message,
      isMe: m.sender === "USER",
      timestamp: Number.isFinite(ts) ? ts : Date.now(),
      quickActions: m.quick_actions || [],
      diagnosticSummary: m.diagnostic_summary || null,
      aiActions: m.ai_actions || [],
      source: m.source,
      careTimeline: m.care_timeline || [],
      situationCards: m.situation_cards || [],
      rerouteSla: m.reroute_sla || null,
    };
  });
}

export async function createUserSupportTicket(body: {
  userId?: string;
  subject: string;
  message: string;
  category?: string;
  email?: string | null;
  full_name?: string | null;
  phone?: string | null;
  jobId?: string | null;
  is_emergency?: boolean;
  emergency_kind?: string | null;
}): Promise<{ ticket: { id: string }; message?: SupportTicketApiMessage }> {
  const { data } = await api.post("/support/tickets", body);
  return data;
}
