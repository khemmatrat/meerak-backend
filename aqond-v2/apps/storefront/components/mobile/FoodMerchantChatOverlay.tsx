'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { readChatImageFile } from '@/lib/foodTracking';
import { IconLuxCamera } from '@/components/mobile/TtLuxuryIcons';
import { riderIdFromBuyerId, riderPeerLabel } from '@/lib/shopChat';

export { riderPeerLabel };

type ShopChatMsg = {
  id: string;
  from: 'buyer' | 'shop' | 'ai';
  text: string;
};

type Props = {
  layout?: 'overlay' | 'page';
  mode: 'rider' | 'merchant';
  shopId: string;
  buyerId: string;
  peerLabel: string;
  orderRef?: string;
  orderId?: string;
  open?: boolean;
  photoCaption?: string;
  onClose?: () => void;
  onExpand?: () => void;
};

const QUICK_RIDER = ['ถึงร้านแล้วครับ', 'กำลังรับอาหารครับ', 'รอสักครู่นะครับ'];
const QUICK_MERCHANT = ['อาหารพร้อมแล้วครับ/ค่ะ', 'รอสักครู่นะครับ/ค่ะ', 'ไรเดอร์ถึงแล้วหรือยังครับ/ค่ะ'];

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function peerAvatar(label: string, mode: Props['mode']) {
  if (mode === 'merchant') return '🛵';
  return label.slice(0, 1).toUpperCase();
}

export function FoodMerchantChatOverlay({
  layout = 'overlay',
  mode,
  shopId,
  buyerId,
  peerLabel,
  orderRef,
  open = true,
  photoCaption = 'รูปหลักฐานรับของที่ร้าน',
  onClose,
  onExpand,
}: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<ShopChatMsg[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(
      `/api/shop-chat/${encodeURIComponent(shopId)}?buyer_id=${encodeURIComponent(buyerId)}`,
      { cache: 'no-store' },
    );
    if (!res.ok) return;
    const data = await res.json();
    setMessages(data.messages || []);
  }, [buyerId, shopId]);

  useEffect(() => {
    if (!open && layout === 'overlay') return;
    void load();
    const poll = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(poll);
  }, [load, open, layout]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  if (layout === 'overlay' && !open) return null;

  const sendFrom = mode === 'merchant' ? 'shop' : 'buyer';
  const quick = mode === 'merchant' ? QUICK_MERCHANT : QUICK_RIDER;
  const title = mode === 'merchant' ? 'แชทไรเดอร์' : `แชทร้าน · ${peerLabel}`;
  const peerSub =
    mode === 'merchant'
      ? orderRef
        ? `เลขคำสั่ง ${orderRef}`
        : 'Rider OS · หลังบ้านร้านอาหาร'
      : orderRef
        ? `เลขคำสั่ง ${orderRef}`
        : 'Rider OS · หลักฐานรับของ';

  const send = async (text: string, image_url?: string) => {
    const trimmed = text.trim();
    if ((!trimmed && !image_url) || sending) return;
    setSending(true);
    setErr('');
    try {
      const res = await fetch(`/api/shop-chat/${encodeURIComponent(shopId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyer_id: buyerId,
          text: trimmed || '📷 ส่งรูปหลักฐานรับของ',
          from: sendFrom,
          ...(image_url ? { image_url } : {}),
        }),
      });
      if (!res.ok) throw new Error('send_failed');
      const data = await res.json();
      setMessages(data.messages || []);
      setDraft('');
    } catch {
      setErr('ส่งข้อความไม่สำเร็จ — ลองอีกครั้ง');
    } finally {
      setSending(false);
    }
  };

  const onPhotoPick = async (file: File | null) => {
    if (!file) return;
    setSending(true);
    setErr('');
    try {
      const dataUrl = await readChatImageFile(file);
      const caption = `${photoCaption} — ${new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`;
      await send(caption, dataUrl);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'ส่งรูปไม่สำเร็จ');
    } finally {
      setSending(false);
      if (photoRef.current) photoRef.current.value = '';
    }
  };

  const handleClose = () => {
    if (onClose) onClose();
    else router.back();
  };

  const body = (
    <>
      <header className="tt-rider-contact-head">
        <button type="button" className="tt-rider-contact-close" onClick={handleClose} aria-label="ปิด">
          ✕
        </button>
        <p className="tt-rider-contact-title">{title}</p>
        <div className="tt-rider-contact-head-actions">
          {mode === 'rider' && onExpand && layout === 'overlay' ? (
            <button type="button" className="tt-chat-expand-btn" onClick={onExpand} aria-label="ขยายเต็มจอ">
              ⛶
            </button>
          ) : (
            <span className="tt-rider-contact-head-spacer" aria-hidden />
          )}
        </div>
      </header>

      <div className="tt-rider-contact-peer">
        <div className="tt-rider-contact-peer-avatar">{peerAvatar(peerLabel, mode)}</div>
        <div className="tt-rider-contact-peer-meta">
          {orderRef && <p className="tt-rider-contact-order-ref">เลขคำสั่ง: {orderRef}</p>}
          <strong>{peerLabel}</strong>
          <span className="tt-rider-contact-merchant">{peerSub}</span>
          {mode === 'merchant' && (
            <span className="tt-rider-contact-merchant">🍽️ โหมดร้านอาหาร · ตอบไรเดอร์โดยตรง</span>
          )}
        </div>
      </div>

      <div className="tt-rider-contact-body" ref={scrollRef}>
        {err && <p className="tt-error-inline">{err}</p>}
        {messages.length === 0 ? (
          <p className="tt-rider-contact-empty">
            {mode === 'merchant'
              ? 'ยังไม่มีข้อความจากไรเดอร์ — รอไรเดอร์แจ้งสถานะหรือส่งรูปหลักฐาน'
              : 'ยังไม่มีข้อความ — ถ่ายรูปหลักฐานรับของหรือพิมพ์ถึงร้านได้เลย'}
          </p>
        ) : (
          messages.map((m) => {
            const mine = mode === 'merchant' ? m.from === 'shop' : m.from === 'buyer';
            const isAi = m.from === 'ai';
            return (
              <div
                key={m.id}
                className={`tt-rider-contact-bubble ${mine ? 'me' : 'them'}${isAi ? ' ai' : ''}`}
              >
                {isAi && <span className="tt-rider-contact-ai-tag">ร้าน (อัตโนมัติ)</span>}
                {m.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.image_url} alt="รูปแนบ" className="tt-chat-bubble-img" />
                ) : null}
                {m.text && !m.text.startsWith('📷 ส่งรูป') ? <p>{m.text}</p> : null}
                {m.image_url && m.text.startsWith('📷') ? (
                  <p className="tt-chat-bubble-img-cap">📷 รูปหลักฐาน</p>
                ) : null}
                <time>{formatTime(m.created_at)}</time>
              </div>
            );
          })
        )}

        <div className="tt-rider-contact-quick">
          {quick.map((q) => (
            <button key={q} type="button" onClick={() => void send(q)} disabled={sending}>
              {q}
            </button>
          ))}
        </div>
      </div>

      <footer className="tt-rider-contact-foot">
        <p className="tt-rider-contact-foot-hint">
          💬 {mode === 'merchant' ? 'ตอบไรเดอร์โดยตรง — ข้อความถึงร้านจริง' : 'แชทถึงร้านโดยตรง — รอทีมครัวตอบกลับ'}
        </p>
        <div className="tt-rider-contact-input-row">
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            capture={mode === 'rider' ? 'environment' : undefined}
            hidden
            onChange={(e) => void onPhotoPick(e.target.files?.[0] || null)}
          />
          <button
            type="button"
            className="tt-rider-contact-attach"
            aria-label="ส่งรูป"
            disabled={sending}
            onClick={() => photoRef.current?.click()}
          >
            <IconLuxCamera size={20} />
          </button>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={mode === 'merchant' ? 'พิมพ์ถึงไรเดอร์…' : 'พิมพ์ถึงร้านค้า…'}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(draft);
              }
            }}
          />
          <button
            type="button"
            className="tt-rider-contact-send"
            disabled={sending || !draft.trim()}
            onClick={() => void send(draft)}
          >
            ➤
          </button>
        </div>
      </footer>
    </>
  );

  if (layout === 'page') {
    return (
      <div className="tt-rider-contact-overlay tt-rider-contact-overlay--page" aria-label={title}>
        {body}
      </div>
    );
  }

  return (
    <div className="tt-rider-contact-overlay" role="dialog" aria-modal="true" aria-label={title}>
      {body}
    </div>
  );
}

