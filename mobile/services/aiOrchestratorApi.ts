import axios from "axios";
import { getBackendBase } from "./api";

export type AIChatResponse = {
  success?: boolean;
  message: string;
  intent: string;
  entities?: unknown[];
  agentUsed: "qwen" | "hermes" | "hermes+qwen" | string;
  actions?: Array<{
    type: string;
    data: Record<string, unknown>;
  }>;
  payload?: {
    type: "product_card" | "job_card" | "course_card" | "text" | string;
    data: unknown;
  };
  metadata?: {
    processingTime?: number;
    modelsUsed?: string[];
    fallbackUsed?: boolean;
  };
};

export type OrchestratorHistoryItem = {
  role: "user" | "ai";
  text: string;
};

export type ConsentSummaryRow = {
  label: string;
  value: string;
  sensitive?: boolean;
};

export type HermesConsentCard = {
  proposalId: string;
  toolId: string;
  zone: string;
  title: string;
  summary: ConsentSummaryRow[];
  warning: string;
  confirmLabel: string;
  cancelLabel: string;
  expiresAt: string;
};

export type HermesToolConfirmResult = {
  success: boolean;
  ok?: boolean;
  decision?: "approved" | "rejected" | string;
  message?: string;
  open_path?: string | null;
  mode?: string;
  progress?: {
    zone?: string;
    nextAction?: {
      id?: string;
      label?: string;
      href?: string;
      minutes?: number;
    };
    progress?: { completed: number; total: number };
    allDone?: boolean;
  } | null;
  error?: string;
};

/** Confirm (approve) or cancel (reject) a Hermes tool proposal. Both are audited server-side. */
export async function confirmHermesTool(
  proposalId: string,
  decision: "approve" | "reject",
  userId?: string | null,
): Promise<HermesToolConfirmResult> {
  const base = getBackendBase().replace(/\/$/, "");
  const token =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("meerak_token")
      : null;
  try {
    const { data } = await axios.post<HermesToolConfirmResult>(
      `${base}/api/hermes/tools/confirm`,
      { proposalId, decision, userId: userId || undefined },
      {
        timeout: 30000,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
    );
    return data;
  } catch {
    return {
      success: false,
      error: "network",
      message:
        decision === "approve"
          ? "ส่งข้อมูลไม่สำเร็จ ลองใหม่อีกครั้งครับ"
          : "ยกเลิกไม่สำเร็จ ลองใหม่อีกครั้งครับ",
    };
  }
}

/** Offline FAQ when backend unreachable */
export function localOsAssistantFallback(message: string): AIChatResponse {
  const t = message.toLowerCase();
  if (/สวัสดี|hello|hi\b|หวัดดี/.test(t) && t.length < 40) {
    return {
      success: true,
      message:
        "สวัสดีครับ ยินดีต้อนรับสู่ AQOND AI Assistant — อยากให้ช่วยหาสินค้า บริการ จองคิว หรือจับคู่งานส่วนไหนดีครับ?",
      intent: "general",
      agentUsed: "qwen",
      entities: [],
      metadata: { modelsUsed: ["rules"], fallbackUsed: true, processingTime: 0 },
    };
  }
  if (/งาน|หางาน|สมัครงาน|job/.test(t)) {
    return {
      success: true,
      message:
        "สำหรับงานพรีเมียม: เปิด Job Board จาก Sidebar แล้วกรองตามทักษะ — ถ้ายังไม่ล็อกอิน ระบบจะพาไปยืนยันเบอร์ก่อนสมัครครับ",
      intent: "job_search",
      agentUsed: "hermes+qwen",
      entities: [{ type: "job", value: message }],
      metadata: { modelsUsed: ["rules"], fallbackUsed: true, processingTime: 0 },
    };
  }
  if (/อาหาร|food|สั่งอาหาร/.test(t)) {
    return {
      success: true,
      message:
        "Food Merchant ใช้สั่งอาหาร/สตรีทฟู้ดได้ครับ — เปิดจาก Sidebar แล้วบอกเมนูที่ต้องการได้เลย",
      intent: "food_order",
      agentUsed: "hermes+qwen",
      entities: [],
      metadata: { modelsUsed: ["rules"], fallbackUsed: true, processingTime: 0 },
    };
  }
  if (/ซื้อ|สินค้า|marketplace/.test(t)) {
    return {
      success: true,
      message:
        "Marketplace รวมสินค้าคัดสรรครับ — เปิด Marketplace จาก Sidebar หรือพิมพ์ชื่อสินค้าที่สนใจได้เลย",
      intent: "marketplace_search",
      agentUsed: "hermes+qwen",
      entities: [],
      metadata: { modelsUsed: ["rules"], fallbackUsed: true, processingTime: 0 },
    };
  }
  if (/จอง|booking|นัด/.test(t)) {
    return {
      success: true,
      message:
        "Booking ใช้จองห้องประชุม/เลานจ์/เซสชันสุขภาพ — เปิดโมดูล Booking จาก Sidebar ได้ครับ",
      intent: "booking",
      agentUsed: "hermes+qwen",
      entities: [],
      metadata: { modelsUsed: ["rules"], fallbackUsed: true, processingTime: 0 },
    };
  }
  return {
    success: true,
    message:
      "รับทราบครับ — บอกละเอียดขึ้นได้นิดว่าต้องการ Marketplace, อาหาร, งาน, การจอง หรือ Rider จะช่วยชี้ทางในแอปให้ครับ",
    intent: "general",
    agentUsed: "qwen",
    entities: [],
    metadata: { modelsUsed: ["rules"], fallbackUsed: true, processingTime: 0 },
  };
}

export async function queryAIOrchestrator(
  message: string,
  opts?: {
    userId?: string | null;
    history?: OrchestratorHistoryItem[];
    role?: "customer" | "merchant" | "provider" | "job_seeker";
    currentModule?: string;
    lastProductQuery?: string | null;
    language?: string;
  },
): Promise<AIChatResponse> {
  const base = getBackendBase().replace(/\/$/, "");
  const token =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("meerak_token")
      : null;

  try {
    const { data } = await axios.post<AIChatResponse>(
      `${base}/api/ai/orchestrator`,
      {
        message,
        userId: opts?.userId || undefined,
        history: (opts?.history || []).slice(-10).map((h) => ({
          role: h.role === "ai" ? "assistant" : h.role,
          text: h.text,
        })),
        context: {
          role: opts?.role || "customer",
          currentScreen: "AI_Chat_Assistant",
          currentModule: opts?.currentModule,
          lastProductQuery: opts?.lastProductQuery || undefined,
          userPreferences: {
            language: opts?.language || "th",
            tone: "friendly",
          },
        },
      },
      {
        timeout: 90000,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
    );
    if (data?.message) {
      return {
        ...data,
        success: data.success !== false,
        entities: data.entities || [],
        metadata: data.metadata || {
          modelsUsed: data.agentUsed ? [String(data.agentUsed)] : ["hermes+qwen"],
          fallbackUsed: false,
          processingTime: 0,
        },
      };
    }
    return localOsAssistantFallback(message);
  } catch (err) {
    console.warn("[queryAIOrchestrator] backend unavailable, using fallback:", err);
    return localOsAssistantFallback(message);
  }
}
