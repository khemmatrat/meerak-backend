/**
 * Chat Service — Modular layer สำหรับ Support Chat
 * รองรับการเชื่อมต่อ AI API ในอนาคต (Clean Code)
 */
import {
  getSupportTicketMessages,
  replySupportTicket,
  type SupportMessageRow,
} from './adminApi';

export type ChatMessage = {
  id: string;
  sender: 'USER' | 'ADMIN' | 'BOT';
  message: string;
  timestamp: string;
};

export function toChatMessage(m: SupportMessageRow): ChatMessage {
  return {
    id: m.id,
    sender: m.sender as 'USER' | 'ADMIN' | 'BOT',
    message: m.message,
    timestamp: m.timestamp
      ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '',
  };
}

export async function fetchMessages(ticketId: string): Promise<ChatMessage[]> {
  const res = await getSupportTicketMessages(ticketId);
  return (res.messages || []).map(toChatMessage);
}

export async function sendMessage(
  ticketId: string,
  message: string,
  asBot: boolean
): Promise<ChatMessage> {
  const res = await replySupportTicket(ticketId, message, asBot);
  return toChatMessage(res.message);
}

/**
 * สำหรับอนาคต: เชื่อมต่อ AI API
 * export async function getAiReply(ticketId: string, userMessage: string): Promise<string> {
 *   const res = await fetch('/api/ai/chat', { ... });
 *   return res.reply;
 * }
 */
