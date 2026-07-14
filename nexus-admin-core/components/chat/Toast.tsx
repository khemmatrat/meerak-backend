/**
 * Toast — แจ้งเตือนชั่วคราว (Knowledge Saved, etc.)
 */
import React, { useEffect } from 'react';

interface ToastProps {
  message: string;
  visible: boolean;
  onHide: () => void;
  durationMs?: number;
}

export const Toast: React.FC<ToastProps> = ({ message, visible, onHide, durationMs = 2500 }) => {
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(onHide, durationMs);
    return () => clearTimeout(t);
  }, [visible, onHide, durationMs]);

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-6 right-6 z-[9999] px-4 py-2.5 bg-amber-500 text-white text-sm font-medium rounded-lg shadow-lg"
      role="alert"
    >
      {message}
    </div>
  );
};
