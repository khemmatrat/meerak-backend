import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Loader2, Lock, X } from 'lucide-react';

const STEPS = [
  { id: 'submitted', label: 'ข้อมูลถูกส่งเข้าระบบ', status: 'done', icon: CheckCircle2 },
  { id: 'review', label: 'กำลังประมวลผลและตรวจสอบคุณภาพวิดีโอ', status: 'current', icon: Loader2 },
  { id: 'result', label: 'ประกาศผลการคัดเลือกทางอีเมล', status: 'next', icon: Lock },
] as const;

const Confetti = () => {
  const [pieces] = useState(() =>
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      duration: 2 + Math.random() * 2,
      color: Math.random() > 0.5 ? '#D4AF37' : '#C0C0C0',
      size: 4 + Math.random() * 6,
      rotation: Math.random() * 360,
    }))
  );

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-sm animate-confetti-fall"
          style={{
            left: `${p.left}%`,
            top: '-10px',
            width: p.size,
            height: p.size * 1.5,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotation}deg)`,
          }}
        />
      ))}
    </div>
  );
};

export default function ProviderRegistrationSuccess({ onBack }: { onBack: () => void }) {
  const [confettiShown, setConfettiShown] = useState(false);

  useEffect(() => {
    if (!confettiShown) {
      setConfettiShown(true);
    }
  }, [confettiShown]);

  return (
    <div className="relative">
      <button
        onClick={onBack}
        className="absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors z-10"
        aria-label="ปิด"
      >
        <X size={20} />
      </button>
    <div
      className="relative min-h-[480px] flex flex-col items-center justify-center p-8 rounded-3xl overflow-hidden"
      style={{
        background: 'radial-gradient(ellipse 80% 60% at 50% 20%, rgba(212,175,55,0.15) 0%, transparent 60%), #0a0a0f',
        fontFamily: 'var(--font-sans), "Plus Jakarta Sans", sans-serif',
      }}
    >
      {confettiShown && <Confetti />}

      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        className="relative w-24 h-24 flex items-center justify-center mb-6"
      >
        <div className="absolute w-24 h-24 rounded-full bg-amber-400/30 animate-ping" style={{ animationDuration: '2s' }} />
        <div className="absolute w-24 h-24 rounded-full bg-amber-500/20 animate-pulse" style={{ animationDuration: '1.5s' }} />
        <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-[0_0_40px_rgba(212,175,55,0.5)]">
          <CheckCircle2 className="w-10 h-10 text-white" strokeWidth={2.5} />
        </div>
      </motion.div>

      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-2xl font-bold text-white text-center mb-3"
      >
        ก้าวแรกสู่ระดับ Platinum เริ่มต้นขึ้นแล้ว
      </motion.h2>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-slate-400 text-center text-sm max-w-sm mb-6 leading-relaxed"
      >
        เราได้รับทักษะอันยอดเยี่ยมของคุณแล้ว ขอบคุณที่ร่วมเป็นส่วนหนึ่งของการสร้างมาตรฐานใหม่ใน AQOND
        ขณะนี้ระบบ Auto-pilot ของเรากำลังนำส่งข้อมูลวิดีโอของคุณไปยังทีมคัดกรองระดับ Platinum
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="w-full max-w-xs space-y-4 mb-8"
      >
        {STEPS.map((step, i) => (
          <div
            key={step.id}
            className="flex items-center gap-4 p-3 rounded-xl border border-slate-700/50 bg-slate-900/30"
          >
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                step.status === 'done'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : step.status === 'current'
                    ? 'bg-amber-500/20 text-amber-400'
                    : 'bg-slate-700/50 text-slate-500'
              }`}
            >
              {step.status === 'done' ? (
                <CheckCircle2 size={20} />
              ) : step.status === 'current' ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <Lock size={18} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p
                className={`text-sm font-medium ${
                  step.status === 'done' ? 'text-emerald-400' : step.status === 'current' ? 'text-amber-400' : 'text-slate-500'
                }`}
              >
                {step.label}
              </p>
            </div>
          </div>
        ))}
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="text-amber-400/90 text-xs text-center mb-6 max-w-xs"
      >
        โปรดตรวจสอบอีเมลของคุณ (รวมถึงใน Junk mail) ภายใน 24 ชม. เพื่อรับผลการประเมินทักษะ
      </motion.p>

      <motion.button
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        onClick={onBack}
        className="px-8 py-3 rounded-xl border-2 border-slate-600 text-slate-300 font-semibold hover:bg-slate-800/50 hover:border-slate-500 hover:text-white transition-all"
      >
        กลับสู่หน้าหลัก
      </motion.button>
    </div>
    </div>
  );
}
