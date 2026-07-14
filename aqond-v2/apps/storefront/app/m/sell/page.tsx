'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';

function compressImage(file: File, maxPx = 768) {
  return new Promise<string>((resolve, reject) => {
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
}

export default function MobileSellPage() {
  const { auth } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);
  const [hint, setHint] = useState('');

  const onUpload = async (file?: File | null) => {
    if (!file) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const b64 = await compressImage(file);
      const res = await fetch('/api/ai/onboard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(auth?.userId ? { 'X-User-Id': auth.userId } : {}),
        },
        body: JSON.stringify({
          image_base64: b64,
          merchant_hint: hint,
          merchant_id: auth?.userId || `seller-${Date.now()}`,
          user_id: auth?.userId,
          store_name: hint || undefined,
          publish: true,
        }),
      });
      let data: any = {};
      try {
        data = await res.json();
      } catch {
        throw new Error(res.status === 502 ? 'เซิร์ฟเวอร์ไม่ตอบ — ลองใหม่' : 'ลงสินค้าไม่สำเร็จ');
      }
      if (!res.ok) {
        const msg =
          data.detail === 'Unauthorized'
            ? 'ไม่มีสิทธิ์ลงสินค้า — ลองเข้าสู่ระบบใหม่ หรือรัน storefront-dev.ps1 ให้โหลด JWT'
            : data.detail || data.hint || data.error || 'ลงสินค้าไม่สำเร็จ';
        throw new Error(msg);
      }
      setResult(data);
    } catch (e: any) {
      setError(e.message || 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <header className="tt-header">
        <div className="tt-header-row">
          <Link href="/m/account" className="tt-back" aria-label="กลับ">‹</Link>
          <span style={{ flex: 1, fontWeight: 700 }}>เริ่มการขาย</span>
        </div>
      </header>

      <div className="tt-sell-hero">
        <div className="tt-sell-icon" aria-hidden>✨</div>
        <h1>ลงสินค้าด้วย Hermes AI</h1>
        <p>ถ่ายรูปสินค้า → MinIO → Hermes optimize → ลงร้าน + index</p>
      </div>

      {!auth && (
        <p className="tt-modal-desc" style={{ padding: '0 16px' }}>
          <Link href="/login" className="tt-link-accent">เข้าสู่ระบบ</Link> เพื่อผูกร้านกับบัญชี (หรือลองแบบ guest ได้)
        </p>
      )}

      <div className="tt-sell-form">
        <label className="tt-label" htmlFor="hint">คำใบ้สินค้า (แนะนำ — ใช้เมื่อ AI ไม่พร้อม)</label>
        <input
          id="hint"
          className="tt-input"
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          placeholder="เช่น ครีมกันแดด SPF50 ราคา 299 บาท"
        />

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => onUpload(e.target.files?.[0])}
        />

        <button
          type="button"
          className="tt-btn-primary tt-btn-glow"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
        >
          {loading ? '🤖 กำลังลงสินค้า...' : '📷 ถ่ายรูป / เลือกรูปสินค้า'}
        </button>

        <p className="tt-hint">AI vision ถ้าพร้อม (~1 นาที) · ไม่พร้อมใช้ rules จากคำใบ้ทันที</p>
      </div>

      {error && <p className="tt-error" style={{ margin: '0 16px' }}>{error}</p>}

      {result?.product && (
        <div className="tt-ai-box" style={{ margin: '16px' }}>
          <strong>✓ ลงสินค้าสำเร็จ</strong>
          {result.ai_note && <p className="tt-warn">{result.ai_note}</p>}
          {result.media?.url && (
            <img
              src={result.media.url}
              alt=""
              style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 8, marginTop: 8 }}
            />
          )}
          <p>{result.product.title}</p>
          {result.ai_mode && (
            <p className="tt-ai-query">โหมด: {result.ai_mode === 'vision' ? 'AI vision' : 'Hermes rules'}</p>
          )}
          {result.hermes?.source && (
            <p className="tt-ai-query">Hermes: {result.hermes.source} · score {result.hermes.score ?? '—'}</p>
          )}
          {result.indexed && (
            <p className="tt-hint">
              Index: embedding {result.indexed.embedding ? '✓' : '—'} · search {result.indexed.search ? '✓' : '—'}
            </p>
          )}
          <Link href={`/m/product/${result.product.id}`} className="tt-btn-sm" style={{ display: 'inline-block', marginTop: 8 }}>
            ดูสินค้าในร้าน →
          </Link>
          <Link href="/m/home" className="tt-link-sm" style={{ display: 'block', marginTop: 8 }}>
            กลับหน้าร้าน
          </Link>
        </div>
      )}

      <div className="tt-sell-tools">
        <h2 className="tt-section-title">เครื่องมือผู้ขาย</h2>
        <Link href="/m/studio" className="tt-tool-card">
          <span>🎬</span>
          <div>
            <strong>Creator Studio</strong>
            <p>อัปโหลดวิดีโอ · ปักสินค้า · Feed</p>
          </div>
        </Link>
        <Link href="/m/creator/earnings" className="tt-tool-card">
          <span>💰</span>
          <div>
            <strong>รายได้ Affiliate</strong>
            <p>คลิก · conversion · payout</p>
          </div>
        </Link>
      </div>
    </>
  );
}
