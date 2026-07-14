import React, { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { getSupportCrisisAlert, getAdminToken } from '../services/adminApi';

const POLL_MS = 30_000;

/**
 * Crisis Heatmap — แบนเนอร์แดงเมื่อตรวจพบคลื่นข้อความซ้ำผิดปกติ (backend in-memory + threshold)
 */
export const CrisisAlertBanner: React.FC = () => {
  const [dismissed, setDismissed] = useState(false);
  const [data, setData] = useState<Awaited<ReturnType<typeof getSupportCrisisAlert>> | null>(null);

  const fetchAlert = useCallback(async () => {
    if (!getAdminToken()) {
      setData(null);
      return;
    }
    try {
      const res = await getSupportCrisisAlert();
      setData(res);
      if (res?.active) setDismissed(false);
    } catch {
      setData(null);
    }
  }, []);

  useEffect(() => {
    fetchAlert();
    const t = setInterval(fetchAlert, POLL_MS);
    return () => clearInterval(t);
  }, [fetchAlert]);

  if (!data?.active || dismissed) return null;

  const top = data.incidents?.[0];
  const detail = top
    ? `รูปแบบ "${String(top.signature).slice(0, 120)}${String(top.signature).length > 120 ? '…' : ''}" ปรากฏ ${top.count} ครั้งใน ${data.windowMinutes} นาที (เกณฑ์ ${data.threshold})`
    : 'ตรวจพบความผิดปกติของคิว Support';

  return (
    <div
      role="alert"
      className="shrink-0 bg-gradient-to-r from-rose-700 to-red-600 text-white px-4 py-3 flex items-start gap-3 shadow-lg border-b border-rose-900/30"
    >
      <AlertTriangle className="shrink-0 mt-0.5" size={22} />
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm">Crisis Heatmap — แจ้งเตือนคลื่นปัญหา</p>
        <p className="text-xs text-rose-100 mt-1 leading-relaxed">{detail}</p>
        <p className="text-[11px] text-rose-200/90 mt-1">
          พิจารณาเปิด Banner แจ้งปิดปรับปรุงในแอป และประสานทีม — อย่ารอให้ข่าวระบบแพร่บนโซเชียลก่อน
        </p>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="p-1.5 rounded-lg hover:bg-white/10 text-white/90"
        title="ซ่อนชั่วคราว (จะกลับมาเมื่อมีเหตุใหม่)"
      >
        <X size={18} />
      </button>
    </div>
  );
};
