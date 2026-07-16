'use client';

import { useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { uploadRiderKycDocument } from '@/lib/riderKycUpload';

type Props = {
  label: string;
  hint?: string;
  documentType: string;
  value?: string;
  onChange: (url: string) => void;
  required?: boolean;
};

export function RiderKycDocField({
  label,
  hint,
  documentType,
  value,
  onChange,
  required,
}: Props) {
  const { auth } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');

  const pick = () => inputRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !auth?.userId) return;
    setErr('');
    setUploading(true);
    try {
      const url = await uploadRiderKycDocument(
        { userId: auth.userId, authorization: auth.token ? `Bearer ${auth.token}` : undefined },
        file,
        documentType,
      );
      onChange(url);
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : 'อัปโหลดไม่สำเร็จ');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="tt-rider-kyc-field">
      <div className="tt-rider-kyc-field-head">
        <span>
          {label}
          {required ? ' *' : ''}
        </span>
        {value ? <span className="tt-rider-kyc-ok">✓ อัปโหลดแล้ว</span> : null}
      </div>
      {hint ? <p className="tt-hint">{hint}</p> : null}
      <button type="button" className="tt-rider-kyc-upload-btn" onClick={pick} disabled={uploading}>
        {uploading ? 'กำลังอัปโหลด…' : value ? 'เปลี่ยนรูป' : 'เลือกรูป / ถ่ายภาพ'}
      </button>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onFile(e)} />
      {value ? (
        <a href={value} target="_blank" rel="noreferrer" className="tt-rider-kyc-preview-link">
          ดูตัวอย่าง
        </a>
      ) : null}
      {err ? <p className="tt-error-inline">{err}</p> : null}
    </div>
  );
}
