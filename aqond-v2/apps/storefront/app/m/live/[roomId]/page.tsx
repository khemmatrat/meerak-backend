'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { formatCatalogPrice } from '@/lib/format';
import {
  confirmLiveOrder,
  fetchLiveChatHistory,
  fetchLivePinned,
  liveWsUrl,
  submitLiveAddress,
  type LiveChatMessage,
  type LivePinned,
} from '@/lib/live';

export default function LiveRoomPage() {
  const params = useParams();
  const roomId = String(params.roomId || 'demo-room');
  const { auth, user } = useAuth();
  const buyerId = auth?.userId || 'guest';
  const buyerName = user?.name || user?.phone || 'ผู้ชม';

  const [pinned, setPinned] = useState<LivePinned[]>([]);
  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  const [chatText, setChatText] = useState('');
  const [connected, setConnected] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [addressText, setAddressText] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const reloadPinned = useCallback(() => {
    fetchLivePinned(roomId).then(setPinned).catch(() => setPinned([]));
  }, [roomId]);

  useEffect(() => {
    reloadPinned();
    fetchLiveChatHistory(roomId).then(setMessages).catch(() => setMessages([]));
  }, [roomId, reloadPinned]);

  useEffect(() => {
    const ws = new WebSocket(liveWsUrl(roomId, buyerId, buyerName));
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data));
        if (data.type === 'chat' && data.message) {
          setMessages((m) => [...m, data.message]);
        }
        if (data.type === 'order_draft' || data.message?.kind === 'order_draft') {
          const card = data.message?.payload || data;
          if (card.draft_id) setDraftId(String(card.draft_id));
        }
        if (data.type === 'order_success' || data.message?.kind === 'order_success') {
          const p = data.message?.payload || data;
          if (p.order_id) setOrderId(String(p.order_id));
          setMsg('สั่งซื้อสำเร็จ! กรอกที่อยู่ด้านล่าง');
        }
        if (data.type === 'pinned_update') reloadPinned();
      } catch {
        /* ignore */
      }
    };
    return () => ws.close();
  }, [roomId, buyerId, buyerName, reloadPinned]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const sendChat = () => {
    const text = chatText.trim();
    if (!text || !wsRef.current || wsRef.current.readyState !== 1) return;
    wsRef.current.send(JSON.stringify({ type: 'chat', text }));
    setChatText('');
  };

  const orderPinned = async (p: LivePinned) => {
    setErr('');
    if (!wsRef.current || wsRef.current.readyState !== 1) {
      setErr('ยังไม่เชื่อมต่อห้องไลฟ์');
      return;
    }
    wsRef.current.send(JSON.stringify({ type: 'chat', text: p.f_code || 'F1' }));
  };

  const confirmOrder = async () => {
    if (!draftId) return;
    setErr('');
    try {
      const r = await confirmLiveOrder(draftId, buyerId);
      setOrderId(r.order_id);
      setMsg('ยืนยันสั่งซื้อแล้ว');
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'ยืนยันไม่สำเร็จ');
    }
  };

  const saveAddress = async () => {
    if (!orderId || !addressText.trim()) return;
    setErr('');
    try {
      await submitLiveAddress({ order_id: orderId, buyer_id: buyerId, parse_text: addressText.trim() });
      setMsg('บันทึกที่อยู่แล้ว — ร้านจะจัดส่งให้เร็วๆ นี้');
      setAddressText('');
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'บันทึกที่อยู่ไม่สำเร็จ');
    }
  };

  const hero = pinned[0];

  return (
    <div className="tt-live-room">
      <header className="tt-live-room-header">
        <Link href="/m/feed" className="tt-live-back" aria-label="กลับ">‹</Link>
        <div className="tt-live-room-title">
          <span className={`tt-live-dot${connected ? ' on' : ''}`} />
          <strong>ไลฟ์ #{roomId.slice(-6)}</strong>
        </div>
        {!auth && (
          <Link href="/m/login" className="tt-live-login">เข้าสู่ระบบ</Link>
        )}
      </header>

      <div className="tt-live-stage">
        <div className="tt-live-video-placeholder">
          <span>▶️</span>
          <p>Live Stream</p>
          <p className="tt-hint">ห้อง {roomId}</p>
        </div>
        {hero && (
          <div className="tt-live-product-card">
            <div>
              <p className="tt-live-fcode">{hero.f_code}</p>
              <strong>{hero.title}</strong>
              <p>{formatCatalogPrice(hero.price_micro)}</p>
            </div>
            <button type="button" className="tt-btn-primary tt-live-buy" onClick={() => void orderPinned(hero)}>
              สั่งเลย
            </button>
          </div>
        )}
      </div>

      {pinned.length > 1 && (
        <div className="tt-live-pinned-row">
          {pinned.slice(1, 5).map((p) => (
            <button key={p.f_code} type="button" className="tt-live-pinned-chip" onClick={() => void orderPinned(p)}>
              {p.f_code} · {p.title.slice(0, 12)}
            </button>
          ))}
        </div>
      )}

      {draftId && !orderId && (
        <div className="tt-live-action-bar">
          <p className="tt-hint">มีรายการรอยืนยัน</p>
          <button type="button" className="tt-btn-primary" onClick={() => void confirmOrder()}>ยืนยันสั่งซื้อ</button>
        </div>
      )}

      {orderId && (
        <div className="tt-live-address-bar">
          <input
            className="tt-input"
            placeholder="พิมพ์ที่อยู่จัดส่ง เช่น ชื่อ เบอร์ ที่อยู่ รหัสไปรษณีย์"
            value={addressText}
            onChange={(e) => setAddressText(e.target.value)}
          />
          <button type="button" className="tt-btn-primary" onClick={() => void saveAddress()}>บันทึกที่อยู่</button>
        </div>
      )}

      {msg && <p className="tt-merchant-ok tt-live-msg">{msg}</p>}
      {err && <p className="tt-error-inline tt-live-msg">{err}</p>}

      <div className="tt-live-chat" ref={listRef}>
        {messages.map((m, i) => (
          <div key={m.id || i} className={`tt-live-chat-line kind-${m.kind || 'text'}`}>
            <span className="tt-live-chat-user">{m.user_name || 'ผู้ชม'}</span>
            <span>{m.body}</span>
          </div>
        ))}
      </div>

      <form
        className="tt-live-chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          sendChat();
        }}
      >
        <input
          value={chatText}
          onChange={(e) => setChatText(e.target.value)}
          placeholder="แชท หรือพิมพ์ F1 เพื่อสั่ง"
        />
        <button type="submit" className="tt-btn-primary">ส่ง</button>
      </form>
    </div>
  );
}
