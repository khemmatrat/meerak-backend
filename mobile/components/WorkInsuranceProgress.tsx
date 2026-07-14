/**
 * AQOND Wow 3: Work Insurance Progress — แสดงความคืบหน้าประกันงานระหว่าง Project Lifecycle
 */
import React from 'react';
import { Shield, CheckCircle, Clock } from 'lucide-react';

type Phase = 'matched' | 'in_progress' | 'completed' | 'released';

interface WorkInsuranceProgressProps {
  phase: Phase;
  className?: string;
  /** default = เต็มการ์ด | compact = แถบเดียวใต้ stepper (ไม่แย่งโฟกัสกับขั้นตอนงาน) */
  variant?: 'default' | 'compact';
}

const PHASES: { id: Phase; label: string; icon: React.ReactNode }[] = [
  { id: 'matched', label: 'จับคู่แล้ว', icon: <CheckCircle size={16} /> },
  { id: 'in_progress', label: 'กำลังทำงาน', icon: <Clock size={16} /> },
  { id: 'completed', label: 'งานเสร็จ', icon: <CheckCircle size={16} /> },
  { id: 'released', label: 'ปล่อยเงิน', icon: <Shield size={16} /> },
];

export const WorkInsuranceProgress: React.FC<WorkInsuranceProgressProps> = ({
  phase,
  className = '',
  variant = 'default',
}) => {
  const phaseIndex = PHASES.findIndex((p) => p.id === phase);
  const progress = phaseIndex >= 0 ? ((phaseIndex + 1) / PHASES.length) * 100 : 0;

  if (variant === 'compact') {
    return (
      <div
        className={`flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/80 px-3 py-2.5 ${className}`}
      >
        <Shield size={18} className="shrink-0 text-blue-600" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-blue-900">Work Insurance</p>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-blue-200/90">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <span className="shrink-0 text-[10px] font-medium tabular-nums text-blue-700">
          {phaseIndex >= 0 ? `${phaseIndex + 1}/${PHASES.length}` : '—'}
        </span>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20 p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <Shield size={20} className="text-blue-600 dark:text-blue-400" />
        <span className="font-bold text-blue-800 dark:text-blue-200">Work Insurance</span>
      </div>
      <div className="h-2 bg-blue-200 dark:bg-blue-800 rounded-full overflow-hidden mb-3">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex justify-between text-xs">
        {PHASES.map((p, i) => (
          <span
            key={p.id}
            className={`flex items-center gap-1 ${
              i <= phaseIndex ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-400'
            }`}
          >
            {p.icon}
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
};
