/**
 * AI Mode Toggle — สวิตช์ให้ Admin เลือก AI ตอบแทนอัตโนมัติ หรือ Manual (คุยเอง)
 */
import React from 'react';
import { Bot, User } from 'lucide-react';

interface AiModeToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}

export const AiModeToggle: React.FC<AiModeToggleProps> = ({ enabled, onChange, disabled }) => {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-slate-600">
        {enabled ? (
          <span className="flex items-center gap-1.5 text-emerald-600">
            <Bot size={14} /> AI ตอบแทน
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-indigo-600">
            <User size={14} /> Manual
          </span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={disabled}
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 ${
          enabled ? 'bg-emerald-600' : 'bg-slate-200'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
            enabled ? 'translate-x-5' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
};
