'use client';

import { useCallback, useEffect, useState } from 'react';
import { FOOD_GEN_STYLES } from '@/lib/merchantAdProductConstants';
import {
  fetchAdProductDraft,
  linkAdJobProduct,
  mapAdStudioError,
  saveMerchantProduct,
  type AdProductDraft,
  type AdVideoJob,
} from '@/lib/merchantAdVideo';
import { useMerchantAdJobs } from '@/components/mobile/MerchantAdJobProvider';
import { publishProgressPct } from '@/lib/merchantAdBackgroundJob';
import { retryPublishInBackground, runPublishInBackground } from '@/lib/merchantAdPublishRunner';

type Props = {
  job: AdVideoJob;
  merchantId: string;
  merchantName: string;
  isFoodMerchant: boolean;
  categoryStyle: string;
  visualNotes: string;
  busy: boolean;
  onBusy: (v: boolean) => void;
  onMessage: (msg: string) => void;
  onError: (err: string) => void;
  onReload: () => Promise<void>;
  onCancelTrack?: (jobId: string) => void;
};

function engineLabel(engine?: string, jobId?: string) {
  if (jobId?.startsWith('mad-') || engine?.includes('grok')) return '✨ AI วิดีโอ (Grok)';
  if (engine === 'kenburns-fast' || engine === 'kenburns') return 'ภาพนิ่ง (โหมดทดสอบ)';
  return engine || '';
}

function statusLabel(status: string) {
  if (status === 'published') return 'เผยแพร่แล้ว';
  if (status === 'completed') return 'พร้อมเผยแพร่';
  if (status === 'generating') return 'กำลังสร้าง…';
  if (status === 'failed') return 'สร้างไม่สำเร็จ';
  return status;
}

export function AdClipProductCard({
  job,
  merchantId,
  merchantName,
  isFoodMerchant,
  categoryStyle,
  visualNotes,
  busy,
  onBusy,
  onMessage,
  onError,
  onReload,
  onCancelTrack,
}: Props) {
  const { publishEntryForJob } = useMerchantAdJobs();
  const publishEntry = publishEntryForJob(job.id);
  const publishMeta = publishEntry?.meta;
  const isPublishing = publishMeta?.publishStatus === 'publishing';
  const publishFailed = publishMeta?.publishStatus === 'failed';
  const publishPct = publishMeta ? publishProgressPct(publishMeta) : 0;

  const hasProduct = Boolean(job.product_id);
  const isPublished = job.status === 'published';
  const showProductForm = job.status === 'completed' || job.status === 'published';

  const [title, setTitle] = useState(job.product_title || '');
  const [benefits, setBenefits] = useState('');
  const [description, setDescription] = useState('');
  const [sizeGuide, setSizeGuide] = useState('');
  const [priceThb, setPriceThb] = useState('');
  const [stock, setStock] = useState('');
  const [foodStyle, setFoodStyle] = useState('fresh');
  const [aiLoading, setAiLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [publishTick, setPublishTick] = useState(0);

  useEffect(() => {
    if (!isPublishing) return;
    const t = setInterval(() => setPublishTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [isPublishing]);

  void publishTick;

  const applyDraft = useCallback((draft: AdProductDraft) => {
    setTitle(draft.title);
    setBenefits(draft.benefits);
    setDescription(draft.description);
    if (draft.size_guide) setSizeGuide(draft.size_guide);
    setPriceThb(String(draft.price_thb));
    setStock(String(draft.stock));
    if (draft.food_style) setFoodStyle(draft.food_style);
  }, []);

  useEffect(() => {
    if (!showProductForm) return;
    let cancelled = false;

    async function load() {
      if (job.product_id) {
        try {
          const res = await fetch(
            `/api/merchant/products?merchant_id=${encodeURIComponent(merchantId)}&product_id=${encodeURIComponent(job.product_id!)}`,
            { cache: 'no-store' },
          );
          if (res.ok) {
            const data = await res.json();
            const p = data.product;
            if (!cancelled && p) {
              setTitle(p.title || job.product_title);
              setBenefits(p.benefits || '');
              setDescription(p.description || '');
              setSizeGuide(p.size_guide || '');
              setPriceThb(String(Math.round((p.price_micro || 19900) / 100)));
              setStock(String(p.stock ?? 10));
              setLoaded(true);
              return;
            }
          }
        } catch {
          /* fall through */
        }
      }
      if (!cancelled) {
        setTitle(job.product_title || '');
        setLoaded(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [job.product_id, job.product_title, merchantId, showProductForm]);

  const onAiGenerate = async () => {
    setAiLoading(true);
    onError('');
    try {
      const draft = await fetchAdProductDraft({
        product_title: title || job.product_title,
        visual_notes: visualNotes,
        category_style: categoryStyle,
        is_food: isFoodMerchant,
        food_style: foodStyle,
        image_url: job.product_image_url || job.output_poster_url,
      });
      applyDraft(draft);
      onMessage(draft.source === 'vision' ? '🤖 AI วิเคราะห์จากรูปแล้ว' : '🤖 AI คิดรายละเอียดให้แล้ว');
    } catch (e) {
      onError(e instanceof Error ? e.message : 'AI สร้างรายละเอียดไม่สำเร็จ');
    } finally {
      setAiLoading(false);
    }
  };

  const buildProductPayload = () => {
    const price = Number(priceThb);
    if (!title.trim()) throw new Error('กรุณาใส่ชื่อสินค้า');
    if (!Number.isFinite(price) || price <= 0) throw new Error('กรุณาใส่ราคาที่ถูกต้อง');
    return {
      product_id: job.product_id,
      title: title.trim(),
      benefits: benefits.trim(),
      description: description.trim(),
      size_guide: sizeGuide.trim() || undefined,
      price_thb: price,
      stock: Math.max(0, Number(stock) || 0),
      category: isFoodMerchant ? 'food' : categoryStyle,
      image_url: job.product_image_url || job.output_poster_url,
    };
  };

  const saveProduct = async () => {
    const payload = buildProductPayload();
    const product = await saveMerchantProduct({
      merchant_id: merchantId,
      ...payload,
      product_video_url: job.output_video_url || undefined,
    });

    if (!job.product_id) {
      await linkAdJobProduct(job.id, {
        product_id: product.id,
        product_title: product.title,
      });
    }

    return product;
  };

  const onAddProduct = async () => {
    onBusy(true);
    onError('');
    try {
      await saveProduct();
      onMessage(
        isPublished
          ? 'บันทึกสินค้าในร้านแล้ว — ดูได้ที่แท็บสินค้าและหน้าแรก'
          : 'เพิ่มสินค้าแล้ว — กดเผยแพร่เพื่อโพสต์คลิปให้ลูกค้าเห็น',
      );
      await onReload();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'เพิ่มสินค้าไม่สำเร็จ');
    } finally {
      onBusy(false);
    }
  };

  const onPublish = () => {
    onError('');
    try {
      const payload = buildProductPayload();
      void runPublishInBackground({
        jobId: job.id,
        merchantId,
        merchantName,
        productTitle: title.trim() || job.product_title || 'สินค้า',
        product: payload,
        onComplete: () => {
          onMessage('เผยแพร่แล้ว — สินค้าขึ้นร้านและหน้าแรกแล้ว');
          void onReload();
        },
        onFail: (message) => onError(message),
      });
      onMessage('กำลังเผยแพร่เบื้องหลัง…');
    } catch (e) {
      onError(mapAdStudioError(e));
    }
  };

  const onRetryPublish = () => {
    onError('');
    void retryPublishInBackground(job.id, {
      onComplete: () => {
        onMessage('เผยแพร่แล้ว — สินค้าขึ้นร้านและหน้าแรกแล้ว');
        void onReload();
      },
      onFail: (message) => onError(message),
    });
    onMessage('กำลังเผยแพร่อีกครั้ง…');
  };

  return (
    <article className="tt-merchant-ad-clip-card">
      <header className="tt-merchant-ad-clip-header">
        <h3 className="tt-merchant-ad-clip-title">สินค้าของฉัน</h3>
        <p className={`tt-merchant-ad-clip-status${isPublished ? ' is-published' : ''}`}>
          {isPublishing ? `กำลังเผยแพร่… ${publishPct}%` : statusLabel(job.status)}
        </p>
        {publishFailed && (
          <p className="tt-order-action-msg tt-merchant-ad-publish-err">
            {publishMeta?.publishError || 'เผยแพร่ไม่สำเร็จ'}
          </p>
        )}
        <p className="tt-merchant-ad-clip-meta">
          {engineLabel(job.video_engine, job.id)}
          {' · '}
          {new Date(job.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
        </p>
      </header>

      {job.output_video_url && (job.status === 'completed' || job.status === 'published') && (
        <div className="tt-merchant-ad-clip-video-wrap">
          <video
            className="tt-merchant-ad-video"
            src={job.output_video_url}
            controls
            playsInline
            poster={job.output_poster_url}
          />
        </div>
      )}

      {showProductForm && loaded && (
        <section className="tt-merchant-ad-product-form">
          {isFoodMerchant && (
            <div className="tt-merchant-ad-food-styles">
              <span className="tt-merchant-ad-form-label">ลักษณะการเขียน (อาหาร)</span>
              <div className="tt-merchant-ad-style-chips">
                {FOOD_GEN_STYLES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`tt-merchant-ad-style-chip${foodStyle === s.id ? ' is-on' : ''}`}
                    onClick={() => setFoodStyle(s.id)}
                  >
                    <span className="tt-merchant-ad-style-emoji">{s.emoji}</span>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            className="tt-btn-ghost tt-merchant-ad-ai-btn"
            disabled={busy || aiLoading}
            onClick={() => void onAiGenerate()}
          >
            {aiLoading ? '⏳ AI กำลังคิด…' : '🤖 AI คิดชื่อ · สรรพคุณ · รายละเอียดให้'}
          </button>

          <label className="tt-merchant-ad-form-field">
            <span>ชื่อสินค้า</span>
            <input className="tt-input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>

          <label className="tt-merchant-ad-form-field">
            <span>สรรพคุณ</span>
            <textarea
              className="tt-input tt-merchant-ad-textarea"
              rows={2}
              value={benefits}
              onChange={(e) => setBenefits(e.target.value)}
              placeholder="จุดเด่นที่ลูกค้าสนใจ"
            />
          </label>

          <label className="tt-merchant-ad-form-field">
            <span>รายละเอียดสินค้า</span>
            <textarea
              className="tt-input tt-merchant-ad-textarea"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          {(categoryStyle === 'fashion' || sizeGuide) && (
            <label className="tt-merchant-ad-form-field">
              <span>แนะนำไซส์</span>
              <input
                className="tt-input"
                value={sizeGuide}
                onChange={(e) => setSizeGuide(e.target.value)}
                placeholder="เช่น S–XL (แนะนำ M)"
              />
            </label>
          )}

          <div className="tt-merchant-ad-form-row">
            <label className="tt-merchant-ad-form-field">
              <span>ราคา (บาท)</span>
              <input
                className="tt-input"
                type="number"
                min={1}
                step={1}
                value={priceThb}
                onChange={(e) => setPriceThb(e.target.value)}
              />
            </label>
            <label className="tt-merchant-ad-form-field">
              <span>สต็อก</span>
              <input
                className="tt-input"
                type="number"
                min={0}
                step={1}
                value={stock}
                onChange={(e) => setStock(e.target.value)}
              />
            </label>
          </div>

          {!hasProduct && (
            <button
              type="button"
              className="tt-btn-primary tt-merchant-ad-publish"
              disabled={busy}
              onClick={() => void onAddProduct()}
            >
              {busy ? 'กำลังบันทึก…' : isPublished ? '➕ บันทึกสินค้าในร้าน' : '➕ เพิ่มสินค้า'}
            </button>
          )}

          {hasProduct && job.status === 'completed' && !publishFailed && (
            <button
              type="button"
              className="tt-btn-primary tt-merchant-ad-publish"
              disabled={busy || isPublishing}
              onClick={onPublish}
            >
              {isPublishing ? `กำลังเผยแพร่… ${publishPct}%` : '📣 เผยแพร่ให้ลูกค้าเห็น'}
            </button>
          )}

          {publishFailed && (
            <button
              type="button"
              className="tt-btn-primary tt-merchant-ad-publish"
              disabled={isPublishing}
              onClick={onRetryPublish}
            >
              {isPublishing ? `กำลังเผยแพร่… ${publishPct}%` : '↻ ลองเผยแพร่อีกครั้ง'}
            </button>
          )}

          {isPublished && (
            <p className={`tt-merchant-ad-clip-published-hint${!hasProduct ? ' needs-product' : ' tt-merchant-ok'}`}>
              {hasProduct
                ? 'คลิปและสินค้าเผยแพร่แล้ว — แก้รายละเอียดด้านบนแล้วกดอัปเดต'
                : 'คลิปเผยแพร่แล้ว แต่สินค้ายังไม่อยู่ในร้าน — กรอกรายละเอียดแล้วกดบันทึก'}
            </p>
          )}

          {hasProduct && isPublished && (
            <button
              type="button"
              className="tt-btn-ghost tt-merchant-ad-publish"
              disabled={busy}
              onClick={() => void onAddProduct()}
            >
              {busy ? 'กำลังอัปเดต…' : '💾 อัปเดตรายละเอียดสินค้า'}
            </button>
          )}
        </section>
      )}

      {job.status === 'generating' && (
        <>
          <p className="tt-hint tt-merchant-ad-clip-wait">รอ AI สร้างคลิปเสร็จ…</p>
          {onCancelTrack && (
            <button type="button" className="tt-btn-ghost tt-merchant-ad-cancel" onClick={() => onCancelTrack(job.id)}>
              ยกเลิกติดตาม (สร้างใหม่ได้)
            </button>
          )}
        </>
      )}
    </article>
  );
}
