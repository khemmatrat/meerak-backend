import React, { useState } from "react";
import { MessageSquare, Bell, ShieldCheck, X, Check } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import { lineConsentCopy } from "../i18n/lineConsentCopy";
import {
  getLineUserId,
  submitLineConsent,
} from "../services/lineOnboardingConsent";

type Props = {
  userId: string;
  open: boolean;
  onClose: () => void;
  onConnected?: () => void;
};

/**
 * Explicit LINE-connect consent modal. Shows exactly which messages we will send before asking to
 * connect (per Phase 3 spec: not just "link account"). Records consent server-side; nudges only go
 * out via LINE after this.
 */
export const LineConnectConsent: React.FC<Props> = ({
  userId,
  open,
  onClose,
  onConnected,
}) => {
  const { language } = useLanguage();
  const c = lineConsentCopy(language);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!open) return null;

  const handleAccept = async () => {
    setBusy(true);
    setMsg(null);
    const lineUserId = await getLineUserId();
    if (!lineUserId) {
      setMsg(c.unavailable);
      setBusy(false);
      return;
    }
    const res = await submitLineConsent(userId, lineUserId);
    setBusy(false);
    if (res.success) {
      setMsg(c.connected);
      onConnected?.();
      setTimeout(onClose, 900);
    } else {
      setMsg(c.failed);
    }
  };

  const scopeIcons = [<Bell size={16} key="b" />, <MessageSquare size={16} key="m" />];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md rounded-2xl shadow-xl overflow-hidden"
        style={{ backgroundColor: "#fff" }}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: "#E8D5B7", backgroundColor: "#F0FDF4" }}
        >
          <div className="flex items-center gap-2 font-bold" style={{ color: "#065f46" }}>
            <MessageSquare size={18} />
            {c.title}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="close"
            className="p-1 rounded-lg active:scale-95"
            style={{ color: "#6b7280" }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-4 py-4 space-y-3">
          <p className="text-sm" style={{ color: "#374151" }}>
            {c.intro}
          </p>
          <ul className="space-y-2">
            {c.scopes.map((s, i) => (
              <li key={s} className="flex items-start gap-2 text-sm" style={{ color: "#1f2937" }}>
                <span style={{ color: "#059669" }} className="mt-0.5">
                  {scopeIcons[i] || <MessageSquare size={16} />}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
          <div
            className="flex items-start gap-2 text-xs rounded-lg p-2.5"
            style={{ backgroundColor: "#F9FAFB", color: "#4b5563" }}
          >
            <ShieldCheck size={14} className="mt-0.5 shrink-0" style={{ color: "#059669" }} />
            <span>{c.promise}</span>
          </div>
          {msg ? (
            <p className="text-xs font-medium" style={{ color: "#065f46" }}>
              {msg}
            </p>
          ) : null}
        </div>

        <div className="px-4 pb-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleAccept}
            disabled={busy}
            className="w-full py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
            style={{ backgroundColor: "#06C755" }}
          >
            <Check size={18} />
            {c.accept}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="w-full py-2.5 rounded-xl font-semibold border"
            style={{ color: "#6b7280", borderColor: "#e5e7eb", backgroundColor: "#fff" }}
          >
            {c.decline}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LineConnectConsent;
