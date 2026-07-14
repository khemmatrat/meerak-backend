'use client';

import type { DirectorMerchantPreview } from '@/lib/merchantAdVideo';

type Props = {
  preview: DirectorMerchantPreview | null;
  loading: boolean;
  error: string | null;
};

const FORMAT_LABEL: Record<string, string> = {
  ugc_lipsync: 'UGC รีวิว',
  tvc_multi_shot: 'TVC หลายช็อต',
};

const CHECK_LABEL_TH: Record<string, string> = {
  product_title: 'ชื่อสินค้า',
  merchant_id: 'ข้อมูลร้าน',
  product_image: 'รูปสินค้า',
  portrait_image: 'รูปอ้างอิง / ใบหน้า',
  script_length: 'ความยาวสคริปต์',
  prompt_size: 'ขนาด prompt',
  token_balance: 'โทเค็น / โควต้า',
  aspect_ratio: 'สัดส่วนวิดีโอ',
  language: 'ภาษา',
  video_gen_enabled: 'ระบบสร้างวิดีโอ',
};

function checkLabel(id: string, fallback: string) {
  return CHECK_LABEL_TH[id] || fallback.replace(/_/g, ' ');
}

export function MerchantAdDirectorPreview({ preview, loading, error }: Props) {
  if (loading) {
    return (
      <section className="tt-merchant-ad-step tt-merchant-ad-director-preview" aria-busy="true">
        <h2 className="tt-merchant-ad-step-title">
          <span className="tt-merchant-ad-step-n">4</span> ตัวอย่างก่อนสร้าง
        </h2>
        <p className="tt-hint tt-merchant-ad-director-loading">AI กำลังวางแผนคลิป…</p>
      </section>
    );
  }

  if (error && !preview) {
    return (
      <section className="tt-merchant-ad-step tt-merchant-ad-director-preview">
        <h2 className="tt-merchant-ad-step-title">
          <span className="tt-merchant-ad-step-n">4</span> ตัวอย่างก่อนสร้าง
        </h2>
        <p className="tt-order-action-msg tt-merchant-ad-msg">{error}</p>
      </section>
    );
  }

  if (!preview) return null;

  const formatLabel = FORMAT_LABEL[preview.format] || preview.format;
  const failedChecks = preview.validation.checks.filter((c) => !c.passed);

  return (
    <section className="tt-merchant-ad-step tt-merchant-ad-director-preview">
      <h2 className="tt-merchant-ad-step-title">
        <span className="tt-merchant-ad-step-n">4</span> ตัวอย่างก่อนสร้าง
        {preview.ready_to_generate ? (
          <span className="tt-merchant-ad-director-ready">พร้อมสร้าง</span>
        ) : (
          <span className="tt-merchant-ad-director-not-ready">ต้องแก้ก่อนสร้าง</span>
        )}
      </h2>

      <div className="tt-merchant-ad-director-meta">
        <span className="tt-merchant-ad-director-badge">{formatLabel}</span>
        <span className="tt-merchant-ad-director-badge">{preview.style.label_th}</span>
        <span className="tt-merchant-ad-director-badge">
          {preview.duration.clip_sec} วินาที · {preview.duration.estimated_wait_label}
        </span>
        {preview.cost.charge_source === 'free_weekly' ? (
          <span className="tt-merchant-ad-director-badge">ใช้โควต้าฟรี</span>
        ) : preview.cost.tokens ? (
          <span className="tt-merchant-ad-director-badge">{preview.cost.tokens} เหรียญ</span>
        ) : null}
        {preview.cost.video_generation?.note && (
          <span className="tt-merchant-ad-director-badge">{preview.cost.video_generation.note}</span>
        )}
      </div>

      {preview.script.full_text && (
        <div className="tt-merchant-ad-director-block">
          <h3 className="tt-merchant-ad-director-h">สคริปต์พูด</h3>
          <p className="tt-merchant-ad-director-script">{preview.script.full_text}</p>
        </div>
      )}

      {preview.prompt_summary.preview && (
        <div className="tt-merchant-ad-director-block">
          <h3 className="tt-merchant-ad-director-h">แนวคิดวิดีโอ</h3>
          <p className="tt-merchant-ad-director-prompt">{preview.prompt_summary.preview}</p>
        </div>
      )}

      {failedChecks.length > 0 && (
        <ul className="tt-merchant-ad-director-checks">
          {failedChecks.map((c) => (
            <li key={c.id} className="is-fail">
              ✕ {checkLabel(c.id, c.label)} — {c.message || 'ไม่ผ่าน'}
            </li>
          ))}
        </ul>
      )}

      {preview.ready_to_generate && failedChecks.length === 0 && (
        <p className="tt-merchant-ok tt-merchant-ad-director-ok">
          ตรวจสอบแล้ว — กดปุ่มด้านล่างเพื่อเริ่มสร้างคลิป
        </p>
      )}

      {error && <p className="tt-order-action-msg tt-merchant-ad-msg">{error}</p>}
    </section>
  );
}
