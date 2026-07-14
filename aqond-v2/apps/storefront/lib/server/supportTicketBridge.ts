import { meerakBackendBase } from '@/lib/server-env';
import type { SupportChannelContext } from '@/lib/supportChannel';
import { formatSupportSubject } from '@/lib/supportChannel';

export type SupportTicketRow = {
  id: string;
  userId: string;
  subject: string;
  status: string;
  priority: string;
  category: string;
  source?: string;
  order_id?: string | null;
  merchant_id?: string | null;
  shop_id?: string | null;
  jobId?: string | null;
  lastUpdated: string;
  createdAt: string;
};

export type SupportMessageRow = {
  id: string;
  ticketId: string;
  sender: string;
  message: string;
  timestamp: string;
  source?: string;
};

function backendUrl(path: string): string {
  return `${meerakBackendBase()}${path}`;
}

export async function createSupportTicket(
  ctx: SupportChannelContext,
): Promise<{ ticket: SupportTicketRow; message: SupportMessageRow }> {
  const res = await fetch(backendUrl('/api/support/tickets'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: ctx.userId,
      subject: formatSupportSubject(ctx.channel, ctx.subject),
      message: ctx.message,
      category: ctx.category || 'General',
      email: ctx.email,
      full_name: ctx.full_name,
      phone: ctx.phone,
      source: ctx.channel,
      order_id: ctx.order_id,
      merchant_id: ctx.merchant_id,
      shop_id: ctx.shop_id,
      jobId: ctx.job_id,
    }),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'support_ticket_create_failed');
  return data;
}

export async function listSupportTicketMessages(ticketId: string): Promise<SupportMessageRow[]> {
  const res = await fetch(backendUrl(`/api/support/tickets/${encodeURIComponent(ticketId)}/messages`), {
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'support_messages_load_failed');
  return data.messages || [];
}

export async function postSupportTicketMessage(
  ticketId: string,
  message: string,
): Promise<SupportMessageRow[]> {
  const res = await fetch(backendUrl(`/api/support/tickets/${encodeURIComponent(ticketId)}/messages`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'support_message_send_failed');
  return data.messages || [];
}
