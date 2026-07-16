'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { RiderFaceCapture } from '@/components/mobile/RiderFaceCapture';
import { useRider } from '@/components/mobile/RiderShell';
import { RiderKycDocField } from '@/components/mobile/RiderKycDocField';
import { riderOsPath } from '@/lib/riderOsPaths';
import {
  EMPTY_RIDER_KYC_FORM,
  RIDER_KYC_STEPS,
  RIDER_VEHICLE_PHOTO_KEYS,
  RIDER_VEHICLE_PHOTO_LABELS,
  validateRiderKycForm,
  riderKycFormToPayload,
  type RiderKycForm,
} from '@/lib/riderKycDocs';
import { fetchRiderKycStatus, submitRiderKycDocuments } from '@/lib/riderKycUpload';

export default function RiderKycPage() {
  const router = useRouter();
  const { auth } = useAuth();
  const { profile, refreshProfile } = useRider();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<RiderKycForm>(EMPTY_RIDER_KYC_FORM);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [kycStatus, setKycStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!auth?.userId) return;
    void fetchRiderKycStatus({ userId: auth.userId, token: auth.token })
      .then((s) => setKycStatus(s?.status || null))
      .catch(() => {});
  }, [auth?.userId, auth?.token]);

  const missing = useMemo(() => validateRiderKycForm(form), [form]);
  const current = RIDER_KYC_STEPS[step];

  const set = (key: keyof RiderKycForm, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const submit = async () => {
    if (!auth?.userId) {
      setErr('กรุณาเข้าสู่ระบบก่อน');
      return;
    }
    if (!profile?.rider_id) {
      setErr('สมัคร Rider OS ก่อน — ไปที่หน้าสมัคร');
      return;
    }
    const miss = validateRiderKycForm(form);
    if (miss.length) {
      setErr(`ยังขาด: ${miss.join(', ')}`);
      return;
    }
    setErr('');
    setSubmitting(true);
    try {
      const payload = riderKycFormToPayload(form, profile);
      const { ok, data } = await submitRiderKycDocuments(
        { userId: auth.userId, token: auth.token },
        payload,
      );
      if (!ok) {
        const labels = data.missing_labels?.join(', ') || data.message || data.error;
        throw new Error(labels || 'ส่งเอกสารไม่สำเร็จ');
      }
      setMsg(data.message || 'ส่งเอกสารแล้ว — รอแอดมินตรวจสอบ');
      await refreshProfile();
      setTimeout(() => router.push(riderOsPath('/profile')), 1500);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'ส่งเอกสารไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="tt-rider-kyc-page">
      <header className="tt-header">
        <div className="tt-header-row">
          <Link href={riderOsPath('/profile')} className="tt-back">‹</Link>
          <span style={{ flex: 1, fontWeight: 700 }}>ยืนยันตัวตน Rider</span>
        </div>
      </header>

      <div className="tt-rider-kyc-body">
        <p className="tt-hint">
          เอกสารจัดเก็บปลอดภัย — ใช้ตรวจสอบตามกฎหมายขนส่งและความปลอดภัยผู้ใช้บริการ
        </p>

        {kycStatus && kycStatus !== 'none' && (
          <p className="tt-rider-kyc-status-pill">สถานะล่าสุด: {kycStatus}</p>
        )}

        {!auth && (
          <p className="tt-hint">
            <Link href={`/m/login?next=${encodeURIComponent(riderOsPath('/kyc'))}`}>เข้าสู่ระบบ</Link> ก่อนส่งเอกสาร
          </p>
        )}

        {!profile?.rider_id && auth && (
          <p className="tt-hint">
            ยังไม่ได้สมัคร Rider — <Link href={riderOsPath('/signup')}>สมัครก่อน</Link>
          </p>
        )}

        <div className="tt-rider-kyc-steps">
          {RIDER_KYC_STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={`tt-rider-kyc-step-tab${i === step ? ' active' : ''}`}
              onClick={() => setStep(i)}
            >
              {i + 1}. {s.short || s.title}
            </button>
          ))}
        </div>

        {current && (
          <>
            <h2 className="tt-rider-kyc-step-title">{current.title}</h2>
            <p className="tt-hint">{current.hint}</p>
          </>
        )}

        {step === 0 && (
          <>
            <RiderKycDocField
              label="บัตรประชาชน (หน้า)"
              documentType="rider_id_front"
              value={form.id_card_front_url}
              onChange={(u) => set('id_card_front_url', u)}
              required
            />
            <RiderKycDocField
              label="บัตรประชาชน (หลัง)"
              documentType="rider_id_back"
              value={form.id_card_back_url}
              onChange={(u) => set('id_card_back_url', u)}
              required
            />
            <label className="tt-rider-kyc-date">
              วันหมดอายุบัตรประชาชน
              <input
                type="date"
                className="tt-input"
                value={form.id_card_expiry_date}
                onChange={(e) => set('id_card_expiry_date', e.target.value)}
              />
            </label>
          </>
        )}

        {step === 1 && auth?.userId && (
          <RiderFaceCapture
            auth={{ userId: auth.userId, token: auth.token }}
            value={form.selfie_photo_url}
            onChange={(u) => set('selfie_photo_url', u)}
            onError={(m) => setErr(m)}
          />
        )}

        {step === 2 && (
          <>
            <RiderKycDocField
              label="ใบขับขี่ (หน้า)"
              documentType="rider_dl_front"
              value={form.driving_license_front_url}
              onChange={(u) => set('driving_license_front_url', u)}
              required
            />
            <RiderKycDocField
              label="ใบขับขี่ (หลัง)"
              documentType="rider_dl_back"
              value={form.driving_license_back_url}
              onChange={(u) => set('driving_license_back_url', u)}
              required
            />
            <label className="tt-rider-kyc-date">
              วันหมดอายุใบขับขี่
              <input
                type="date"
                className="tt-input"
                value={form.driver_license_expiry}
                onChange={(e) => set('driver_license_expiry', e.target.value)}
              />
            </label>
          </>
        )}

        {step === 3 && (
          <>
            <RiderKycDocField
              label="เล่มทะเบียนรถ / สำเนาทะเบียน"
              documentType="rider_reg_book"
              value={form.registration_book_photo_url}
              onChange={(u) => set('registration_book_photo_url', u)}
              required
            />
            {RIDER_VEHICLE_PHOTO_KEYS.map((k) => (
              <RiderKycDocField
                key={k}
                label={`ภาพรถ — ${RIDER_VEHICLE_PHOTO_LABELS[k]}`}
                documentType={`rider_vehicle_${k}`}
                value={form[k]}
                onChange={(u) => set(k, u)}
                required
              />
            ))}
          </>
        )}

        {step === 4 && (
          <>
            <label className="tt-rider-kyc-toggle">
              <input
                type="checkbox"
                checked={form.wants_public_transport}
                onChange={(e) => set('wants_public_transport', e.target.checked)}
              />
              <span>รับผู้โดยสารสาธารณะ (มีป้ายเหลือง)</span>
            </label>
            {form.wants_public_transport && (
              <>
                <RiderKycDocField
                  label="ใบขออนุญาตป้ายเหลือง"
                  hint="กรณีขนส่งผู้โดยสารสาธารณะ — อนุมัติแล้วจึงรับงานผู้โดยสารได้"
                  documentType="rider_yellow_plate"
                  value={form.yellow_plate_photo_url}
                  onChange={(u) => set('yellow_plate_photo_url', u)}
                  required
                />
                <RiderKycDocField
                  label="ใบขับขี่สาธารณะ (หน้า)"
                  documentType="rider_pt_dl_front"
                  value={form.public_transport_license_front_url}
                  onChange={(u) => set('public_transport_license_front_url', u)}
                  required
                />
                <RiderKycDocField
                  label="ใบขับขี่สาธารณะ (หลัง)"
                  documentType="rider_pt_dl_back"
                  value={form.public_transport_license_back_url}
                  onChange={(u) => set('public_transport_license_back_url', u)}
                  required
                />
              </>
            )}
            {!form.wants_public_transport && (
              <p className="tt-hint">ไม่บังคับ — ข้ามได้ถ้ารับเฉพาะงานส่งของ/อาหาร</p>
            )}
          </>
        )}

        <div className="tt-rider-kyc-nav">
          {step > 0 && (
            <button type="button" className="tt-btn-secondary" onClick={() => setStep((s) => s - 1)}>
              ย้อนกลับ
            </button>
          )}
          {step < RIDER_KYC_STEPS.length - 1 ? (
            <button type="button" className="tt-btn-primary" onClick={() => setStep((s) => s + 1)}>
              ถัดไป
            </button>
          ) : (
            <button
              type="button"
              className="tt-btn-primary"
              disabled={submitting || missing.length > 0}
              onClick={() => void submit()}
            >
              {submitting ? 'กำลังส่ง…' : 'ส่งเอกสารยืนยันตัวตน'}
            </button>
          )}
        </div>

        {missing.length > 0 && step === RIDER_KYC_STEPS.length - 1 && (
          <p className="tt-hint">ยังขาด {missing.length} รายการก่อนส่ง</p>
        )}
        {msg && <p className="tt-merchant-ok">{msg}</p>}
        {err && <p className="tt-error-inline">{err}</p>}
      </div>
    </div>
  );
}
