'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useMerchant } from '@/components/mobile/MerchantShell';
import {
  AD_CATEGORY_OPTIONS,
  AD_STYLE_PRESETS,
  AD_TOKEN_PACKAGES,
  MIN_TOPUP_THB,
  TOKENS_PER_VIDEO,
  buildDirectorPayload,
  createAdBrief,
  fetchAdJobs,
  fetchDirectorPlan,
  generateAdVideo,
  generationStateLabel,
  displayProgressPct,
  estimateEtaSec,
  runDirectorAd,
  topUpAdTokens,
  uploadAdProductImage,
  videosFromTokens,
  tokensForCustomAmount,
  type AdGuide,
  type AdTokenQuota,
  type AdVideoJob,
  type DirectorMerchantPreview,
} from '@/lib/merchantAdVideo';
import { AdVideoProgressRing } from '@/components/mobile/AdVideoProgressRing';
import { AdClipProductCard } from '@/components/mobile/AdClipProductCard';
import { MerchantAdDirectorPreview } from '@/components/mobile/MerchantAdDirectorPreview';
import { useMerchantAdJobs } from '@/components/mobile/MerchantAdJobProvider';
import { getTrackedAdJob, removeTrackedAdJob, showAdJobOverlay } from '@/lib/merchantAdBackgroundJob';

type ProductOption = { id: string; title: string; image_url?: string };

function compressImage(file: File, maxPx = 1024) {
  return new Promise<File>((resolve, reject) => {
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
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('บีบอัดรูปไม่สำเร็จ'));
            return;
          }
          resolve(new File([blob], 'product.jpg', { type: 'image/jpeg' }));
        },
        'image/jpeg',
        0.85,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('เปิดรูปไม่ได้'));
    };
    img.src = url;
  });
}

export function MerchantAdStudioClient() {
  const searchParams = useSearchParams();
  const presetProductId = searchParams.get('product_id') || '';
  const { auth } = useAuth();
  const { merchantId, merchantName, isFoodMerchant } = useMerchant();
  const { registerJob, dismissOverlay, entryForMerchant } = useMerchantAdJobs();
  const ownerId = auth?.userId || 'guest';
  const fileRef = useRef<HTMLInputElement>(null);

  const [products, setProducts] = useState<ProductOption[]>([]);
  const [productId, setProductId] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [imagePreview, setImagePreview] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [styleId, setStyleId] = useState('premium');
  const [categoryStyle, setCategoryStyle] = useState(isFoodMerchant ? 'food' : 'general');
  const [visualNotes, setVisualNotes] = useState('');
  const [jobs, setJobs] = useState<AdVideoJob[]>([]);
  const [quota, setQuota] = useState<AdTokenQuota>({
    week_key: '',
    limit: 3,
    used: 0,
    remaining: 3,
    tokens: 0,
    tokens_per_video: TOKENS_PER_VIDEO,
    token_videos_available: 0,
    can_generate: true,
    next_charge: 'free_weekly',
  });
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'creating' | 'publishing' | 'topup'>('idle');
  const [tick, setTick] = useState(0);
  const [showTopUp, setShowTopUp] = useState(false);
  const [customTopUp, setCustomTopUp] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [directorPreview, setDirectorPreview] = useState<DirectorMerchantPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewErr, setPreviewErr] = useState('');

  const stylePreset = AD_STYLE_PRESETS.find((s) => s.id === styleId) || AD_STYLE_PRESETS[0];

  const productTitle = useMemo(() => {
    if (productId === '__custom__') return customTitle.trim() || 'สินค้าของฉัน';
    return products.find((p) => p.id === productId)?.title || customTitle.trim() || 'สินค้า';
  }, [customTitle, productId, products]);

  const selectedProduct = products.find((p) => p.id === productId);

  const reload = useCallback(async () => {
    const data = await fetchAdJobs(merchantId);
    setJobs(data.jobs);
    setQuota(data.quota);
  }, [merchantId]);

  useEffect(() => {
    fetch(`/api/merchant/products?merchant_id=${encodeURIComponent(merchantId)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        const list = (d.products || []).map((p: ProductOption) => p);
        setProducts(list);
        if (presetProductId && list.some((p) => p.id === presetProductId)) {
          setProductId(presetProductId);
        } else if (list.length) {
          setProductId((cur) => cur || list[0].id);
        }
      })
      .catch(() => setProducts([]));
    void reload();
  }, [merchantId, presetProductId, reload]);

  useEffect(() => {
    const hit = products.find((p) => p.id === productId);
    if (hit?.image_url && productId !== '__custom__') {
      setImageUrl(hit.image_url);
      setImagePreview(hit.image_url);
    }
  }, [productId, products]);

  const trackedEntry = entryForMerchant(merchantId);
  const trackedJob = trackedEntry?.job ?? null;
  const trackedMeta = trackedEntry?.meta ?? getTrackedAdJob(merchantId);

  const activeJob = useMemo(() => {
    if (trackedJob?.status === 'generating') return trackedJob;
    return jobs.find((j) => j.merchant_id === merchantId && j.status === 'generating') ?? null;
  }, [trackedJob, jobs, merchantId]);

  const isGenerating = activeJob?.status === 'generating';

  const progressStartedAt = useMemo(() => {
    if (trackedMeta?.startedAt) return trackedMeta.startedAt;
    if (activeJob?.created_at) return Date.parse(activeJob.created_at) || Date.now();
    return Date.now();
  }, [trackedMeta?.startedAt, activeJob?.created_at]);
  const generatingCount = jobs.filter((j) => j.status === 'generating').length;

  useEffect(() => {
    if (phase === 'creating' && !isGenerating) {
      const t = setTimeout(() => setPhase('idle'), 400);
      return () => clearTimeout(t);
    }
  }, [isGenerating, phase]);

  useEffect(() => {
    if (trackedJob?.status === 'completed') {
      setMsg('สร้างวิดีโอเสร็จแล้ว — เลื่อนลงดูคลิปได้เลย');
      void reload();
    } else if (trackedJob?.status === 'failed') {
      setErr(trackedJob.error || 'สร้างวิดีโอไม่สำเร็จ');
      void reload();
    }
  }, [trackedJob?.status, trackedJob?.error, reload]);

  useEffect(() => {
    const saved = getTrackedAdJob(merchantId);
    const running = jobs.find((j) => j.status === 'generating');

    if (saved) {
      const hit = jobs.find((j) => j.id === saved.jobId);
      if (hit && hit.status !== 'generating') {
        removeTrackedAdJob(saved.jobId);
      }
    }

    if (!saved && running) {
      const age = Date.now() - Date.parse(running.created_at);
      if (age < 15 * 60 * 1000) {
        registerJob({
          jobId: running.id,
          merchantId,
          merchantName,
          startedAt: Date.parse(running.created_at) || Date.now(),
        });
      }
    }
  }, [jobs, merchantId, merchantName, registerJob]);

  useEffect(() => {
    if (!isGenerating) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [isGenerating]);

  const onPickPhoto = async (file?: File | null) => {
    if (!file) return;
    setErr('');
    setPhase('uploading');
    try {
      const compressed = await compressImage(file);
      const url = await uploadAdProductImage(merchantId, compressed);
      setImageUrl(url);
      setImagePreview(URL.createObjectURL(compressed));
      setMsg('อัปโหลดรูปแล้ว — พร้อมสร้างวิดีโอ');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'อัปโหลดรูปไม่สำเร็จ');
    } finally {
      setPhase('idle');
    }
  };

  useEffect(() => {
    if (!imageUrl || !productTitle.trim()) {
      setDirectorPreview(null);
      setPreviewErr('');
      return;
    }

    const payload = buildDirectorPayload({
      merchantId,
      merchantName,
      ownerId,
      productId: productId === '__custom__' ? undefined : productId,
      productTitle,
      imageUrl,
      stylePresetId: styleId,
      categoryStyle,
      visualNotes,
    });

    setPreviewLoading(true);
    setPreviewErr('');
    const timer = window.setTimeout(() => {
      void fetchDirectorPlan(payload)
        .then((data) => {
          setDirectorPreview(data.preview);
          setPreviewErr('');
        })
        .catch((e) => {
          setDirectorPreview(null);
          setPreviewErr(e instanceof Error ? e.message : 'โหลดตัวอย่างไม่สำเร็จ');
        })
        .finally(() => setPreviewLoading(false));
    }, 600);

    return () => window.clearTimeout(timer);
  }, [
    merchantId,
    merchantName,
    ownerId,
    productId,
    productTitle,
    imageUrl,
    styleId,
    categoryStyle,
    visualNotes,
  ]);

  const buildGuide = (): AdGuide => ({
    category_style: categoryStyle,
    mood: stylePreset.mood,
    audience: 'all',
    hook: stylePreset.hook,
    visual_notes: visualNotes,
  });

  const startTrackedJob = (started: AdVideoJob, nextQuota: AdTokenQuota) => {
    setJobs((prev) => [started, ...prev.filter((j) => j.id !== started.id)]);
    setQuota(nextQuota);
    const startedAt = Date.now();
    registerJob({
      jobId: started.id,
      merchantId,
      merchantName,
      startedAt,
      overlayDismissed: false,
    });
    showAdJobOverlay(started.id);
    setPhase('idle');
    setMsg('เริ่มสร้างคลิปแล้ว — ดูความคืบหน้าด้านบน');
  };

  const onCreateVideo = async () => {
    if (!imageUrl) {
      setErr('กรุณาถ่ายรูปหรือเลือกรูปสินค้าก่อน');
      return;
    }
    if (!quota.can_generate) {
      setShowTopUp(true);
      setErr('โควต้าฟรีหมดแล้ว — เติมโทเค็นเพื่อสร้างต่อ');
      return;
    }
    if (directorPreview && !directorPreview.ready_to_generate) {
      setErr('ยังไม่พร้อมสร้าง — แก้รายการที่ไม่ผ่านในตัวอย่างก่อน');
      return;
    }
    setErr('');
    setMsg('');
    setPhase('creating');
    try {
      const directorPayload = buildDirectorPayload({
        merchantId,
        merchantName,
        ownerId,
        productId: productId === '__custom__' ? undefined : productId,
        productTitle,
        imageUrl,
        stylePresetId: styleId,
        categoryStyle,
        visualNotes,
      });

      try {
        const data = await runDirectorAd(directorPayload);
        startTrackedJob(data.job, data.quota);
        if (data.preview) setDirectorPreview(data.preview);
        return;
      } catch (directorErr) {
        const m = directorErr instanceof Error ? directorErr.message : 'director_run_failed';
        if (!m.includes('aivos_unavailable') && !m.includes('unavailable')) {
          throw directorErr;
        }
      }

      const guide = buildGuide();
      const brief = await createAdBrief({
        merchant_id: merchantId,
        merchant_name: merchantName,
        product_id: productId === '__custom__' ? '' : productId,
        product_title: productTitle,
        category_style: guide.category_style,
        mood: guide.mood,
        audience: guide.audience,
        hook: guide.hook,
        visual_notes: guide.visual_notes,
      });
      const data = await generateAdVideo({
        merchant_id: merchantId,
        owner_id: ownerId,
        product_id: productId === '__custom__' ? undefined : productId,
        product_title: productTitle,
        product_image_url: imageUrl,
        brief,
        guide,
      });
      startTrackedJob(data.job, data.quota);
    } catch (e) {
      const m = e instanceof Error ? e.message : 'สร้างไม่สำเร็จ';
      if (m.includes('insufficient') || m.includes('token')) {
        setShowTopUp(true);
        setErr('โทเค็นไม่พอ — กรุณาเติมเงิน');
      } else if (m.includes('validation_failed')) {
        setErr('ข้อมูลไม่ผ่านการตรวจสอบ — ดูรายการในตัวอย่างก่อนสร้าง');
      } else {
        setErr(m);
      }
      setPhase('idle');
    }
  };

  const onTopUp = async (packageId?: string) => {
    setPhase('topup');
    setErr('');
    try {
      const customThb = packageId ? undefined : Number(customTopUp);
      if (!packageId && (!customThb || customThb < MIN_TOPUP_THB)) {
        setErr(`เติมขั้นต่ำ ${MIN_TOPUP_THB} บาท`);
        return;
      }
      const data = await topUpAdTokens(merchantId, { packageId, customThb });
      setQuota(data.quota);
      setShowTopUp(false);
      setCustomTopUp('');
      setMsg(`เติมโทเค็น +${data.tokens_added} เหรียญ (สร้างได้อีก ~${videosFromTokens(data.tokens_added)} คลิป)`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'เติมเงินไม่สำเร็จ');
    } finally {
      setPhase('idle');
    }
  };

  const clipBusy = phase === 'publishing';

  const onCancelTrack = (jobId: string) => {
    removeTrackedAdJob(jobId);
    setMsg('ยกเลิกติดตามคลิปนี้แล้ว — สร้างใหม่ได้');
    void reload();
  };

  const customTokensPreview = tokensForCustomAmount(Number(customTopUp) || 0);
  const elapsedSec = Math.floor((Date.now() - progressStartedAt) / 1000);
  void tick;
  const progressJob = activeJob;
  const isUgcJob = progressJob?.director_plan?.format === 'ugc_lipsync' || progressJob?.generation_state != null;
  const shotTotal = isUgcJob ? 0 : progressJob?.brief?.shots?.length || 10;
  const progressLabel =
    generationStateLabel(progressJob?.generation_state) || 'AI กำลังสร้างคลิปโฆษณา';
  const canCreate =
    !previewLoading &&
    (!directorPreview || directorPreview.ready_to_generate) &&
    Boolean(imageUrl);
  const overlayDismissed = trackedMeta?.overlayDismissed ?? false;
  const showFullOverlay = isGenerating && progressJob && !overlayDismissed;
  const showInlineProgress = isGenerating && progressJob && overlayDismissed;

  return (
    <div className="tt-merchant-page tt-merchant-ad-studio">
      {showFullOverlay && (
        <AdVideoProgressRing
          progress={displayProgressPct(progressJob, elapsedSec)}
          etaSec={estimateEtaSec(progressJob, elapsedSec)}
          shot={isUgcJob ? undefined : progressJob.current_shot}
          shotTotal={shotTotal > 0 ? shotTotal : undefined}
          label={progressLabel}
          onDismiss={() => dismissOverlay(progressJob.id)}
        />
      )}
      {showInlineProgress && (
        <AdVideoProgressRing
          variant="inline"
          progress={displayProgressPct(progressJob, elapsedSec)}
          etaSec={estimateEtaSec(progressJob, elapsedSec)}
          shot={isUgcJob ? undefined : progressJob.current_shot}
          shotTotal={shotTotal > 0 ? shotTotal : undefined}
          label={progressLabel}
        />
      )}
      {isGenerating && progressJob && (
        <button
          type="button"
          className="tt-btn-ghost tt-merchant-ad-show-progress"
          onClick={() => showAdJobOverlay(progressJob.id)}
        >
          🔍 ดูความคืบหน้าแบบเต็มจอ
        </button>
      )}
      <header className="tt-merchant-ad-hero">
        <h1 className="tt-merchant-page-title">🎬 สร้างวิดีโอขายของ</h1>
        <p className="tt-merchant-ad-hero-sub">
          ถ่ายรูปสินค้า → เลือกสไตล์ → ดูตัวอย่างสคริปต์ → AI ทำคลิปให้
        </p>
        {presetProductId && selectedProduct && (
          <p className="tt-merchant-ok tt-merchant-ad-preset-product">
            🎬 กำลังสร้างวิดีโอให้: <strong>{selectedProduct.title}</strong>
          </p>
        )}
      </header>

      <section className="tt-merchant-ad-wallet">
        <div className="tt-merchant-ad-wallet-row">
          <div>
            <span className="tt-merchant-ad-wallet-label">ฟรีสัปดาห์นี้</span>
            <strong className="tt-merchant-ad-wallet-num">
              {quota.remaining}/{quota.limit} คลิป
            </strong>
          </div>
          <div>
            <span className="tt-merchant-ad-wallet-label">โทเค็นวิดีโอ</span>
            <strong className="tt-merchant-ad-wallet-num">{quota.tokens} เหรียญ</strong>
            <span className="tt-merchant-ad-wallet-sub">≈ สร้างได้อีก {quota.token_videos_available} คลิป</span>
          </div>
          <button type="button" className="tt-merchant-ad-topup-btn" onClick={() => setShowTopUp(true)}>
            + เติม
          </button>
        </div>
        <p className="tt-merchant-ad-wallet-hint">
          1 คลิป = {TOKENS_PER_VIDEO} เหรียญ · ใช้โควต้าฟรีก่อน หมดแล้วหักเหรียญ · เริ่มเติม {MIN_TOPUP_THB} บาท
        </p>
      </section>

      <section className="tt-merchant-ad-step">
        <h2 className="tt-merchant-ad-step-title">
          <span className="tt-merchant-ad-step-n">1</span> เลือกสินค้า
        </h2>
        <div className="tt-merchant-ad-product-grid">
          {products.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`tt-merchant-ad-product-card${productId === p.id ? ' is-selected' : ''}`}
              onClick={() => setProductId(p.id)}
            >
              {p.image_url ? (
                <img src={p.image_url} alt="" className="tt-merchant-ad-product-thumb" />
              ) : (
                <span className="tt-merchant-ad-product-thumb tt-merchant-ad-product-empty">📦</span>
              )}
              <span className="tt-merchant-ad-product-name">{p.title}</span>
            </button>
          ))}
          <button
            type="button"
            className={`tt-merchant-ad-product-card${productId === '__custom__' ? ' is-selected' : ''}`}
            onClick={() => setProductId('__custom__')}
          >
            <span className="tt-merchant-ad-product-thumb tt-merchant-ad-product-empty">➕</span>
            <span className="tt-merchant-ad-product-name">สินค้าใหม่</span>
          </button>
        </div>
        {productId === '__custom__' && (
          <input
            className="tt-input"
            placeholder="ชื่อสินค้า / เมนู"
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
          />
        )}
      </section>

      <section className="tt-merchant-ad-step">
        <h2 className="tt-merchant-ad-step-title">
          <span className="tt-merchant-ad-step-n">2</span> รูปสินค้า
        </h2>
        <button
          type="button"
          className="tt-merchant-ad-photo-box"
          onClick={() => fileRef.current?.click()}
          disabled={phase === 'uploading'}
        >
          {imagePreview ? (
            <img src={imagePreview} alt="รูปสินค้า" className="tt-merchant-ad-photo-preview" />
          ) : (
            <div className="tt-merchant-ad-photo-placeholder">
              <span className="tt-merchant-ad-photo-icon">📷</span>
              <strong>แตะเพื่อถ่ายรูป / เลือกจากแกลเลอรี</strong>
              <span>ใช้รูปสินค้าจริง คุณภาพวิดีโอจะดีขึ้นมาก</span>
            </div>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="tt-sr-only"
          onChange={(e) => void onPickPhoto(e.target.files?.[0])}
        />
        {selectedProduct?.image_url && productId !== '__custom__' && (
          <p className="tt-hint">ใช้รูปจากร้านแล้ว — แตะรูปด้านบนเพื่อเปลี่ยน</p>
        )}
      </section>

      <section className="tt-merchant-ad-step">
        <h2 className="tt-merchant-ad-step-title">
          <span className="tt-merchant-ad-step-n">3</span> เลือกสไตล์คลิป
        </h2>
        <div className="tt-merchant-ad-style-chips">
          {AD_STYLE_PRESETS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`tt-merchant-ad-style-chip${styleId === s.id ? ' is-on' : ''}`}
              onClick={() => setStyleId(s.id)}
            >
              <span className="tt-merchant-ad-style-emoji">{s.emoji}</span>
              {s.label}
            </button>
          ))}
        </div>
        <div className="tt-merchant-ad-cat-row">
          {AD_CATEGORY_OPTIONS.filter((c) => (isFoodMerchant ? c.id === 'food' || c.id === 'general' : true))
            .slice(0, 4)
            .map((c) => (
              <button
                key={c.id}
                type="button"
                className={`tt-merchant-ad-cat-chip${categoryStyle === c.id ? ' is-on' : ''}`}
                onClick={() => setCategoryStyle(c.id)}
              >
                {c.emoji} {c.label}
              </button>
            ))}
        </div>
        <input
          className="tt-input"
          placeholder="บอก AI เพิ่ม เช่น สีบรรจุภัณฑ์เงิน เน้นผู้ชาย (ไม่บังคับ)"
          value={visualNotes}
          onChange={(e) => setVisualNotes(e.target.value)}
        />
      </section>

      <MerchantAdDirectorPreview
        preview={directorPreview}
        loading={previewLoading && Boolean(imageUrl)}
        error={previewErr || null}
      />

      <section className="tt-merchant-ad-create-block">
        <button
          type="button"
          className="tt-btn-primary tt-merchant-ad-create-btn"
          disabled={phase === 'creating' || phase === 'uploading' || !canCreate}
          onClick={() => void onCreateVideo()}
        >
          {phase === 'creating'
            ? '⏳ กำลังเริ่มสร้าง…'
            : phase === 'uploading'
              ? 'กำลังอัปโหลดรูป…'
              : generatingCount > 0
                ? `✨ สร้างคลิปเพิ่ม (${generatingCount} กำลังทำอยู่)`
                : quota.next_charge === 'free_weekly'
                  ? '✨ สร้างวิดีโอโฆษณา (ฟรี)'
                  : `✨ สร้างวิดีโอ (${TOKENS_PER_VIDEO} เหรียญ)`}
        </button>
        {!imageUrl && (
          <p className="tt-hint tt-merchant-ad-msg">กรุณาถ่ายรูปสินค้าก่อน (ขั้นตอนที่ 2)</p>
        )}
        {imageUrl && directorPreview && !directorPreview.ready_to_generate && (
          <p className="tt-hint tt-merchant-ad-msg">แก้รายการที่ไม่ผ่านในตัวอย่างก่อนสร้าง</p>
        )}
        {!quota.can_generate && (
          <button type="button" className="tt-btn-ghost" onClick={() => setShowTopUp(true)}>
            โควต้าหมด — แตะเติมโทเค็น
          </button>
        )}
      </section>

      {msg && <p className="tt-merchant-ok tt-merchant-ad-msg">{msg}</p>}
      {err && <p className="tt-order-action-msg tt-merchant-ad-msg">{err}</p>}

      <h2 className="tt-checkout-h">คลิปของฉัน</h2>
      {jobs.length === 0 && (
        <p className="tt-hint tt-merchant-ad-empty">ยังไม่มีคลิป — ลองสร้างคลิปแรกวันนี้เลย</p>
      )}
      <div className="tt-merchant-ad-clip-list">
        {jobs.map((j) => (
          <AdClipProductCard
            key={j.id}
            job={j}
            merchantId={merchantId}
            merchantName={merchantName}
            isFoodMerchant={isFoodMerchant}
            categoryStyle={categoryStyle}
            visualNotes={visualNotes}
            busy={clipBusy}
            onBusy={(v) => setPhase(v ? 'publishing' : 'idle')}
            onMessage={setMsg}
            onError={setErr}
            onReload={reload}
            onCancelTrack={onCancelTrack}
          />
        ))}
      </div>

      {showTopUp && (
        <div className="tt-merchant-ad-sheet-backdrop" onClick={() => setShowTopUp(false)} role="presentation">
          <div className="tt-merchant-ad-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="เติมโทเค็น">
            <h3>เติมโทเค็นสร้างวิดีโอ</h3>
            <p className="tt-hint">
              1 คลิป = {TOKENS_PER_VIDEO} เหรียญ · โควต้าฟรี {quota.limit} คลิป/สัปดาห์ไม่หักเหรียญ
            </p>
            <div className="tt-merchant-ad-pack-grid">
              {AD_TOKEN_PACKAGES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="tt-merchant-ad-pack"
                  disabled={phase === 'topup'}
                  onClick={() => void onTopUp(p.id)}
                >
                  <strong>฿{p.price_thb}</strong>
                  <span>{p.tokens} เหรียญ</span>
                  <em>≈ {videosFromTokens(p.tokens)} คลิป</em>
                  <small>{p.badge}</small>
                </button>
              ))}
            </div>
            <div className="tt-merchant-ad-custom-topup">
              <label>หรือใส่จำนวนเอง (ขั้นต่ำ {MIN_TOPUP_THB} บาท)</label>
              <div className="tt-merchant-ad-custom-row">
                <input
                  className="tt-input"
                  type="number"
                  min={MIN_TOPUP_THB}
                  step={1}
                  placeholder="เช่น 350"
                  value={customTopUp}
                  onChange={(e) => setCustomTopUp(e.target.value)}
                />
                <button
                  type="button"
                  className="tt-btn-primary"
                  disabled={phase === 'topup' || customTokensPreview < TOKENS_PER_VIDEO}
                  onClick={() => void onTopUp()}
                >
                  เติม
                </button>
              </div>
              {customTokensPreview > 0 && (
                <p className="tt-hint">ได้ {customTokensPreview} เหรียญ ≈ {videosFromTokens(customTokensPreview)} คลิป</p>
              )}
            </div>
            <p className="tt-merchant-ad-legal">
              ค่าใช้จ่าย AI ประมาณ 20% · บริการแพลตฟอร์ม 80% · ชำระผ่านวอลเล็ต/พร้อมเพย์ (โหมดทดสอบเติมทันที)
            </p>
            <button type="button" className="tt-btn-ghost tt-merchant-ad-sheet-close" onClick={() => setShowTopUp(false)}>
              ปิด
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
