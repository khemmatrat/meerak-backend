/**
 * Chat Messages Hook — Polling + Socket.IO refresh เมื่อมีข้อความใหม่
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  getSupportTicketMessages,
  type SupportMessageRow,
  getAdminSocketOrigin,
  getAdminToken,
} from '../services/adminApi';

export type ChatMessage = {
  id: string;
  sender: 'USER' | 'ADMIN' | 'BOT' | 'PROVIDER';
  message: string;
  timestamp: string;
  source?: 'faq_match' | 'ai_generated';
  faqScore?: number | null;
};

const POLL_INTERVAL_MS = 12000;

function toChatMessage(m: SupportMessageRow): ChatMessage {
  return {
    id: m.id,
    sender: (m.sender === 'PROVIDER' ? 'PROVIDER' : m.sender) as ChatMessage['sender'],
    message: m.message,
    timestamp: m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
    source: m.source,
    faqScore: m.faqScore,
  };
}

export function useChatMessages(ticketId: string | null, getToken: () => string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const fetchMessages = useCallback(async () => {
    if (!ticketId || !getToken()) {
      setMessages([]);
      return;
    }
    setLoading(true);
    try {
      const res = await getSupportTicketMessages(ticketId);
      setMessages((res.messages || []).map(toChatMessage));
    } catch {
      setMessages((prev) => prev);
    } finally {
      setLoading(false);
    }
  }, [ticketId, getToken]);

  // Socket.IO: admin room → refetch เมื่อ backend emit support_messages_refresh
  useEffect(() => {
    if (!ticketId || !getToken()) {
      return;
    }
    const origin = getAdminSocketOrigin();
    if (!origin) return;
    const socket: Socket = io(origin, { path: '/socket.io', transports: ['websocket', 'polling'] });
    let cancelled = false;
    const join = () => {
      const t = getAdminToken();
      if (t) socket.emit('joinAdminSupport', { token: t });
    };
    socket.on('connect', join);
    const onRefresh = (p: { ticketId?: string }) => {
      if (p?.ticketId === ticketId) {
        getSupportTicketMessages(ticketId)
          .then((res) => {
            if (!cancelled) setMessages((res.messages || []).map(toChatMessage));
          })
          .catch(() => {});
      }
    };
    socket.on('support_messages_refresh', onRefresh);
    return () => {
      cancelled = true;
      socket.off('connect', join);
      socket.off('support_messages_refresh', onRefresh);
      socket.disconnect();
    };
  }, [ticketId, getToken]);

  // Polling สำรอง (ลดความถี่ — Socket เป็นหลัก)
  useEffect(() => {
    if (!ticketId || !getToken()) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    const poll = () => {
      getSupportTicketMessages(ticketId)
        .then((res) => {
          if (!cancelled) setMessages((res.messages || []).map(toChatMessage));
        })
        .catch(() => {});
    };
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [ticketId, getToken]);

  // Scroll to bottom เมื่อมีข้อความใหม่
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return { messages, setMessages, fetchMessages, loading, messagesEndRef };
}
