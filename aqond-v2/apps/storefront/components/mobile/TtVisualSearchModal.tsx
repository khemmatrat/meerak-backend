'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { bffPost } from '@/lib/bff';
import { useAuth } from '@/lib/auth';
import { type TtProduct } from '@/components/mobile/TtProductGrid';
import { formatCatalogPrice } from '@/lib/format';
import { IconLuxCamera } from '@/components/mobile/TtLuxuryIcons';

type Props = {
  open: boolean;
  onClose: () => void;
  /** search = browse results; order = add to cart */
  uiMode?: 'search' | 'order';
  title?: string;
  category?: string;
};

export function TtVisualSearchModal(props: Props) {
  const uiMode = props.uiMode ?? 'search';
  const title = props.title ?? 'ค้นหาจากรูปภาพ';
  const { open, onClose, category } = props;

  const { auth } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [warn, setWarn] = useState('');
  const [vision, setVision] = useState('');
  const [query, setQuery] = useState('');
  const [retrievalMode, setRetrievalMode] = useState<'recsys' | 'text' | ''>('');
  const [products, setProducts] = useState<TtProduct[]>([]);
  const [adding, setAdding] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add('tt-modal-open');
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.classList.remove('tt-modal-open');
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !mounted) return null;

  const compressImage = (file: File, maxPx = 512) =>
    new Promise<string>((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('โหลดรูปไม่สำเร็จ'));
      };
      img.src = url;
    });

  const friendlyAiError = (msg: string) => {
    if (/0xc0000006|llama-server|inference_failed|ollama chat failed/i.test(msg)) {
      return 'Ollama หมด RAM/ดิสก์ — ปิดแอปอื่น แล้ว restart Ollama (tray) + ai-core-local.ps1';
    }
    if (msg === 'vision_failed' || msg === 'ai_unreachable') {
      return 'AI ยังไม่พร้อม — รัน: pwsh -File infra/scripts/ai-core-local.ps1';
    }
    return msg;
  };

  const onPick = async (file?: File | null) => {
    if (!file) return;
    setLoading(true);
    setError('');
    setWarn('');
    setProducts([]);
    setAdded(null);
    setRetrievalMode('');
    try {
      const b64 = await compressImage(file);
      const res = await fetch('/api/ai/visual-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: b64, category }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.detail || data.error || 'ค้นหาไม่สำเร็จ';
        throw new Error(friendlyAiError(msg));
      }
      setVision(data.vision_description || '');
      setQuery(data.query || '');
      setRetrievalMode(data.mode || 'text');
      setProducts(data.products || []);
      if (data.fallback) {
        setWarn(
          data.mode === 'recsys'
            ? 'AI ไม่พร้อม — ใช้ recsys embedding จากรูป (restart Ollama + ai-core-local.ps1 เพื่อ vision เต็มรูปแบบ)'
            : 'AI/recsys ไม่พร้อม — แสดงสินค้าแนะนำจากหมวดนี้',
        );
      } else if (data.mode === 'recsys') {
        setWarn('');
      }
    } catch (e: any) {
      setError(friendlyAiError(e.message || 'เกิดข้อผิดพลาด'));
    } finally {
      setLoading(false);
    }
  };

  const addToCart = async (p: TtProduct) => {
    setAdding(p.id);
    setError('');
    setWarn('');
    const owner = auth?.userId || 'guest';
    try {
      await bffPost('/v1/cart/items', {
        owner_id: owner,
        product_id: p.id,
        title: p.title || p.name || 'สินค้า',
        qty: 1,
        unit_price_micro: p.price_micro || 19900,
      }, auth);
      setAdded(p.id);
    } catch (e: any) {
      setError(e.message || 'เพิ่มรถเข็นไม่สำเร็จ');
    } finally {
      setAdding(null);
    }
  };

  return createPortal(
    <div className="tt-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className={`tt-modal-sheet${products.length > 0 ? ' tt-modal-sheet-expanded' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="tt-modal-handle" />
        <div className="tt-modal-header">
          <h2>{title}</h2>
          <button type="button" className="tt-modal-close" onClick={onClose} aria-label="ปิด">×</button>
        </div>

        <div className="tt-modal-body">
          <p className="tt-modal-desc">
            {uiMode === 'order'
              ? 'ถ่ายรูปสินค้า — Hermes AI จะหาในร้านและเพิ่มลงรถเข็นได้'
              : 'อัปโหลดรูป — AI วิเคราะห์และแสดงสินค้าที่ใกล้เคียง'}
          </p>

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => onPick(e.target.files?.[0])}
          />

          <button type="button" className="tt-btn-primary tt-visual-search-pick" onClick={() => inputRef.current?.click()} disabled={loading}>
            {loading ? (
              'กำลังวิเคราะห์... (อาจใช้ 1–3 นาที)'
            ) : (
              <>
                <IconLuxCamera size={20} /> เลือกรูป / ถ่ายภาพ
              </>
            )}
          </button>

          {warn && <p className="tt-warn">{warn}</p>}
          {error && <p className="tt-error">{error}</p>}

          {vision && (
            <div className="tt-ai-box">
              <strong>Hermes เห็นว่า:</strong>
              <p>{vision.slice(0, 280)}{vision.length > 280 ? '…' : ''}</p>
              {query && <p className="tt-ai-query">คำค้น: {query}</p>}
              {retrievalMode === 'recsys' && <p className="tt-ai-query">ค้นหา: recsys embedding</p>}
            </div>
          )}

          {products.length > 0 && (
            <>
              <h3 className="tt-section-title" style={{ paddingLeft: 0 }}>
                {uiMode === 'order' ? 'เลือกสินค้าเพื่อสั่ง' : 'ผลลัพธ์'}
              </h3>
              <div className="tt-grid">
                {products.map((p) => (
                  <div key={p.id} className="tt-card tt-card-static">
                    <div className="tt-card-body">
                      <p className="tt-card-title">{p.title || p.name}</p>
                      <p className="tt-price">{formatCatalogPrice(p.price_micro || 0)}</p>
                      {uiMode === 'order' && (
                        <button
                          type="button"
                          className="tt-btn-sm"
                          disabled={adding === p.id}
                          onClick={() => addToCart(p)}
                        >
                          {added === p.id ? '✓ ใส่รถเข็นแล้ว' : adding === p.id ? '...' : 'ใส่รถเข็น'}
                        </button>
                      )}
                      {uiMode === 'search' && (
                        <a href={`/m/product/${p.id}`} className="tt-link-sm">ดูสินค้า →</a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
