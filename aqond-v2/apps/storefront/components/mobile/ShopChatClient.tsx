'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { formatCatalogPrice } from '@/lib/format';
import { FULFILLMENT_LABELS } from '@/lib/merchant';
import {
  IconLuxAqondStore,
  IconLuxBags,
  IconLuxChat,
  IconLuxPhone,
  IconLuxReceipt,
  IconLuxShield,
  IconLuxTimer,
  IconLuxToShip,
  IconLuxTruckRoad,
  LuxuryHubIcon,
} from '@/components/mobile/TtLuxuryIcons';
import {
  createPlatformSupportTicket,
  fetchSupportMessages,
  sendSupportMessage,
  type SupportMessage,
} from '@/lib/supportTicketClient';

const FAQ_OPTIONS = [
  { id: 'problem', text: 'สินค้ามีปัญหา/เสียหาย/ไม่ครบ ฯลฯ', Icon: IconLuxToShip },
  { id: 'track', text: 'ติดตามสถานะสินค้า', Icon: IconLuxTruckRoad },
  { id: 'eta', text: 'ระยะเวลาจัดส่งโดยประมาณ', Icon: IconLuxTimer },
  { id: 'carrier', text: 'ช่องทางติดต่อบริษัทขนส่ง', Icon: IconLuxPhone },
  { id: 'receipt', text: 'ใบเสร็จ/ใบกำกับภาษี', Icon: IconLuxReceipt },
] as const;

type ChatMsg = {
  id: string;
  from: 'buyer' | 'shop' | 'ai' | 'staff';
  text: string;
  created_at: string;
};

type ShopInfo = {
  id: string;
  name: string;
  avatar_url?: string;
  followers?: number;
  follower_label?: string;
};

type ProductCtx = {
  id: string;
  title: string;
  priceMicro: number;
  imageUrl?: string;
};

function formatChatTime(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function repeatBuyerLabel(followers?: number) {
  if (!followers || followers < 1000) return 'ร้านค้ายอดนิยม';
  if (followers >= 4000) return '4K+ ผู้ซื้อที่กลับมาซื้ออีก';
  return `${Math.floor(followers / 100) / 10}K+ ผู้ซื้อที่กลับมาซื้ออีก`;
}

function shipByLabel() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function mapSupportRows(rows: SupportMessage[]): ChatMsg[] {
  return rows.map((m) => ({
    id: m.id,
    from: m.sender === 'USER' ? 'buyer' : 'staff',
    text: m.message,
    created_at: m.timestamp,
  }));
}

export function ShopChatClient({ shopId }: { shopId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { auth } = useAuth();
  const buyerId = auth?.userId || 'guest';
  const embed = params.get('embed') === '1';
  const orderIdParam = params.get('order_id') || undefined;

  const productCtx = useMemo<ProductCtx | null>(() => {
    const productId = params.get('productId');
    const productTitle = params.get('productTitle');
    if (!productId || !productTitle) return null;
    return {
      id: productId,
      title: productTitle,
      priceMicro: Number(params.get('priceMicro') || 0),
      imageUrl: params.get('imageUrl') || undefined,
    };
  }, [params]);

  const [shop, setShop] = useState<ShopInfo | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [staffMode, setStaffMode] = useState(false);
  const [supportTicketId, setSupportTicketId] = useState<string | null>(null);
  const [supportBusy, setSupportBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [productPrompt, setProductPrompt] = useState(!!productCtx);
  const [productPinned, setProductPinned] = useState(false);
  const [faqFeedback, setFaqFeedback] = useState<'up' | 'down' | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const shopOrder = useMemo(() => {
    if (orderIdParam) {
      return orders.find((o) => String(o.order_id || o.id) === orderIdParam);
    }
    return orders.find((o) => String(o.merchant_id || '') === shopId);
  }, [orders, shopId, orderIdParam]);

  const loadThread = useCallback(async () => {
    const [shopRes, chatRes, orderRes] = await Promise.all([
      fetch(`/api/shop/${encodeURIComponent(shopId)}/detail?user_id=${encodeURIComponent(buyerId)}`, {
        cache: 'no-store',
      }),
      fetch(`/api/shop-chat/${encodeURIComponent(shopId)}?buyer_id=${encodeURIComponent(buyerId)}`, {
        cache: 'no-store',
      }),
      fetch(`/api/orders?buyer_id=${encodeURIComponent(buyerId)}`, { cache: 'no-store' }),
    ]);
    const shopJson = shopRes.ok ? await shopRes.json() : null;
    const chatJson = chatRes.ok ? await chatRes.json() : { messages: [] };
    const orderJson = orderRes.ok ? await orderRes.json() : { orders: [] };
    if (shopJson?.shop) setShop(shopJson.shop);
    else setShop({ id: shopId, name: shopId });
    if (!staffMode) setMessages(chatJson.messages || []);
    setOrders(orderJson.orders || []);
  }, [buyerId, shopId, staffMode]);

  const sendLocalText = useCallback(
    async (text: string) => {
      const res = await fetch(`/api/shop-chat/${encodeURIComponent(shopId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyer_id: buyerId, text }),
      });
      const data = await res.json();
      if (data.messages) setMessages(data.messages);
      else await loadThread();
    },
    [buyerId, loadThread, shopId],
  );

  const openSupportTicket = useCallback(
    async (message: string, subject?: string) => {
      const orderId = shopOrder ? String(shopOrder.order_id || shopOrder.id) : orderIdParam;
      setSupportBusy(true);
      try {
        const data = await createPlatformSupportTicket({
          channel: 'MKP',
          user_id: buyerId,
          subject: subject || `แชทร้าน ${shop?.name || shopId}`,
          message,
          order_id: orderId,
          merchant_id: shopId,
          shop_id: shopId,
        });
        setSupportTicketId(data.ticket.id);
        setStaffMode(true);
        const rows = await fetchSupportMessages(data.ticket.id);
        setMessages(mapSupportRows(rows.length ? rows : [data.message]));
      } catch {
        setStaffMode(true);
        await sendLocalText(message);
      } finally {
        setSupportBusy(false);
      }
    },
    [buyerId, orderIdParam, sendLocalText, shop?.name, shopId, shopOrder],
  );

  useEffect(() => {
    loadThread().finally(() => setLoading(false));
  }, [loadThread]);

  useEffect(() => {
    if (!supportTicketId) return;
    const poll = () => {
      void fetchSupportMessages(supportTicketId)
        .then((rows) => setMessages(mapSupportRows(rows)))
        .catch(() => undefined);
    };
    poll();
    const t = window.setInterval(poll, 5000);
    return () => window.clearInterval(t);
  }, [supportTicketId]);

  useEffect(() => {
    document.body.classList.add('tt-shop-chat-page');
    return () => document.body.classList.remove('tt-shop-chat-page');
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, staffMode, productPrompt]);

  const hrefWithEmbed = (path: string) => (embed ? `${path}${path.includes('?') ? '&' : '?'}embed=1` : path);

  const sendText = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      if (staffMode && supportTicketId) {
        const rows = await sendSupportMessage(supportTicketId, trimmed);
        setMessages(mapSupportRows(rows));
      } else if (staffMode) {
        await sendLocalText(trimmed);
      } else {
        await sendLocalText(trimmed);
      }
      setDraft('');
    } catch {
      /* ignore */
    } finally {
      setSending(false);
    }
  };

  const onFaqTap = (text: string) => {
    void sendText(text);
  };

  const onStaffChat = () => {
    void openSupportTicket('ต้องการแชทกับเจ้าหน้าที่ของร้านค้า / Customer Service');
  };

  const orderItem = shopOrder?.items?.[0];
  const orderQty = Array.isArray(shopOrder?.items)
    ? shopOrder.items.reduce((n: number, it: any) => n + (it.qty || 1), 0)
    : 0;
  const fsLabel = shopOrder?.fulfillment_status
    ? FULFILLMENT_LABELS[shopOrder.fulfillment_status] || shopOrder.fulfillment_status
    : 'ที่ต้องจัดส่ง';

  const displayProduct = productPinned && productCtx ? productCtx : null;
  const promptProduct = productPrompt && productCtx ? productCtx : null;

  return (
    <div className="tt-shop-chat">
      <header className="tt-shop-chat-header">
        <button type="button" className="tt-shop-chat-back" onClick={() => router.back()} aria-label="กลับ">
          ‹
        </button>
        <div className="tt-shop-chat-shop">
          <div className="tt-shop-chat-avatar">
            {shop?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shop.avatar_url} alt="" />
            ) : (
              <span>{(shop?.name || shopId).slice(0, 1)}</span>
            )}
          </div>
          <div className="tt-shop-chat-shop-meta">
            <strong>{shop?.name || shopId}</strong>
            <span className="tt-shop-chat-badge">
              <IconLuxAqondStore size={14} /> {repeatBuyerLabel(shop?.followers)}
            </span>
          </div>
        </div>
        <Link href={hrefWithEmbed(`/m/shop/${shopId}`)} className="tt-shop-chat-icon-btn" aria-label="ร้านค้า">
          <IconLuxAqondStore size={20} />
        </Link>
        <button
          type="button"
          className="tt-shop-chat-icon-btn"
          aria-label="เมนู"
          onClick={() => setMenuOpen((v) => !v)}
        >
          ⋮
        </button>
      </header>

      {menuOpen && (
        <div className="tt-shop-chat-menu-backdrop" onClick={() => setMenuOpen(false)}>
          <nav className="tt-shop-chat-menu" onClick={(e) => e.stopPropagation()}>
            <Link href={hrefWithEmbed(`/m/shop/${shopId}`)} onClick={() => setMenuOpen(false)}>
              ดูหน้าโปรไฟล์
            </Link>
            <Link href={hrefWithEmbed('/m/home')} onClick={() => setMenuOpen(false)}>
              กลับไปหน้าหลัก
            </Link>
            <Link href={hrefWithEmbed('/m/search')} onClick={() => setMenuOpen(false)}>
              ค้นหา
            </Link>
            <Link
              href={hrefWithEmbed(`/m/support?channel=MKP&shop_id=${encodeURIComponent(shopId)}`)}
              onClick={() => setMenuOpen(false)}
            >
              Customer Service (MKP)
            </Link>
          </nav>
        </div>
      )}

      {shopOrder && (
        <Link
          href={hrefWithEmbed(`/m/orders/${shopOrder.order_id || shopOrder.id}`)}
          className="tt-shop-chat-order-strip"
        >
          <div className="tt-shop-chat-order-thumb tt-mp-lux-tile-icon">
            <IconLuxToShip size={22} />
          </div>
          <div className="tt-shop-chat-order-text">
            <strong className="tt-shop-chat-order-status">{fsLabel}</strong>
            <span>
              {orderQty} ชิ้น, ยอดชำระเงิน:{' '}
              {formatCatalogPrice(shopOrder.amount_micro || shopOrder.total_micro || 0)}
            </span>
            <span>จัดส่งภายใน: {shipByLabel()}</span>
          </div>
          <span className="tt-shop-chat-order-more">รายละเอียด ›</span>
        </Link>
      )}

      <div className="tt-shop-chat-body" ref={scrollRef}>
        {loading && <p className="tt-loading">กำลังโหลดแชท...</p>}

        {!loading && (
          <>
            <div className="tt-shop-chat-date">วันนี้</div>

            {!staffMode && (
              <article className="tt-shop-chat-ai-card">
                <p className="tt-shop-chat-ai-title">คุณอาจต้องการถาม:</p>
                <ul className="tt-shop-chat-faq">
                  {FAQ_OPTIONS.map((opt) => {
                    const FaqIcon = opt.Icon;
                    return (
                      <li key={opt.text}>
                        <button type="button" onClick={() => onFaqTap(opt.text)}>
                          <span className="tt-shop-chat-faq-icon" aria-hidden>
                            <FaqIcon size={opt.id === 'track' ? 32 : 20} />
                          </span>
                          {opt.text}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <footer className="tt-shop-chat-ai-foot">
                  <span>ข้อความจาก AI ผู้ช่วยตอบแชท</span>
                  <time>{formatChatTime()}</time>
                </footer>
              </article>
            )}

            {!staffMode && (
              <div className="tt-shop-chat-staff-row">
                <button type="button" className="tt-shop-chat-staff-btn" onClick={onStaffChat} disabled={supportBusy}>
                  <span className="tt-shop-chat-staff-icon" aria-hidden>
                    <LuxuryHubIcon id="reviews" size={20} />
                  </span>
                  แชทกับเจ้าหน้าที่ของร้านค้า
                </button>
                <div className="tt-shop-chat-feedback">
                  <button
                    type="button"
                    className={faqFeedback === 'up' ? 'on' : ''}
                    aria-label="ชอบ"
                    onClick={() => setFaqFeedback('up')}
                  >
                    👍
                  </button>
                  <button
                    type="button"
                    className={faqFeedback === 'down' ? 'on' : ''}
                    aria-label="ไม่ชอบ"
                    onClick={() => {
                      setFaqFeedback('down');
                      void openSupportTicket('ต้องการความช่วยเหลือเพิ่มเติมจากเจ้าหน้าที่');
                    }}
                  >
                    👎
                  </button>
                </div>
              </div>
            )}

            {staffMode && (
              <p className="tt-shop-chat-staff-hint">
                เชื่อมต่อ Support Admin แล้ว (MKP){supportTicketId ? ` · ${supportTicketId}` : ''}
              </p>
            )}

            {messages.map((m) => (
              <div key={m.id} className={`tt-shop-chat-msg tt-shop-chat-msg-${m.from}`}>
                <p>{m.text}</p>
                <time>{formatChatTime(m.created_at)}</time>
              </div>
            ))}

            {displayProduct && (
              <div className="tt-shop-chat-context-card">
                <div className="tt-shop-chat-context-thumb">
                  {displayProduct.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={displayProduct.imageUrl} alt="" />
                  ) : (
                    <IconLuxToShip size={22} />
                  )}
                </div>
                <div>
                  <strong>{displayProduct.title}</strong>
                  <span>{formatCatalogPrice(displayProduct.priceMicro)}</span>
                </div>
              </div>
            )}

            <div className="tt-shop-chat-safety">
              <span className="tt-shop-chat-safety-icon" aria-hidden>
                <IconLuxShield size={18} />
              </span>
              <p>
                ทิปเพื่อความปลอดภัย: คุยและทำการสั่งซื้อให้เสร็จสมบูรณ์ใน AQOND เพื่อป้องกันการถูกโกง{' '}
                <Link href={hrefWithEmbed('/m/account')}>รายงานผู้ใช้</Link>
              </p>
            </div>
          </>
        )}
      </div>

      {promptProduct && (
        <div className="tt-shop-chat-product-prompt">
          <button
            type="button"
            className="tt-shop-chat-prompt-close"
            aria-label="ปิด"
            onClick={() => setProductPrompt(false)}
          >
            ×
          </button>
          <p>ต้องการสอบถามเกี่ยวกับสินค้านี้หรือไม่</p>
          <div className="tt-shop-chat-prompt-card">
            <div className="tt-shop-chat-prompt-thumb">
              {promptProduct.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={promptProduct.imageUrl} alt="" />
              ) : (
                <IconLuxToShip size={22} />
              )}
            </div>
            <div className="tt-shop-chat-prompt-info">
              <strong>{promptProduct.title}</strong>
              <span>{formatCatalogPrice(promptProduct.priceMicro)}</span>
            </div>
            <div className="tt-shop-chat-prompt-actions">
              <button type="button" onClick={() => setProductPrompt(false)}>
                ไม่
              </button>
              <button
                type="button"
                className="yes"
                onClick={() => {
                  setProductPinned(true);
                  setProductPrompt(false);
                  void sendText(`สอบถามเกี่ยวกับสินค้า: ${promptProduct.title}`);
                }}
              >
                ใช่
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="tt-shop-chat-input-bar">
        <button type="button" className="tt-shop-chat-input-icon" aria-label="แนบไฟล์">
          +
        </button>
        <button type="button" className="tt-shop-chat-input-icon" aria-label="สินค้า">
          <IconLuxBags size={20} />
        </button>
        <input
          className="tt-shop-chat-input"
          placeholder={staffMode ? 'พิมพ์ถึงเจ้าหน้าที่ Support' : 'พิมพ์ข้อความ'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void sendText(draft);
            }
          }}
        />
        <button type="button" className="tt-shop-chat-input-icon" aria-label="อีโมจิ">
          <IconLuxChat size={18} />
        </button>
        {draft.trim() && (
          <button
            type="button"
            className="tt-shop-chat-send"
            disabled={sending}
            onClick={() => void sendText(draft)}
          >
            ส่ง
          </button>
        )}
      </footer>
    </div>
  );
}
