'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { IconLuxChat } from '@/components/mobile/TtLuxuryIcons';

type Thread = {
  shop_id: string;
  last_message: string;
  last_at: string;
};

type Suggestion = {
  shop_id: string;
  merchant_name: string;
};

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

export function ShopChatsInboxClient() {
  const router = useRouter();
  const params = useSearchParams();
  const { auth } = useAuth();
  const buyerId = auth?.userId || 'guest';
  const embed = params.get('embed') === '1';
  const [threads, setThreads] = useState<Thread[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [shopNames, setShopNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const hrefWithEmbed = (path: string) => (embed ? `${path}${path.includes('?') ? '&' : '?'}embed=1` : path);

  useEffect(() => {
    fetch(`/api/shop-chat/inbox?buyer_id=${encodeURIComponent(buyerId)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then(async (data) => {
        const list: Thread[] = data.threads || [];
        setThreads(list);
        setSuggestions(data.suggestions || []);
        if (list.length === 1) {
          router.replace(`/m/chat/${encodeURIComponent(list[0].shop_id)}${embed ? '?embed=1' : ''}`);
          return;
        }
        const ids = [...new Set([...list.map((t) => t.shop_id), ...(data.suggestions || []).map((s: Suggestion) => s.shop_id)])];
        const names: Record<string, string> = {};
        await Promise.all(
          ids.map(async (id) => {
            try {
              const res = await fetch(`/api/shop/${encodeURIComponent(id)}/detail`, { cache: 'no-store' });
              if (res.ok) {
                const detail = await res.json();
                if (detail?.shop?.name) names[id] = detail.shop.name;
              }
            } catch {
              /* ignore */
            }
            if (!names[id]) names[id] = id;
          }),
        );
        setShopNames(names);
      })
      .catch(() => {
        setThreads([]);
        setSuggestions([]);
      })
      .finally(() => setLoading(false));
  }, [buyerId, embed, router]);

  return (
    <div className="tt-shop-chats">
      <header className="tt-shop-chats-header">
        <button type="button" className="tt-shop-chat-back" onClick={() => router.back()} aria-label="กลับ">
          ‹
        </button>
        <h1>แชท</h1>
      </header>

      {loading && <p className="tt-loading">กำลังโหลด...</p>}

      {!loading && threads.length === 0 && suggestions.length === 0 && (
        <div className="tt-shop-chats-empty">
          <div className="tt-shop-chats-empty-icon">
            <IconLuxChat size={40} />
          </div>
          <p>ยังไม่มีการสนทนา</p>
          <span>เริ่มแชทจากหน้าสินค้าหรือคำสั่งซื้อ</span>
          <Link href={hrefWithEmbed('/m/home')} className="tt-btn-primary">
            ไปช้อปสินค้า
          </Link>
        </div>
      )}

      {!loading && (threads.length > 0 || suggestions.length > 0) && (
        <ul className="tt-shop-chats-list">
          {threads.map((t) => (
            <li key={t.shop_id}>
              <Link href={hrefWithEmbed(`/m/chat/${encodeURIComponent(t.shop_id)}`)} className="tt-shop-chats-item">
                <div className="tt-shop-chats-avatar">{(shopNames[t.shop_id] || t.shop_id).slice(0, 1)}</div>
                <div className="tt-shop-chats-meta">
                  <strong>{shopNames[t.shop_id] || t.shop_id}</strong>
                  <span>{t.last_message}</span>
                </div>
                <time>{formatTime(t.last_at)}</time>
              </Link>
            </li>
          ))}
          {threads.length === 0 &&
            suggestions.map((s) => (
              <li key={s.shop_id}>
                <Link href={hrefWithEmbed(`/m/chat/${encodeURIComponent(s.shop_id)}`)} className="tt-shop-chats-item">
                  <div className="tt-shop-chats-avatar">{(s.merchant_name || s.shop_id).slice(0, 1)}</div>
                  <div className="tt-shop-chats-meta">
                    <strong>{s.merchant_name || shopNames[s.shop_id] || s.shop_id}</strong>
                    <span>แชทกับร้านค้าจากคำสั่งซื้อ</span>
                  </div>
                </Link>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
