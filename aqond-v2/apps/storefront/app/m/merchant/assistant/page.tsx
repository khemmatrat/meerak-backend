'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMerchant } from '@/components/mobile/MerchantShell';

type Msg = { role: 'user' | 'assistant'; text: string };

export default function MerchantAssistantPage() {
  const { merchantId, merchantName } = useMerchant();
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', text: `สวัสดีครับ — ผมผู้ช่วยร้าน ${merchantName} ช่วยเรื่อง SLA, โปรโมชัน, และไลฟ์ได้ครับ` },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [hermesOk, setHermesOk] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/ai/merchant-assistant', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setHermesOk(!!d.ok && !!d.hermes))
      .catch(() => setHermesOk(false));
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text }]);
    setLoading(true);
    try {
      const res = await fetch('/api/ai/merchant-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchant_id: merchantId, message: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'assistant error');
      setMessages((m) => [...m, { role: 'assistant', text: data.reply_th || 'ครับ' }]);
    } catch (e: unknown) {
      setMessages((m) => [...m, {
        role: 'assistant',
        text: e instanceof Error ? e.message : 'ผู้ช่วยไม่พร้อม',
      }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, merchantId]);

  return (
    <div className="tt-merchant-assistant">
      <div className="tt-merchant-assistant-head">
        <h1>🤖 ผู้ช่วยร้าน</h1>
        <span className="tt-hint">{hermesOk ? 'Hermes AI' : 'Rules'}</span>
      </div>

      <div className="tt-merchant-assistant-msgs" ref={listRef}>
        {messages.map((m, i) => (
          <div key={i} className={`tt-merchant-assistant-bubble ${m.role}`}>
            {m.text}
          </div>
        ))}
        {loading && <p className="tt-loading">กำลังคิด…</p>}
      </div>

      <form
        className="tt-merchant-assistant-input"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          className="tt-input"
          placeholder="ถามเรื่อง SLA, โปรโมชัน, ไลฟ์…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" className="tt-btn-primary" disabled={loading}>ส่ง</button>
      </form>

      <div className="tt-merchant-assistant-chips">
        {['SLA วันนี้เป็นอย่างไร', 'แนะนำโปรโมชัน', 'ช่วยไลฟ์ขาย'].map((q) => (
          <button key={q} type="button" className="jarvis-chip" onClick={() => setInput(q)}>
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
