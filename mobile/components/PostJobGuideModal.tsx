import React, { useState } from 'react';
import { X, ChevronRight, Zap, Briefcase, Users, CalendarCheck } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export const PostJobGuideModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  /** เรียกเมื่อผู้ใช้ดูจบหรือข้าม เพื่อเปิด PostJobChoiceModal ต่อ */
  onComplete?: () => void;
}> = ({ isOpen, onClose, onComplete }) => {
  const { t } = useLanguage();
  const [step, setStep] = useState(0);

  const steps = [
    {
      icon: Zap,
      title: t('post_guide.step1_title'),
      desc: t('post_guide.step1_desc'),
    },
    {
      icon: Briefcase,
      title: t('post_guide.step2_title'),
      desc: t('post_guide.step2_desc'),
    },
    {
      icon: Users,
      title: t('post_guide.step3_title'),
      desc: t('post_guide.step3_desc'),
    },
    {
      icon: CalendarCheck,
      title: t('post_guide.step4_title'),
      desc: t('post_guide.step4_desc'),
    },
  ];

  const handleClose = () => {
    onClose();
    setStep(0);
  };

  const handleComplete = () => {
    try {
      localStorage.setItem('post_job_guide_seen', '1');
    } catch (_) {}
    handleClose();
    onComplete?.();
  };

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      handleComplete();
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  if (!isOpen) return null;

  const current = steps[step];
  const Icon = current.icon;
  const isLast = step === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[10042] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="luxury-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-white/20">
        {/* Header */}
        <div className="px-6 pt-6 flex justify-between items-center border-b border-slate-600/50 pb-4">
          <h3 className="text-base font-bold text-slate-100">
            {t('post_guide.title')}
          </h3>
          <button
            onClick={handleSkip}
            className="p-2 rounded-xl text-slate-400 hover:bg-slate-700/50 hover:text-white transition-colors"
            aria-label={t('post_guide.skip')}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-slate-700/60 flex items-center justify-center">
            <Icon size={28} className="text-amber-400" />
          </div>
          <p className="text-xs text-slate-400 text-center mb-2">
            {step + 1} / {steps.length}
          </p>
          <h4 className="text-lg font-bold text-slate-100 mb-3 text-center">
            {current.title}
          </h4>
          <p className="text-sm text-slate-300 leading-relaxed text-center">
            {current.desc}
          </p>
        </div>

        {/* Dots */}
        <div className="flex justify-center gap-2 pb-4">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? 'bg-amber-400 w-5' : 'bg-slate-600 w-1.5'
              }`}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={handleSkip}
            className="flex-1 py-3 rounded-xl border border-slate-600 text-slate-400 font-medium hover:bg-slate-700/50 hover:text-slate-200 transition-colors text-sm"
          >
            {t('post_guide.skip')}
          </button>
          <button
            onClick={handleNext}
            className="flex-1 py-3 rounded-xl bg-amber-500 text-slate-900 font-bold hover:bg-amber-400 transition-colors flex items-center justify-center gap-2 text-sm"
          >
            {isLast ? t('post_guide.start') : t('post_guide.next')}
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};
