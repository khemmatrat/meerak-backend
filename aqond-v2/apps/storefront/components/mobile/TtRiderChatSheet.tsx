'use client';

import { useState } from 'react';
import { sendRiderChat } from '@/lib/foodTracking';
import type { ChatMessage, RiderTrackingView } from '@/lib/server/riderTracking';

type Props = {
  orderId: string;
  open: boolean;
  messages: ChatMessage[];
  riderName: string;
  riderPhone?: string;
  onClose: () => void;
  onUpdate: (t: RiderTrackingView) => void;
};

const QUICK = ['ถึงแล้วครับ', 'รอแปปนะครับ', 'วางไว้หน้าประตูได้เลย'];

function normalizeTel(phone?: string) {
  if (!phone) return '';
  return phone.replace(/[^\d+]/g, '');
}

export function TtRiderChatSheet({
  orderId,
  open,
  messages,
  riderName,
  riderPhone,
  onClose,
  onUpdate,
}: Props) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [calling, setCalling] = useState(false);
  const [sendError, setSendError] = useState('');
  const tel = normalizeTel(riderPhone);

  if (!open) return null;

  const send = async (msg: string) => {
    if (!msg.trim()) return;
    setSending(true);
    setSendError('');
    try {
      onUpdate(await sendRiderChat(orderId, msg.trim()));
      setText('');
    } catch {
      setSendError('ส่งข้อความไม่สำเร็จ — ลองอีกครั้ง');
    } finally {
      setSending(false);
    }
  };

  const callRider = () => {
    if (!tel) return;
    setCalling(true);
    window.setTimeout(() => setCalling(false), 2500);
    window.location.href = `tel:${tel}`;
  };

  return (
    <div
      className="tt-chat-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`แชทกับ ${riderName}`}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="tt-chat-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="tt-chat-head">
          <button type="button" className="tt-chat-back" onClick={onClose} aria-label="กลับ">
            ‹ กลับ
          </button>
          <div className="tt-chat-head-title">
            <strong>แชทกับ {riderName}</strong>
            {riderPhone && <span className="tt-chat-head-sub">{riderPhone}</span>}
          </div>
          {tel ? (
            <button
              type="button"
              className="tt-chat-call-btn"
              onClick={callRider}
              aria-label="โทรหาไรเดอร์"
            >
              📞 โทร
            </button>
          ) : (
            <button type="button" className="tt-chat-close" onClick={onClose} aria-label="ปิด">
              ✕
            </button>
          )}
        </div>

        {calling && (
          <p className="tt-chat-calling">กำลังโทรหา {riderName}…</p>
        )}

        <div className="tt-chat-messages">
          {messages.map((m, i) => (
            <div key={i} className={`tt-chat-bubble ${m.from}`}>
              <p>{m.text}</p>
            </div>
          ))}
        </div>

        <div className="tt-chat-quick">
          {QUICK.map((q) => (
            <button key={q} type="button" className="jarvis-chip" onClick={() => void send(q)}>
              {q}
            </button>
          ))}
        </div>

        <div className="tt-chat-input-row">
          <input
            className="tt-input tt-chat-input"
            placeholder="พิมพ์ข้อความถึงไรเดอร์…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(text);
              }
            }}
          />
          <button
            type="button"
            className="tt-chat-send-btn"
            disabled={sending || !text.trim()}
            onClick={() => void send(text)}
          >
            {sending ? '…' : 'ส่ง'}
          </button>
        </div>
        {sendError && <p className="tt-chat-send-error">{sendError}</p>}

        <div className="tt-chat-footer-actions">
          {tel && (
            <button type="button" className="tt-chat-footer-call" onClick={callRider}>
              📞 โทรหาไรเดอร์
            </button>
          )}
          <button type="button" className="tt-chat-footer-exit" onClick={onClose}>
            ออกจากแชท
          </button>
        </div>
      </div>
    </div>
  );
}
