/**
 * MessageBubble — แยกสีฟองสบู่ระหว่าง User, Admin และ AI Chatbot
 * ปุ่ม ⭐ สำหรับ Admin: บันทึกเป็น Best Answer ใน FAQ Knowledge Base
 * Badge สำหรับ BOT: แสดง Match Info (FAQ Match / AI Thinking)
 */
import React, { useState } from "react";
import { User, Bot, Star, Briefcase } from "lucide-react";

export type BubbleSender = "USER" | "ADMIN" | "BOT" | "PROVIDER";

interface MessageBubbleProps {
  sender: BubbleSender;
  message: string;
  timestamp: string;
  /** สำหรับ ADMIN: คำถามของลูกค้าที่ข้อความนี้ตอบ (ใช้เมื่อกด Save as Best Answer) */
  questionForFaq?: string;
  /** สำหรับ ADMIN: ticketId สำหรับบันทึก Best Answer */
  ticketId?: string;
  /** สำหรับ ADMIN: ข้อความนี้ถูกบันทึกเป็น Best Answer แล้วหรือยัง (จาก parent) */
  saved?: boolean;
  /** Callback เมื่อกดปุ่มดาว บันทึก question + best_answer ลง FAQ */
  onSaveAsBestAnswer?: (
    question: string,
    best_answer: string,
    ticketId?: string,
  ) => Promise<void>;
  canSaveAsBestAnswer?: boolean;
  /** สำหรับ BOT: แหล่งที่มาของคำตอบ */
  source?: string;
  /** สำหรับ BOT: คะแนนความคล้าย (เมื่อ source=faq_match) */
  faqScore?: number | null;
}

const BUBBLE_STYLES: Record<
  BubbleSender,
  { bg: string; text: string; icon: string; label?: string }
> = {
  USER: {
    bg: "bg-slate-100 border border-slate-200 text-slate-800",
    text: "text-slate-800",
    icon: "bg-slate-500 text-white",
    label: "ลูกค้า",
  },
  ADMIN: {
    bg: "bg-indigo-600 text-white border-indigo-700",
    text: "text-white",
    icon: "bg-indigo-700 text-white",
    label: "Admin",
  },
  BOT: {
    bg: "bg-emerald-50 border border-emerald-200 text-emerald-900",
    text: "text-emerald-900",
    icon: "bg-emerald-600 text-white",
    label: "AI Chatbot",
  },
  PROVIDER: {
    bg: "bg-amber-100 border border-amber-300 text-amber-950",
    text: "text-amber-950",
    icon: "bg-amber-600 text-white",
    label: "Verified Pro",
  },
};

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  sender,
  message,
  timestamp,
  questionForFaq,
  ticketId,
  saved: savedFromParent = false,
  onSaveAsBestAnswer,
  canSaveAsBestAnswer = true,
  source,
  faqScore,
}) => {
  const style = BUBBLE_STYLES[sender];
  const isRight = sender === "ADMIN";
  const [saving, setSaving] = useState(false);
  const [savedLocal, setSavedLocal] = useState(false);
  const saved = savedFromParent || savedLocal;

  const handleSaveBestAnswer = async () => {
    if (!onSaveAsBestAnswer || !questionForFaq || saving || saved) return;
    setSaving(true);
    try {
      await onSaveAsBestAnswer(questionForFaq, message, ticketId);
      setSavedLocal(true);
    } finally {
      setSaving(false);
    }
  };

  const showStar =
    (sender === "ADMIN" || sender === "BOT" || sender === "PROVIDER") &&
    onSaveAsBestAnswer &&
    questionForFaq;
  const showMatchBadge = sender === "BOT" && !!source;

  return (
    <div className={`flex ${isRight ? "justify-end" : "justify-start"}`}>
      <div
        className={`flex gap-3 max-w-[80%] ${isRight ? "flex-row-reverse" : ""}`}
      >
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${style.icon}`}
        >
          {sender === "PROVIDER" ? (
            <Briefcase size={16} />
          ) : sender === "ADMIN" || sender === "USER" ? (
            <User size={16} />
          ) : (
            <Bot size={16} />
          )}
        </div>
        <div>
          <div
            className={`p-3 rounded-2xl text-sm ${
              isRight ? "rounded-tr-none" : "rounded-tl-none"
            } ${style.bg}`}
          >
            {(sender === "BOT" || sender === "PROVIDER") && (
              <div
                className={`text-[10px] font-bold mb-1 flex items-center gap-1 ${
                  sender === "PROVIDER" ? "text-amber-800" : "text-emerald-600"
                }`}
              >
                {sender === "PROVIDER" ? (
                  <Briefcase size={10} />
                ) : (
                  <Bot size={10} />
                )}{" "}
                {style.label}
              </div>
            )}
            <div className="whitespace-pre-wrap">{message}</div>
          </div>
          <div className="flex items-center gap-2 mt-1 px-1 flex-wrap">
            <span className="text-[10px] text-slate-400">{timestamp}</span>
            {showStar && (
              <button
                type="button"
                onClick={handleSaveBestAnswer}
                disabled={saving || saved || !canSaveAsBestAnswer}
                title={
                  saved
                    ? "บันทึกลงคลังสมองน้องรักษ์เรียบร้อย!"
                    : canSaveAsBestAnswer
                      ? "บันทึกเป็น Best Answer (คลังความรู้ AI)"
                      : "ต้องเป็น Super Admin หรือผู้ที่ได้รับสิทธิ์ support_knowledge:approve"
                }
                className={`p-1.5 rounded-md transition-colors ${
                  saved
                    ? "text-amber-500 bg-amber-50"
                    : "text-amber-600/70 hover:text-amber-600 hover:bg-amber-100"
                } disabled:opacity-50`}
              >
                <Star
                  size={18}
                  fill={saved ? "currentColor" : "none"}
                  strokeWidth={saved ? 0 : 2}
                />
              </button>
            )}
            {showMatchBadge && (
              <span className="text-[10px] text-slate-400">
                {source === "faq_match" && faqScore != null
                  ? `Matched from FAQ: ${faqScore}% accuracy`
                  : source === "no_answer_kb_draft"
                    ? "No approved KB match: draft queued"
                    : source === "ai_generated"
                      ? "AI Generated (No match found)"
                      : source}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
