import React, { useState } from "react";
import { Copy, Check, Share2 } from "lucide-react";

interface ConnectionKeyCardProps {
  connectionKey: string;
  onCopy?: () => void;
  className?: string;
}

/** รหัส 8 หลักเด่นเหมือนรหัสแนะนำเพื่อน — One-click copy สำหรับส่งให้โค้ชทาง Line/Messenger */
export const ConnectionKeyCard: React.FC<ConnectionKeyCardProps> = ({
  connectionKey,
  onCopy,
  className = "",
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const text = connectionKey || "";
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      onCopy?.();
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      className={`rounded-xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-5 shadow-md ${className}`}
      title="ส่งรหัสนี้ให้โค้ชของคุณทาง Line หรือ Messenger เพื่อให้โค้ชเพิ่มคุณเป็นศิษย์"
    >
      <div className="flex items-center gap-2 mb-1">
        <Share2 size={18} className="text-emerald-600" />
        <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">
          รหัสของคุณ
        </span>
      </div>
      <div className="flex items-center justify-between gap-4 mt-2">
        <code
          className="text-2xl sm:text-3xl font-bold tracking-[0.3em] text-emerald-800 font-mono bg-white/60 px-4 py-3 rounded-lg border border-emerald-100"
          style={{ letterSpacing: "0.2em" }}
        >
          {connectionKey || "—"}
        </code>
        <button
          onClick={handleCopy}
          className="flex-shrink-0 flex items-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all active:scale-95"
          title="คัดลอก"
        >
          {copied ? (
            <>
              <Check size={20} className="text-white" />
              <span>คัดลอกแล้ว!</span>
            </>
          ) : (
            <>
              <Copy size={20} />
              <span>คัดลอก</span>
            </>
          )}
        </button>
      </div>
      <p className="text-xs text-emerald-600/90 mt-3">
        ส่งรหัสนี้ให้โค้ชของคุณทาง Line หรือ Messenger เพื่อให้โค้ชเพิ่มคุณเป็นศิษย์
      </p>
    </div>
  );
};
