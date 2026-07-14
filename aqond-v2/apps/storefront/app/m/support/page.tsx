'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import {
  createPlatformSupportTicket,
  fetchSupportMessages,
  sendSupportMessage,
  type SupportMessage,
} from '@/lib/supportTicketClient';
import { parseSupportChannel, supportChannelLabel } from '@/lib/supportChannel';
import { IconLuxChat, IconLuxShield, LuxuryHubIcon } from '@/components/mobile/TtLuxuryIcons';

function SupportInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { auth } = useAuth();
  const userId = auth?.userId || 'guest';
  const channel = parseSupportChannel(params.get('channel'));
  const orderId = params.get('order_id') || undefined;
  const merchantId = params.get('merchant_id') || undefined;
  const shopId = params.get('shop_id') || undefined;
  const presetSubject = params.get('subject') || '';

  const [ticketId, setTicketId] = useState<string | null>(params.get('ticket_id'));
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(!ticketId);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const booted = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (booted.current || ticketId) return;
    booted.current = true;
    const subject =
      presetSubject ||
      (orderId ? `ออเดอร์ #${orderId.slice(-8)}` : `ความช่วยเหลือ ${supportChannelLabel(channel)}`);
    const message =
      orderId
        ? `ต้องการความช่วยเหลือเกี่ยวกับออเดอร์ ${orderId}`
        : `ต้องการติดต่อ Customer Service (${channel})`;
    createPlatformSupportTicket({
      channel,
      user_id: userId,
      subject,
      message,
      order_id: orderId,
      merchant_id: merchantId,
      shop_id: shopId,
      category: 'General',
    })
      .then((data) => {
        setTicketId(data.ticket.id);
        setMessages([data.message]);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'support_boot_failed'))
      .finally(() => setLoading(false));
  }, [channel, merchantId, orderId, presetSubject, shopId, ticketId, userId]);

  useEffect(() => {
    if (!ticketId) return;
    const poll = () => {
      void fetchSupportMessages(ticketId)
        .then(setMessages)
        .catch(() => undefined);
    };
    poll();
    const t = window.setInterval(poll, 5000);
    return () => window.clearInterval(t);
  }, [ticketId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onSend = async () => {
    const text = draft.trim();
    if (!text || !ticketId || sending) return;
    setSending(true);
    setErr('');
    try {
      const rows = await sendSupportMessage(ticketId, text);
      setMessages(rows);
      setDraft('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'send_failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="tt-support-page">
      <header className="tt-support-header">
        <button type="button" className="tt-support-back" onClick={() => router.back()} aria-label="กลับ">
          ‹
        </button>
        <div className="tt-support-head-copy">
          <span className="tt-support-channel-badge">{channel}</span>
          <h1>Customer Service</h1>
          <p>{supportChannelLabel(channel)} · เชื่อมต่อ Support Admin</p>
        </div>
        <span className="tt-support-head-icon" aria-hidden>
          <IconLuxShield size={22} />
        </span>
      </header>

      {orderId && (
        <div className="tt-support-context">
          <LuxuryHubIcon id="wallet" size={18} />
          <span>ออเดอร์ #{orderId.slice(-8)}</span>
          <Link href={`/m/orders/${orderId}`}>ดูรายละเอียด ›</Link>
        </div>
      )}

      <div className="tt-support-body" ref={scrollRef}>
        {loading && <p className="tt-loading">กำลังเปิดเคส Support…</p>}
        {err && <p className="tt-error-inline">{err}</p>}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`tt-support-msg tt-support-msg-${m.sender === 'USER' ? 'user' : 'staff'}`}
          >
            <p>{m.message}</p>
            <time>{new Date(m.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</time>
          </div>
        ))}
        {!loading && messages.length === 0 && (
          <p className="tt-hint">พิมพ์ข้อความเพื่อติดต่อทีมงาน AQOND</p>
        )}
      </div>

      <footer className="tt-support-input-bar">
        <span className="tt-support-input-icon" aria-hidden>
          <IconLuxChat size={20} />
        </span>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="พิมพ์ข้อความถึงเจ้าหน้าที่"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void onSend();
            }
          }}
        />
        <button type="button" className="tt-support-send" disabled={sending || !draft.trim()} onClick={() => void onSend()}>
          ส่ง
        </button>
      </footer>
    </div>
  );
}

export default function SupportPage() {
  return (
    <Suspense fallback={<p className="tt-loading">กำลังโหลด Customer Service…</p>}>
      <SupportInner />
    </Suspense>
  );
}
