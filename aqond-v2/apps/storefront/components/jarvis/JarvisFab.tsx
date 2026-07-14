'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { bffPost } from '@/lib/bff';
import { addFoodToCart, clearFoodCartApi, placeFoodExpressOrder } from '@/lib/food';
import { captionText } from '@/lib/feed';
import { formatCatalogPrice } from '@/lib/format';
import { useJarvisVoice } from '@/components/jarvis/useJarvisVoice';
import { JarvisVoiceWave } from '@/components/jarvis/JarvisVoiceWave';
import { useJarvisFeed } from '@/lib/jarvis/feedContext';
import {
  loadJarvisSession,
  newMsgId,
  patchJarvisSession,
  saveJarvisSession,
  type JarvisFeedContext,
  type JarvisFoodItem,
  type JarvisMessage,
  type JarvisProduct,
  type JarvisSession,
} from '@/lib/jarvis/session';

const QUICK_DEFAULT = ['หา matcha', 'เปรียบเทียบราคา', 'แนะนำอาหาร', 'ช่วยเลือกของขวัญ'];
const QUICK_FEED = ['สินค้าในวิดีโอนี้', 'ราคาเท่าไหร่', 'ซื้อจากวิดีโอ', 'หาสินค้าคล้ายๆ'];
const QUICK_FEED_FOOD = ['เมนูอาหารในคลิป', 'สั่งอาหารจากวิดีโอ', 'สั่งเลย', 'ราคาเท่าไหร่'];

const WELCOME: JarvisMessage = {
  id: 'welcome',
  role: 'jarvis',
  text: 'สวัสดีครับเจ้านาย ผม Jarvis — กดไมค์พูดได้เลย พูดจบจะกลายเป็นข้อความแล้วผมตอบให้ครับ',
};

export function JarvisFab() {
  const pathname = usePathname();
  const { auth } = useAuth();
  const { feedContext } = useJarvisFeed();
  const onFeed = pathname?.startsWith('/m/feed');
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<string>('…');
  const [session, setSession] = useState<JarvisSession>({});
  const [messages, setMessages] = useState<JarvisMessage[]>([WELCOME]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const speakRef = useRef<(text: string) => Promise<void>>(async () => {});
  const sendRef = useRef<(text: string) => Promise<void>>(async () => {});

  const showMobile = pathname?.startsWith('/m');
  const visible = showMobile;

  const voice = useJarvisVoice((text) => {
    void sendRef.current(text);
  }, { userId: auth?.userId, locale: 'th-TH' });

  const quickChips = useMemo(() => {
    if (onFeed && feedContext?.is_food) return QUICK_FEED_FOOD;
    if (onFeed && feedContext?.product_id) return QUICK_FEED;
    return QUICK_DEFAULT;
  }, [onFeed, feedContext?.is_food, feedContext?.product_id]);

  useEffect(() => {
    speakRef.current = voice.speak;
  }, [voice.speak]);

  useEffect(() => {
    setSession(loadJarvisSession());
    fetch('/api/ai/jarvis')
      .then((r) => r.json())
      .then((d) => setMode(d.mode === 'ai-core' ? 'Hermes AI' : 'Local'))
      .catch(() => setMode('Local'));
  }, []);

  useEffect(() => {
    const onGreet = (ev: Event) => {
      const detail = (ev as CustomEvent<{ message?: string; open?: boolean }>).detail;
      const line = detail?.message?.trim();
      if (!line) return;
      setMessages((m) => {
        if (m.some((x) => x.id === 'ftx-greet')) return m;
        return [...m, { id: 'ftx-greet', role: 'jarvis', text: line }];
      });
      if (detail?.open) setOpen(true);
    };
    window.addEventListener('aqond:jarvis-greet', onGreet);
    return () => window.removeEventListener('aqond:jarvis-greet', onGreet);
  }, []);

  useEffect(() => {
    if (open) {
      if (!voice.listening) inputRef.current?.focus();
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    } else {
      voice.stopListen();
    }
  }, [open, messages, loading, voice.listening, voice.stopListen]);

  const addFoodItem = useCallback(async (
    item: JarvisFoodItem,
    merchantId: string,
    opts?: { placeOrder?: boolean; merchantName?: string; etaLabel?: string; deliveryFee?: number; silent?: boolean },
  ) => {
    const owner = auth?.userId || 'guest';
    await addFoodToCart(owner, {
      merchant_id: merchantId,
      item_id: item.id,
      title: item.title,
      unit_price_micro: item.price_micro,
    });

    if (!opts?.placeOrder) {
      if (!opts?.silent) {
        const line = `ใส่ "${item.title}" ลงรถเข็นอาหารแล้วครับเจ้านาย`;
        setMessages((m) => [...m, { id: newMsgId(), role: 'jarvis', text: line }]);
        await speakRef.current(line);
      }
      return null;
    }

    await clearFoodCartApi(owner);
    await addFoodToCart(owner, {
      merchant_id: merchantId,
      item_id: item.id,
      title: item.title,
      unit_price_micro: item.price_micro,
    });

    const { orderId } = await placeFoodExpressOrder({
      ownerId: owner,
      merchantId,
      merchantName: opts.merchantName || 'ร้านอาหาร',
      items: [{ item_id: item.id, title: item.title, qty: 1, unit_price_micro: item.price_micro }],
      subtotalMicro: item.price_micro,
      deliveryFeeMicro: opts.deliveryFee || 2500,
      etaLabel: opts.etaLabel,
    });

    const line = orderId
      ? `สั่ง "${item.title}" แล้วครับเจ้านาย — ติดตามไรเดอร์ได้เลย`
      : `สั่ง "${item.title}" แล้วครับเจ้านาย`;
    if (!opts?.silent) {
      setMessages((m) => [...m, {
        id: newMsgId(),
        role: 'jarvis',
        text: line,
        track_order_id: orderId || undefined,
      }]);
      await speakRef.current(line);
    }
    return orderId;
  }, [auth]);

  const addToCart = useCallback(async (p: JarvisProduct) => {
    const owner = auth?.userId || 'guest';
    const title = p.title || p.name || 'สินค้า';
    await bffPost('/v1/cart/items', {
      owner_id: owner,
      product_id: p.id,
      title,
      qty: 1,
      unit_price_micro: p.price_micro || 0,
      merchant_id: p.merchant_hint || 'demo-merchant',
      source: 'jarvis',
    }, auth);
    patchJarvisSession({ selected_product_id: p.id });
    setSession(loadJarvisSession());
    const line = `ใส่ "${title}" ลงรถเข็นแล้วครับเจ้านาย`;
    setMessages((m) => [...m, { id: newMsgId(), role: 'jarvis', text: line }]);
    await speakRef.current(line);
  }, [auth]);

  const send = useCallback(async (text: string) => {
    const msg = text.trim();
    if (!msg || loading) return;
    voice.stopListen();
    setInput('');
    setLoading(true);
    voice.markProcessing();
    setMessages((m) => [...m, { id: newMsgId(), role: 'user', text: msg }]);

    const currentSession = loadJarvisSession();
    const ctx: JarvisFeedContext | null = onFeed && feedContext ? feedContext : null;

    try {
      const res = await fetch('/api/ai/jarvis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_message: msg,
          session: currentSession,
          feed_context: ctx,
          buyer_id: auth?.userId || 'guest',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Jarvis unavailable');

      const nextSession = { ...currentSession, ...(data.session_patch || {}) };
      saveJarvisSession(nextSession);
      setSession(nextSession);

      const brain = data.jarvis || {};
      const reply = brain.reply_th || 'ครับเจ้านาย';
      const jarvisMsg: JarvisMessage = {
        id: newMsgId(),
        role: 'jarvis',
        text: reply,
        products: data.products,
        compare: data.compare,
        food_items: data.food_items,
        food_merchant_name: data.food_merchant_name,
        food_eta_label: data.food_eta_label,
        mode: data.mode,
        track_order_id: brain.track_order_id || data.session_patch?.track_order_id,
      };
      setMessages((m) => [...m, jarvisMsg]);
      await speakRef.current(reply);

      const merchantId = data.food_merchant_id || brain.food_merchant_id || ctx?.food_merchant_id;
      const foodItem = (data.food_items as JarvisFoodItem[] | undefined)?.[0];

      if (foodItem && merchantId && brain.should_add_food) {
        const orderId = await addFoodItem(foodItem, merchantId, {
          placeOrder: false, //!!brain.should_food_order,
          merchantName: data.food_merchant_name || ctx?.food_merchant_name,
          etaLabel: data.food_eta_label,
          silent: false, //true,
        });
        if (orderId) {
          setMessages((m) => m.map((msg) => (
            msg.id === jarvisMsg.id ? { ...msg, track_order_id: orderId } : msg
          )));
        }
        patchJarvisSession({ selected_food_item_id: foodItem.id, food_merchant_id: merchantId });
        setSession(loadJarvisSession());
      } else if (brain.action === 'track_order' && brain.track_order_id) {
        const active = (data.active_orders as Array<{ order_id: string; track_href?: string }> | undefined)
          || nextSession.active_orders
          || [];
        const hit = active.find((o) => o.order_id === brain.track_order_id);
        setMessages((m) => m.map((msg) => (
          msg.id === jarvisMsg.id
            ? { ...msg, track_order_id: brain.track_order_id, track_href: hit?.track_href }
            : msg
        )));
      } else if (brain.action === 'place_order' && brain.should_place_order && brain.selected_product_id) {
        const hit: JarvisProduct =
          nextSession.last_search?.find((p: JarvisProduct) => p.id === brain.selected_product_id)
          || {
            id: brain.selected_product_id,
            price_micro: ctx?.price_micro || 0,
            title: ctx?.product_title || 'สินค้า',
            merchant_hint: 'demo-merchant',
          };
        await addToCart(hit);
      }
    } catch (e: unknown) {
      const detail = e instanceof Error ? e.message : 'เกิดข้อผิดพลาด';
      const line = `ขออภัยครับเจ้านาย — ${detail}`;
      setMessages((m) => [...m, { id: newMsgId(), role: 'jarvis', text: line }]);
      await speakRef.current(line);
    } finally {
      setLoading(false);
      voice.markIdle();
    }
  }, [loading, addToCart, addFoodItem, voice, onFeed, feedContext]);

  sendRef.current = send;

  const onSelectProduct = (p: JarvisProduct) => {
    patchJarvisSession({ selected_product_id: p.id });
    setSession(loadJarvisSession());
    const line = `เลือก "${p.title || p.name}" แล้วครับ — กดใส่รถเข็น หรือพูดว่า "สั่งเลย"`;
    setMessages((m) => [...m, { id: newMsgId(), role: 'jarvis', text: line }]);
    void speakRef.current(line);
  };

  if (!visible) return null;

  const inputValue = voice.listening && voice.interim ? voice.interim : input;
  const showVoicePanel = voice.listening || voice.finalHint || voice.voicePhase === 'speaking';

  return (
    <>
      <button
        type="button"
        className={`jarvis-fab${open ? ' jarvis-fab-open' : ''}${voice.listening ? ' jarvis-fab-listening' : ''}`}
        aria-label={open ? 'ปิด Jarvis' : 'เปิด Jarvis AI'}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          '✕'
        ) : voice.listening ? (
          '🎙'
        ) : (
          <Image
            src="/jarvis-icon.png"
            alt=""
            className="jarvis-fab-icon"
            width={44}
            height={44}
            unoptimized
          />
        )}
      </button>

      {open && (
        <div className="jarvis-panel" role="dialog" aria-label="Jarvis shopping assistant">
          <header className="jarvis-header">
            <div className="jarvis-header-top">
              <div>
                <strong>Jarvis</strong>
                <span className="jarvis-badge">{mode}</span>
                {voice.supported && (
                  <span className="jarvis-badge voice">Voice</span>
                )}
                {onFeed && feedContext?.is_food && (
                  <span className="jarvis-badge feed">Food</span>
                )}
                {onFeed && feedContext?.product_id && !feedContext?.is_food && (
                  <span className="jarvis-badge feed">Feed</span>
                )}
              </div>
              {voice.supported && (
                <button
                  type="button"
                  className={`jarvis-tts-toggle${voice.ttsOn ? ' on' : ''}`}
                  onClick={() => voice.setTtsEnabled(!voice.ttsOn)}
                  aria-label={voice.ttsOn ? 'ปิดเสียงตอบ' : 'เปิดเสียงตอบ'}
                  title={voice.ttsOn ? 'เสียงตอบ: เปิด' : 'เสียงตอบ: ปิด'}
                >
                  {voice.ttsOn ? '🔊' : '🔇'}
                </button>
              )}
            </div>
            <span className="jarvis-sub">
              {voice.listening
                ? 'พูดได้เลย — จะแปลงเป็นข้อความแล้วส่งให้ Jarvis'
                : onFeed && feedContext?.is_food
                  ? `🍜 คลิปอาหาร · ${feedContext.food_merchant_name || 'สั่งผ่าน Jarvis'}`
                  : onFeed && feedContext?.product_title
                    ? `ดูอยู่: ${feedContext.product_title}`
                    : 'พูดหรือพิมพ์ · ช่วยซื้อของ · เปรียบเทียบราคา'}
            </span>
          </header>

          {onFeed && feedContext?.caption && (
            <div className="jarvis-feed-ctx">
              <span className="jarvis-feed-label">คลิปที่ดู</span>
              <p>{captionText(feedContext.caption)}</p>
            </div>
          )}

          {showVoicePanel && (
            <div className="jarvis-voice-panel" aria-live="polite">
              <JarvisVoiceWave levels={voice.waveLevels} active={voice.listening} />
              <div className="jarvis-voice-text">
                {voice.listening && (
                  <p className="jarvis-voice-live">
                    {voice.interim || 'ฟังอยู่…'}
                  </p>
                )}
                {voice.finalHint && (
                  <p className="jarvis-voice-final">✓ {voice.finalHint}</p>
                )}
                {voice.voicePhase === 'speaking' && (
                  <p className="jarvis-voice-speaking">Jarvis กำลังพูด…</p>
                )}
              </div>
            </div>
          )}

          <div className="jarvis-messages" ref={scrollRef}>
            {messages.map((m) => (
              <div key={m.id} className={`jarvis-bubble jarvis-${m.role}`}>
                <p>{m.text}</p>
                {m.food_eta_label && (
                  <p className="jarvis-food-eta">🛵 ส่ง {m.food_eta_label}</p>
                )}
                {m.track_order_id && (
                  <Link
                    href={m.track_href || `/m/orders/${m.track_order_id}/track`}
                    className="jarvis-chip primary link"
                    onClick={() => setOpen(false)}
                  >
                    ติดตามออเดอร์
                  </Link>
                )}
                {m.food_items?.map((f) => (
                  <div key={f.id} className="jarvis-product jarvis-food-item">
                    <div>
                      <strong>🍱 {f.title}</strong>
                      <span>{formatCatalogPrice(f.price_micro || 0)}</span>
                    </div>
                    <div className="jarvis-product-actions">
                      <button
                        type="button"
                        className="jarvis-chip primary"
                        onClick={() => {
                          const mid = f.merchant_id || session.food_merchant_id || feedContext?.food_merchant_id;
                          if (mid) void addFoodItem(f, mid, { merchantName: m.food_merchant_name, etaLabel: m.food_eta_label });
                        }}
                      >
                        ใส่รถเข็นอาหาร
                      </button>
                      <button
                        type="button"
                        className="jarvis-chip"
                        onClick={() => {
                          const mid = f.merchant_id || session.food_merchant_id || feedContext?.food_merchant_id;
                          if (mid) {
                            void addFoodItem(f, mid, {
                              placeOrder: true,
                              merchantName: m.food_merchant_name,
                              etaLabel: m.food_eta_label,
                            });
                          }
                        }}
                      >
                        สั่งเลย
                      </button>
                    </div>
                  </div>
                ))}
                {(m.products || m.compare)?.map((p) => (
                  <div key={p.id} className="jarvis-product">
                    <div>
                      <strong>{p.title || p.name}</strong>
                      <span>{formatCatalogPrice(p.price_micro || 0)}</span>
                    </div>
                    <div className="jarvis-product-actions">
                      <button type="button" className="jarvis-chip" onClick={() => onSelectProduct(p)}>
                        เลือก
                      </button>
                      <button type="button" className="jarvis-chip primary" onClick={() => addToCart(p)}>
                        ใส่รถเข็น
                      </button>
                      <Link href={`/m/product/${p.id}`} className="jarvis-chip link" onClick={() => setOpen(false)}>
                        ดู
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ))}
            {loading && <p className="jarvis-typing">Jarvis กำลังคิด…</p>}
          </div>

          <div className="jarvis-quick">
            {quickChips.map((q) => (
              <button key={q} type="button" className="jarvis-chip" onClick={() => send(q)} disabled={loading || voice.listening}>
                {q}
              </button>
            ))}
          </div>

          <form
            className="jarvis-input-row"
            onSubmit={(e) => {
              e.preventDefault();
              send(inputValue);
            }}
          >
            {voice.supported && (
              <button
                type="button"
                className={`jarvis-mic${voice.listening ? ' listening' : ''}`}
                onClick={voice.toggleListen}
                disabled={loading}
                aria-label={voice.listening ? 'หยุดฟัง' : 'พูดกับ Jarvis'}
                title={voice.listening ? 'หยุดฟัง' : 'กดแล้วพูด'}
              >
                {voice.listening ? '⏹' : '🎤'}
              </button>
            )}
            <input
              ref={inputRef}
              className="jarvis-input"
              placeholder={voice.supported ? 'พูดหรือพิมพ์…' : 'ถาม Jarvis…'}
              value={inputValue}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading || voice.listening}
              autoComplete="off"
            />
            <button type="submit" className="jarvis-send" disabled={loading || voice.listening || !inputValue.trim()}>
              ส่ง
            </button>
          </form>

          {session.selected_product_id && (
            <p className="jarvis-hint">
              เลือกอยู่: <code>{session.selected_product_id}</code>
            </p>
          )}

          {!voice.supported && (
            <p className="jarvis-hint">เสียง: ใช้ Chrome/Edge บน Windows หรือ Android เพื่อพูดกับ Jarvis</p>
          )}
        </div>
      )}
    </>
  );
}
