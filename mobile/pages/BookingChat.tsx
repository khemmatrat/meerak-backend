import React, { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { ArrowLeft, Send, Loader2 } from "lucide-react";

interface ChatMessage {
  id: string;
  sender_id: string;
  sender_name?: string | null;
  sender_avatar?: string | null;
  body: string;
  created_at: string;
}

export const BookingChat: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { notify } = useNotification();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const currentUserId = user?.id ?? (user as any)?.userId;

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await api.get<{ messages: ChatMessage[] }>(
        `/bookings/${id}/chat-messages`
      );
      setMessages(data?.messages ?? []);
    } catch (e) {
      notify("โหลดข้อความไม่สำเร็จ", "error");
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [id, notify]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!id) return;
    const poll = setInterval(load, 3000);
    return () => clearInterval(poll);
  }, [id, load]);

  const handleSend = async () => {
    const text = body.trim();
    if (!text || !id) return;
    setSending(true);
    try {
      const { data } = await api.post<{ message: ChatMessage }>(
        `/bookings/${id}/chat-messages`,
        { body: text }
      );
      setBody("");
      if (data?.message) {
        setMessages((prev) => [...prev, data.message]);
      }
      await load();
    } catch (e: any) {
      const msg = e?.response?.data?.error || "ส่งไม่สำเร็จ";
      notify(msg, "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-amber-50/30 to-slate-100 flex flex-col">
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <Link
          to="/my-bookings"
          className="p-2 rounded-full hover:bg-gray-100 text-gray-700"
        >
          <ArrowLeft size={22} />
        </Link>
        <h1 className="font-semibold text-gray-900">แชทการจองคิว</h1>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={28} className="animate-spin text-amber-500" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-center text-gray-500 py-8">
            ยังไม่มีข้อความ — คุยรายละเอียดกันได้เลย
          </p>
        ) : (
          messages.map((msg) => {
            const isMe =
              currentUserId &&
              (String(msg.sender_id) === String(currentUserId) ||
                String((user as any)?.userId) === String(msg.sender_id));
            return (
              <div
                key={msg.id}
                className={`flex ${isMe ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                    isMe
                      ? "bg-emerald-500 text-white"
                      : "bg-white border border-gray-200 text-gray-900"
                  }`}
                >
                  {!isMe && msg.sender_name && (
                    <p className="text-xs text-gray-500 mb-0.5">
                      {msg.sender_name}
                    </p>
                  )}
                  <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                  <p
                    className={`text-xs mt-1 ${
                      isMe ? "text-emerald-100" : "text-gray-400"
                    }`}
                  >
                    {new Date(msg.created_at).toLocaleString("th-TH")}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="พิมพ์ข้อความ..."
            className="flex-1 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
          <button
            onClick={handleSend}
            disabled={sending || !body.trim()}
            className="px-5 py-3 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-2"
          >
            {sending ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <Send size={20} />
            )}
            ส่ง
          </button>
        </div>
      </div>
    </div>
  );
};
