'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { IconLuxChat } from '@/components/mobile/TtLuxuryIcons';

type Props = {
  title: string;
  chatHref?: string;
  backHref?: string;
};

export function MpSettingsSubHeader({ title, chatHref, backHref }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const embed = params.get('embed') === '1';
  const defaultBack = embed ? '/m/account/settings?embed=1' : '/m/account/settings';
  const back = backHref || defaultBack;

  return (
    <header className="tt-mp-settings-header">
      {back.startsWith('/') ? (
        <Link href={back} className="tt-mp-settings-back" aria-label="กลับ">
          ‹
        </Link>
      ) : (
        <button type="button" className="tt-mp-settings-back" onClick={() => router.back()} aria-label="กลับ">
          ‹
        </button>
      )}
      <h1>{title}</h1>
      {chatHref ? (
        <Link href={chatHref} className="tt-mp-settings-chat" aria-label="แชท">
          <IconLuxChat size={22} />
        </Link>
      ) : (
        <span className="tt-mp-settings-chat-spacer" />
      )}
    </header>
  );
}

type FieldModalProps = {
  open: boolean;
  title: string;
  label: string;
  value: string;
  type?: 'text' | 'date' | 'select';
  options?: string[];
  onClose: () => void;
  onSave: (value: string) => void | Promise<void>;
};

export function MpSettingsFieldModal({
  open,
  title,
  label,
  value,
  type = 'text',
  options,
  onClose,
  onSave,
}: FieldModalProps) {
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  if (!open) return null;

  const submit = async () => {
    setBusy(true);
    try {
      await onSave(draft);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tt-mp-settings-modal-backdrop" onClick={onClose}>
      <div className="tt-mp-settings-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <label className="tt-mp-settings-modal-label">{label}</label>
        {type === 'select' ? (
          <select
            className="tt-mp-settings-modal-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          >
            <option value="">เลือก</option>
            {(options || []).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : (
          <input
            className="tt-mp-settings-modal-input"
            type={type}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        )}
        <div className="tt-mp-settings-modal-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            ยกเลิก
          </button>
          <button type="button" className="primary" onClick={() => void submit()} disabled={busy}>
            บันทึก
          </button>
        </div>
      </div>
    </div>
  );
}

type ConfirmModalProps = {
  open: boolean;
  message: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

export function MpSettingsConfirmModal({ open, message, onCancel, onConfirm }: ConfirmModalProps) {
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  return (
    <div className="tt-mp-settings-modal-backdrop">
      <div className="tt-mp-settings-confirm">
        <p>{message}</p>
        <div className="tt-mp-settings-confirm-actions">
          <button type="button" onClick={onCancel} disabled={busy}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void Promise.resolve(onConfirm()).finally(() => setBusy(false));
            }}
          >
            ดำเนินการต่อ
          </button>
        </div>
      </div>
    </div>
  );
}
