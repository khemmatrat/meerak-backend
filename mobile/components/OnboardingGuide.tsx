import React, { useState, useEffect } from 'react';
import { X, ChevronRight, Home, Briefcase, Wallet, User, Sparkles } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

const STORAGE_KEY = 'aqond_onboarding_seen';

export const OnboardingGuide: React.FC = () => {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      const seen = localStorage.getItem(STORAGE_KEY);
      if (!seen) setIsOpen(true);
    } catch (_) {
      setIsOpen(true);
    }
  }, []);

  const handleClose = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch (_) {}
    setIsOpen(false);
  };

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      handleClose();
    }
  };

  const steps = [
    {
      icon: Home,
      title: t('onboarding.step1_title'),
      desc: t('onboarding.step1_desc'),
    },
    {
      icon: Briefcase,
      title: t('onboarding.step2_title'),
      desc: t('onboarding.step2_desc'),
    },
    {
      icon: Wallet,
      title: t('onboarding.step3_title'),
      desc: t('onboarding.step3_desc'),
    },
    {
      icon: User,
      title: t('onboarding.step4_title'),
      desc: t('onboarding.step4_desc'),
    },
  ];

  if (!isOpen) return null;

  const current = steps[step];
  const Icon = current.icon;
  const isLast = step === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300">
        {/* Header */}
        <div className="px-6 pt-6 flex justify-between items-start">
          <div className="flex items-center gap-2">
            <Sparkles size={20} className="text-emerald-500" />
            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
              {t('onboarding.guide_title')}
            </span>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            aria-label={t('onboarding.skip')}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-8 text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <Icon size={32} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
            {current.title}
          </h3>
          <p className="text-sm text-gray-600 dark:text-slate-300 leading-relaxed">
            {current.desc}
          </p>
        </div>

        {/* Dots */}
        <div className="flex justify-center gap-2 pb-4">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === step
                  ? 'bg-emerald-500 w-4'
                  : 'bg-gray-200 dark:bg-slate-600'
              }`}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={handleClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300 font-medium hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors text-sm"
          >
            {t('onboarding.skip')}
          </button>
          <button
            onClick={handleNext}
            className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 text-sm"
          >
            {isLast ? t('onboarding.start') : t('onboarding.next')}
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};
