'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useMerchant } from '@/components/mobile/MerchantShell';
import { useMerchantAdJobs } from '@/components/mobile/MerchantAdJobProvider';
import { publishProgressPct } from '@/lib/merchantAdBackgroundJob';
import { displayProgressPct, estimateEtaSec, isStaleGeneratingJob } from '@/lib/merchantAdVideo';
import { retryPublishInBackground } from '@/lib/merchantAdPublishRunner';

function isActiveGenerate(e: { meta: { kind?: string; startedAt: number }; job: { status: string } | null }) {
  if ((e.meta.kind || 'generate') !== 'generate') return false;
  return e.job?.status === 'generating' || (!e.job && Date.now() - e.meta.startedAt < 20 * 60 * 1000);
}

function isActivePublish(e: { meta: { kind?: string; publishStatus?: string } }) {
  if (e.meta.kind !== 'publish') return false;
  return e.meta.publishStatus === 'publishing' || e.meta.publishStatus === 'completed' || e.meta.publishStatus === 'failed';
}

export function MerchantAdJobBanner() {
  const pathname = usePathname();
  const { merchantId } = useMerchant();
  const { entries, dismissOverlay, refresh } = useMerchantAdJobs();
  const [tick, setTick] = useState(0);

  const active = entries.filter((e) => isActiveGenerate(e) || isActivePublish(e));

  useEffect(() => {
    if (!active.length) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [active.length]);

  void tick;

  const onRetryPublish = useCallback(
    (jobId: string) => {
      void retryPublishInBackground(jobId, {
        onComplete: () => refresh(),
        onFail: () => refresh(),
      });
      refresh();
    },
    [refresh],
  );

  if (!active.length) return null;

  const onStudio = pathname.startsWith('/m/merchant/ad-studio');
  const current =
    active.find((e) => e.meta.merchantId === merchantId) || active[0];
  const { meta, job } = current;
  const isPublish = meta.kind === 'publish';
  const publishStatus = meta.publishStatus;
  const otherCount = active.length - 1;

  if (onStudio && !meta.overlayDismissed && !isPublish) return null;

  let pct = 5;
  let title = '';
  let subtitle = '';
  let variant = '';

  if (isPublish) {
    variant = publishStatus === 'failed' ? 'is-failed' : publishStatus === 'completed' ? 'is-done' : 'is-publish';
    pct = publishProgressPct(meta);
    if (publishStatus === 'failed') {
      title = meta.merchantId === merchantId ? 'เผยแพร่ไม่สำเร็จ' : `ร้าน ${meta.merchantName}`;
      subtitle = meta.publishError || 'ลองอีกครั้งหรือตรวจการเชื่อมต่อ';
    } else if (publishStatus === 'completed') {
      title = 'เผยแพร่สำเร็จ';
      subtitle = `${meta.productTitle || 'สินค้า'} ขึ้นร้านและหน้าแรกแล้ว`;
      pct = 100;
    } else {
      title = meta.merchantId === merchantId ? 'กำลังเผยแพร่คลิป' : `ร้าน ${meta.merchantName}`;
      subtitle = 'อัปโหลดและโพสต์เบื้องหลัง — ไปทำอย่างอื่นได้';
    }
  } else {
    const elapsedSec = Math.floor((Date.now() - meta.startedAt) / 1000);
    pct = job ? displayProgressPct(job, elapsedSec) : 5;
    const etaSec = job ? estimateEtaSec(job, elapsedSec) : null;
    const etaMin = etaSec != null && etaSec > 0 ? Math.max(1, Math.ceil(etaSec / 60)) : null;
    const stale = job ? isStaleGeneratingJob(job, elapsedSec) : elapsedSec > 600;
    title = meta.merchantId === merchantId ? 'กำลังสร้างคลิปโฆษณา' : `ร้าน ${meta.merchantName}`;
    subtitle = stale
      ? 'ใช้เวลานานผิดปกติ — ลองสร้างใหม่หรือรีสตาร์ท backend'
      : 'ทำงานเบื้องหลัง — ไปรับออเดอร์ร้านอื่นได้';
    if (!stale && etaMin != null) subtitle += ` · ประมาณ ${etaMin} นาที`;
  }

  if (otherCount > 0) subtitle += ` · อีก ${otherCount} งาน`;

  return (
    <div className={`tt-ad-job-banner${variant ? ` ${variant}` : ''}`} role="status" aria-live="polite">
      <div className="tt-ad-job-banner-inner">
        <div className="tt-ad-job-banner-ring" aria-hidden>
          <svg viewBox="0 0 36 36">
            <circle className="tt-ad-job-banner-ring-bg" cx="18" cy="18" r="15" />
            <circle
              className="tt-ad-job-banner-ring-fg"
              cx="18"
              cy="18"
              r="15"
              strokeDasharray={`${(pct / 100) * 94.2} 94.2`}
            />
          </svg>
          <span>{Math.round(pct)}%</span>
        </div>
        <div className="tt-ad-job-banner-text">
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
        {isPublish && publishStatus === 'failed' ? (
          <button
            type="button"
            className="tt-ad-job-banner-retry"
            onClick={() => onRetryPublish(meta.jobId)}
          >
            ลองใหม่
          </button>
        ) : (
          <Link href="/m/merchant/ad-studio" className="tt-ad-job-banner-link">
            ดู
          </Link>
        )}
        {onStudio && (
          <button
            type="button"
            className="tt-ad-job-banner-dismiss"
            onClick={() => dismissOverlay(meta.jobId)}
            aria-label="ซ่อนแถบความคืบหน้า"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
