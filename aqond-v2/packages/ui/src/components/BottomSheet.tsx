'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Footer slot (e.g. action buttons) */
  footer?: React.ReactNode;
};

export function BottomSheet({ open, onClose, title, children, footer }: Props) {
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
      className={`aq-sheet-root${visible ? ' aq-sheet-root--open' : ''}`}
      role="presentation"
    >
      <button
        type="button"
        className="aq-sheet-backdrop"
        aria-label="ปิด"
        onClick={onClose}
      />
      <div
        className={`aq-sheet-panel${visible ? ' aq-sheet-panel--open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'aq-sheet-title' : undefined}
      >
        <div className="aq-sheet-handle" aria-hidden />
        {title && (
          <div className="aq-sheet-header">
            <h2 id="aq-sheet-title" className="aq-sheet-title">
              {title}
            </h2>
            <button type="button" className="aq-sheet-close" onClick={onClose} aria-label="ปิด">
              ×
            </button>
          </div>
        )}
        <div className="aq-sheet-body">{children}</div>
        {footer && <div className="aq-sheet-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
