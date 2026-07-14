import axios from "axios";
import { getBackendBase } from "./api";
import type { SupportQuickAction } from "./supportTicketApi";

function resolveSupportAiBase(): string {
  const env =
    (typeof import.meta !== "undefined" &&
      (import.meta as any).env?.VITE_SUPPORT_AI_URL) ||
    "";
  const trimmed = typeof env === "string" ? env.trim() : "";
  if (trimmed) return trimmed.replace(/\/$/, "");

  const backend = getBackendBase().replace(/\/$/, "");
  if (backend.includes("localhost") || backend.includes("127.0.0.1")) {
    return "http://localhost:3091";
  }
  return "https://support.aqond.com";
}

export interface SupportAiChatResponse {
  session_id: string;
  message: string;
  actions?: string[];
  source?: string | null;
  score?: number | null;
  quick_actions?: SupportQuickAction[];
  diagnostic_summary?: string | null;
  escalation?: { level?: string; reason?: string } | null;
  knowledge_question?: string | null;
  knowledge_category?: string | null;
  feature_request_created?: boolean;
  case_id?: string | null;
  blocked?: boolean;
  trace_id?: string;
}

export async function sendSupportAiMessage(body: {
  message: string;
  session_id?: string | null;
  ticket_id?: string | null;
  job_id?: string | null;
  source?: "settings" | "job_details" | "support_ticket";
}): Promise<SupportAiChatResponse> {
  const token =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("meerak_token")
      : null;
  if (!token) throw new Error("กรุณาเข้าสู่ระบบก่อนใช้ AI Support");

  const { data } = await axios.post<SupportAiChatResponse>(
    `${resolveSupportAiBase()}/support/chat`,
    body,
    {
      timeout: 45000,
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  return data;
}
