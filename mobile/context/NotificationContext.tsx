import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  message: string;
  type: NotificationType;
  action?: ToastAction;
}

export type NotifyOptions = {
  action?: ToastAction;
  /** Default 3000ms, or 10000ms when `action` is set */
  durationMs?: number;
};

interface NotificationContextType {
  toasts: Toast[];
  notify: (message: string, type?: NotificationType, options?: NotifyOptions) => void;
  removeToast: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider = ({ children }: { children?: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    // Defensive: tolerate corrupted entries (e.g. undefined in array)
    setToasts((prev) => prev.filter((t) => t && t.id !== id));
  }, []);

  const notify = useCallback((message: string, type: NotificationType = 'info', options?: NotifyOptions) => {
    // Defensive: coerce unexpected runtime values (some callers pass non-string / undefined)
    const safeMessage =
      typeof message === 'string'
        ? message
        : message == null
          ? ''
          : String(message);
    if (!safeMessage.trim()) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setToasts((prev) => [...(Array.isArray(prev) ? prev.filter(Boolean) : []), { id, message: safeMessage, type, action: options?.action }]);
    const duration =
      options?.durationMs ?? (options?.action ? 10_000 : 3_000);
    setTimeout(() => {
      removeToast(id);
    }, duration);
  }, [removeToast]);

  return (
    <NotificationContext.Provider value={{ toasts, notify, removeToast }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};