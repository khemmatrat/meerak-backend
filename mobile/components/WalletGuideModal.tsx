import React, { useState } from 'react';
import { X, ChevronRight, ArrowDownCircle, ArrowUpCircle, Clock, Shield } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export const WalletGuideModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  const { t } = useLanguage();
  const [step, setStep] = useState(0);

  const steps = [
    {
      icon: ArrowDownCircle,
      title: t('wallet_guide.deposit_title'),
      desc: t('wallet_guide.deposit_desc'),
    },
    {
      icon: ArrowUpCircle,
      title: t('wallet_guide.withdraw_title'),
      desc: t('wallet_guide.withdraw_desc'),
    },
    {
      icon: Clock,
      title: t('wallet_guide.time_title'),
      desc: t('wallet_guide.time_desc'),
    },
    {
      icon: Shield,
      title: t('wallet_guide.rules_title'),
      desc: t('wallet_guide.rules_desc'),
    },
  ];

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      onClose();
    }
  };

  if (!isOpen) return null;

  const current = steps[step];
  const Icon = current.icon;
  const isLast = step === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-6 pt-6 flex justify-between items-center border-b border-gray-100 dark:border-slate-600 pb-4">
          <h3 className="text-base font-bold text-gray-900 dark:text-slate-100">
            {t('wallet_guide.title')}
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-600 transition-colors"
            aria-label={t('wallet_guide.close')}
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-6">
          <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <Icon size={28} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-xs text-gray-400 dark:text-slate-500 text-center mb-2">
            {step + 1} / {steps.length}
          </p>
          <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-3 text-center">
            {current.title}
          </h4>
          <p className="text-sm text-gray-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
            {current.desc}
          </p>
        </div>

        <div className="flex justify-center gap-2 pb-4">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? 'bg-emerald-500 w-5' : 'bg-gray-200 dark:bg-slate-600 w-1.5'
              }`}
            />
          ))}
        </div>

        <div className="px-6 pb-6">
          <button
            onClick={handleNext}
            className="w-full py-3 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
          >
            {isLast ? t('wallet_guide.done') : t('wallet_guide.next')}
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};
