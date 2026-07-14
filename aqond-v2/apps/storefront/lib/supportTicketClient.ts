import type { SupportChannelCode } from '@/lib/supportChannel';

export type SupportTicket = {
  id: string;
  userId: string;
  subject: string;
  status: string;
  source?: string;
};

export type SupportMessage = {
  id: string;
  ticketId: string;
  sender: string;
  message: string;
  timestamp: string;
};

export async function createPlatformSupportTicket(body: {
  channel: SupportChannelCode;
  user_id: string;
  subject: string;
  message: string;
  order_id?: string;
  merchant_id?: string;
  shop_id?: string;
  job_id?: string;
  category?: string;
}): Promise<{ ticket: SupportTicket; message: SupportMessage }> {
  const res = await fetch('/api/support/v1/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.error || 'support_ticket_create_failed');
  return data;
}

export async function fetchSupportMessages(ticketId: string): Promise<SupportMessage[]> {
  const res = await fetch(`/api/support/v1/tickets/${encodeURIComponent(ticketId)}/messages`, {
    cache: 'no-store',
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.error || 'support_messages_load_failed');
  return data.messages || [];
}

export async function sendSupportMessage(ticketId: string, message: string): Promise<SupportMessage[]> {
  const res = await fetch(`/api/support/v1/tickets/${encodeURIComponent(ticketId)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.error || 'support_message_send_failed');
  return data.messages || [];
}

export function supportHref(opts: {
  channel?: SupportChannelCode;
  order_id?: string;
  merchant_id?: string;
  shop_id?: string;
  subject?: string;
}): string {
  const q = new URLSearchParams();
  if (opts.channel) q.set('channel', opts.channel);
  if (opts.order_id) q.set('order_id', opts.order_id);
  if (opts.merchant_id) q.set('merchant_id', opts.merchant_id);
  if (opts.shop_id) q.set('shop_id', opts.shop_id);
  if (opts.subject) q.set('subject', opts.subject);
  const qs = q.toString();
  return `/m/support${qs ? `?${qs}` : ''}`;
}
