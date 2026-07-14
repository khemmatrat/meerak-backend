import React from "react";
import { Send, Loader2 } from "lucide-react";
import type { AdvanceJobMessageAPI } from "../../types/api";

export function ChatPane({
  messages,
  user,
  chatBody,
  setChatBody,
  chatSubmitting,
  onSend,
}: {
  messages: AdvanceJobMessageAPI[];
  user: { id?: string; userId?: string } | null;
  chatBody: string;
  setChatBody: (v: string) => void;
  chatSubmitting: boolean;
  onSend: () => void;
}) {
  return (
    <div className="luxury-card rounded-2xl p-4 sm:p-6 flex flex-col jb-chat-panel jb-chat-panel--embedded">
      <div className="flex-1 overflow-y-auto space-y-3 mb-4 min-h-0">
        {messages.length === 0 ? (
          <p className="text-slate-500 text-center py-8">
            ยังไม่มีข้อความ — คุยรายละเอียดก่อนกดจ้างได้เลย
          </p>
        ) : (
          messages.map((msg) => {
            const isMe =
              user &&
              (String(user.id) === msg.sender_id ||
                String((user as { userId?: string }).userId) === msg.sender_id);
            return (
              <div
                key={msg.id}
                className={`flex ${isMe ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2 ${isMe ? "bg-amber-500/20 text-slate-100" : "bg-slate-700/50 text-slate-200"}`}
                >
                  {!isMe && (
                    <p className="text-xs text-slate-500 mb-0.5">{msg.sender_name}</p>
                  )}
                  <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {new Date(msg.created_at).toLocaleString("th-TH")}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
      <p className="text-xs text-slate-500 mb-2 shrink-0">
        💬 แนะนำการสื่อสารให้มีมารยาทต่อกัน และใช้คำสุภาพต่อกัน
      </p>
      <div className="flex gap-2 shrink-0">
        <input
          type="text"
          value={chatBody}
          onChange={(e) => setChatBody(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && onSend()}
          placeholder="พิมพ์ข้อความ..."
          className="flex-1 px-4 py-3 rounded-xl bg-charcoal-800 border border-slate-600 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-amber-500/30 outline-none"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={!chatBody.trim() || chatSubmitting}
          className="px-4 py-3 rounded-xl bg-amber-500 text-charcoal-900 font-medium disabled:opacity-50 flex items-center gap-2"
        >
          {chatSubmitting ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Send size={18} />
          )}
        </button>
      </div>
    </div>
  );
}
