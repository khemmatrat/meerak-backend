'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { bffGet } from '@/lib/bff';
import { useAuth } from '@/lib/auth';
import {
  buildAffiliateCaption,
  fetchPinnedProducts,
  fetchStudioHealth,
  getCreatorId,
  pinToBasket,
  pinnedProductsForVideo,
  unpinFromBasket,
  type PinnedProduct,
  type StudioHealth,
} from '@/lib/affiliate';
import { formatCatalogPrice } from '@/lib/format';

type Product = {
  id: string;
  title?: string;
  name?: string;
  price_micro?: number;
  merchant_hint?: string;
  category?: string;
};

export default function MobileStudioPage() {
  const { auth } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const creatorId = getCreatorId(auth);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [pinned, setPinned] = useState<PinnedProduct[]>([]);
  const [productId, setProductId] = useState('');
  const [caption, setCaption] = useState('');
  const [pinBusy, setPinBusy] = useState('');
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'processing' | 'publishing' | 'done'>('idle');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [mediaId, setMediaId] = useState('');
  const [mediaLocal, setMediaLocal] = useState(false);
  const [studio, setStudio] = useState<any>(null);
  const [health, setHealth] = useState<StudioHealth | null>(null);

  const refreshPinned = useCallback(async () => {
    const list = await fetchPinnedProducts(creatorId);
    setPinned(list);
    if (list.length && !list.some((p) => p.productId === productId)) {
      setProductId(list[0].productId);
    }
  }, [creatorId, productId]);

  useEffect(() => {
    refreshPinned();
    fetchStudioHealth().then(setHealth);
  }, [refreshPinned]);

  useEffect(() => {
    bffGet<any>('/v1/home')
      .then((d) => setCatalog(d.products?.products || []))
      .catch(() => setCatalog([]));
    if (auth) {
      bffGet('/v1/creator/studio', auth).then(setStudio).catch(() => setStudio(null));
    }
  }, [auth]);

  const videoProducts = pinnedProductsForVideo(creatorId);

  const onPin = async (product: Product) => {
    setPinBusy(product.id);
    setError('');
    try {
      const entry = await pinToBasket(creatorId, product);
      await refreshPinned();
      setProductId(entry.productId);
      setStatus(
        entry.syncedRecsys
          ? `ปักตะกร้า + Affiliate (recsys) ✓`
          : `ปักตะกร้าแล้ว (local — sync เมื่อ recsys ขึ้น)`,
      );
    } catch (e: any) {
      setError(e.message || 'ปักตะกร้าไม่สำเร็จ');
    } finally {
      setPinBusy('');
    }
  };

  const onUnpin = async (pid: string) => {
    await unpinFromBasket(creatorId, pid);
    await refreshPinned();
    setStatus('ยกเลิกปักตะกร้าแล้ว');
  };

  const publishPost = async (mid: string, local: boolean) => {
    if (!productId) throw new Error('เลือกสินค้าที่ปักตะกร้าแล้วเท่านั้น');
    const hit = pinned.find((p) => p.productId === productId);
    if (!hit) throw new Error('สินค้านี้ยังไม่ได้ปักตะกร้า Affiliate');

    const res = await fetch('/api/studio/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        author_id: creatorId,
        media_id: mid,
        caption: buildAffiliateCaption(
          caption || hit.title || 'วิดีโอใหม่จาก Creator Studio',
          creatorId,
          productId,
        ),
        product_id: productId,
        media_local: local,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || data.error || 'เผยแพร่ไม่สำเร็จ');
    return data;
  };

  const onVideo = async (file?: File | null) => {
    if (!file) return;
    if (videoProducts.length === 0) {
      setError('ปักสินค้าในตะกร้า Affiliate ก่อนอัปโหลดวิดีโอ');
      return;
    }
    if (!productId || !pinned.some((p) => p.productId === productId)) {
      setError('เลือกสินค้าที่ปักตะกร้าแล้วเท่านั้น');
      return;
    }

    setError('');
    setPhase('uploading');
    setStatus('กำลังอัปโหลด...');

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('author_id', creatorId);

      const res = await fetch('/api/studio/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || 'อัปโหลดไม่สำเร็จ');

      setMediaId(data.media_id);
      setMediaLocal(data.mode === 'local');

      if (data.mode === 'video-svc' && data.status === 'processing') {
        setPhase('processing');
        setStatus('กำลังประมวลผลวิดีโอ (video-svc)...');
        let ready = false;
        for (let i = 0; i < 30; i += 1) {
          await new Promise((r) => setTimeout(r, 2000));
          const poll = await fetch(`/api/video/v1/media/${data.media_id}`, { cache: 'no-store' });
          if (!poll.ok) continue;
          const meta = await poll.json();
          setStatus(`สถานะวิดีโอ: ${meta.status}`);
          if (meta.status === 'ready' || meta.status === 'published') {
            ready = true;
            break;
          }
          if (meta.status === 'rejected') throw new Error('วิดีโอถูกปฏิเสธจาก moderation');
        }
        if (!ready) throw new Error('วิดีโอยังประมวลผลไม่เสร็จ — ลองใหม่หรือรอ transcode-worker');
      } else if (data.mode === 'local') {
        setStatus('เก็บวิดีโอ local แล้ว (video-svc ยังไม่ขึ้น — ดูใน Feed ได้ทันที)');
      }

      setPhase('publishing');
      setStatus('กำลังเผยแพร่ไป Feed...');
      const pub = await publishPost(data.media_id, data.mode === 'local');
      setPhase('done');
      setStatus(
        pub.mode === 'feed-svc'
          ? 'เผยแพร่แล้ว (feed-svc) — ร้านได้เครดิต Affiliate เมื่อมีคนซื้อ'
          : 'เผยแพร่แล้ว (local feed) — sync feed-svc เมื่อ stack ขึ้น',
      );
    } catch (e: any) {
      setError(e.message || 'เกิดข้อผิดพลาด');
      setPhase('idle');
    }
  };

  return (
    <>
      <header className="tt-header">
        <div className="tt-header-row">
          <Link href="/m/account" className="tt-back" aria-label="กลับ">‹</Link>
          <span style={{ flex: 1, fontWeight: 700 }}>Creator Studio</span>
        </div>
      </header>

      <div className="tt-sell-hero">
        <div className="tt-sell-icon" aria-hidden>🎬</div>
        <h1>Creator Studio + Affiliate</h1>
        <p>Creator ID: <code className="tt-code">{creatorId.slice(0, 20)}…</code></p>
      </div>

      {health && (
        <div className="tt-studio-health">
          <span className={health.feed_svc ? 'ok' : 'off'}>Feed {health.feed_svc ? '✓' : '—'}</span>
          <span className={health.video_svc ? 'ok' : 'off'}>Video {health.video_svc ? '✓' : 'local'}</span>
          <span className={health.recsys_svc ? 'ok' : 'off'}>Affiliate {health.recsys_svc ? '✓' : 'local'}</span>
        </div>
      )}

      {studio && (
        <div className="tt-studio-stats">
          <span>👁 {studio.analytics?.views ?? 0}</span>
          <span>💰 {formatCatalogPrice(studio.analytics?.revenue_micro || 0)}</span>
          <span>🛒 {pinned.length} ปักตะกร้า</span>
        </div>
      )}

      <section className="tt-studio-section">
        <h2 className="tt-section-title">ปักตะกร้า Affiliate</h2>
        <p className="tt-hint" style={{ padding: '0 16px 8px' }}>
          เฉพาะสินค้าที่ปักแล้วเท่านั้นที่ใช้ในวิดีโอได้ — ร้านจ่ายค่าคอมเมื่อมีคนซื้อจาก Feed ของคุณ
        </p>

        {pinned.length > 0 && (
          <div className="tt-pin-list">
            {pinned.map((p) => (
              <div key={p.productId} className="tt-pin-item tt-pin-item-active">
                <div>
                  <strong>{p.title}</strong>
                  <p className="tt-hint">
                    ค่าคอม {((p.commissionBps || 500) / 100).toFixed(1)}%
                    {p.syncedRecsys ? ' · recsys ✓' : ' · local'}
                  </p>
                </div>
                <button type="button" className="tt-btn-ghost" onClick={() => onUnpin(p.productId)}>
                  ยกเลิก
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="tt-pin-catalog">
          {catalog.slice(0, 20).map((p) => {
            const active = pinned.some((x) => x.productId === p.id);
            return (
              <div key={p.id} className="tt-pin-item">
                <div>
                  <strong>{p.title || p.name}</strong>
                  <p className="tt-hint">{formatCatalogPrice(p.price_micro || 0)}</p>
                </div>
                {active ? (
                  <span className="tt-pin-badge">ปักแล้ว ✓</span>
                ) : (
                  <button
                    type="button"
                    className="tt-btn-sm"
                    disabled={pinBusy === p.id}
                    onClick={() => onPin(p)}
                  >
                    {pinBusy === p.id ? '...' : 'ปักตะกร้า'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="tt-sell-form">
        <label className="tt-label" htmlFor="caption">คำบรรยายวิดีโอ</label>
        <input
          id="caption"
          className="tt-input"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="บอกเล่าเกี่ยวกับสินค้า..."
        />

        <label className="tt-label" htmlFor="product">สินค้าในวิดีโอ (จากตะกร้าที่ปัก)</label>
        <select
          id="product"
          className="tt-input"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          disabled={videoProducts.length === 0}
        >
          {videoProducts.length === 0 && <option value="">— ปักสินค้าก่อน —</option>}
          {videoProducts.map((p) => (
            <option key={p.productId} value={p.productId}>{p.title}</option>
          ))}
        </select>

        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          hidden
          onChange={(e) => onVideo(e.target.files?.[0])}
        />

        <button
          type="button"
          className="tt-btn-primary tt-btn-glow"
          disabled={(phase !== 'idle' && phase !== 'done') || videoProducts.length === 0}
          onClick={() => inputRef.current?.click()}
        >
          {phase === 'uploading' && '⬆️ กำลังอัปโหลด...'}
          {phase === 'processing' && '⚙️ กำลังประมวลผล...'}
          {phase === 'publishing' && '📤 กำลังเผยแพร่...'}
          {(phase === 'idle' || phase === 'done') && '📹 อัปโหลดวิดีโอ + ปักสินค้า'}
        </button>

        {status && <p className="tt-hint">{status}</p>}
        {mediaId && phase === 'done' && (
          <Link href="/m/feed" className="tt-btn-sm" style={{ display: 'inline-block', marginTop: 8 }}>
            ดูใน Feed → {mediaLocal ? '(local video)' : ''}
          </Link>
        )}
      </div>

      {error && <p className="tt-error" style={{ margin: '0 16px' }}>{error}</p>}

      <div className="tt-sell-tools">
        <h2 className="tt-section-title">Production stack</h2>
        <p className="tt-hint" style={{ padding: '0 16px' }}>
          รัน feed + video + recsys:{' '}
          <code className="tt-code">pwsh -File infra/scripts/dev-up-feed.ps1</code>
        </p>
        <Link href="/m/sell" className="tt-tool-card">
          <span>✨</span>
          <div>
            <strong>ลงสินค้าด้วย AI</strong>
            <p>Hermes วิเคราะห์รูป → สร้าง listing</p>
          </div>
        </Link>
      </div>
    </>
  );
}
