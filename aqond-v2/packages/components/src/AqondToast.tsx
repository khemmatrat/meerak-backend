'use client';

import React from 'react';

export type AqondToastTone = 'info' | 'success' | 'error' | 'warning';

export type AqondToastProps = {
  message: string;
  tone?: AqondToastTone;
  visible?: boolean;
  onClose?: () => void;
  className?: string;
};

export function AqondToast({
  message,
  tone = 'info',
  visible = true,
  onClose,
  className = '',
}: AqondToastProps) {
  if (!visible || !message) return null;

  return (
    <div
      className={`aqond-toast aqond-toast--${tone} ${className}`.trim()}
      role="status"
      aria-live="polite"
    >
      <span>{message}</span>
      {onClose && (
        <button type="button" className="aqond-toast-close" onClick={onClose} aria-label="ปิด">
          ×
        </button>
      )}
    </div>
  );
}
