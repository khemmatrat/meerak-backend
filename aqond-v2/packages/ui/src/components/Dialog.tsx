'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function Dialog({ open, onClose, title, children, footer }: Props) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useLockBodyScroll(open);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className={`aq-dialog-root${visible ? ' aq-dialog-root--open' : ''}`}
      role="presentation"
    >
      <button
        type="button"
        className="aq-dialog-backdrop"
        aria-label="ปิด"
        onClick={onClose}
      />
      <div
        className={`aq-dialog-panel${visible ? ' aq-dialog-panel--open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'aq-dialog-title' : undefined}
      >
        {title && (
          <div className="aq-dialog-header">
            <h2 id="aq-dialog-title" className="aq-dialog-title">
              {title}
            </h2>
            <button type="button" className="aq-dialog-close" onClick={onClose} aria-label="ปิด">
              ×
            </button>
          </div>
        )}
        <div className="aq-dialog-body">{children}</div>
        {footer && <div className="aq-dialog-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
