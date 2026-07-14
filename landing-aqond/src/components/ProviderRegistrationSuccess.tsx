import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  CheckCircle2,
  Loader2,
  Lock,
  X,
  Copy,
  Smartphone,
  Shield,
  ClipboardList,
} from 'lucide-react';

const STATUS_PENDING = 'กำลังตรวจสอบ';

type Tier = 'standard' | 'platinum';

function buildSteps(tier: Tier) {
  const base = [
    { id: 'submitted', label: 'ส่งใบสมัครเข้าระบบแล้ว', status: 'done' as const, icon: CheckCircle2 },
    {
      id: 'review',
      label:
        tier === 'platinum'
          ? 'ทีมกำลังตรวจสอบวิดีโอและโปรไฟล์ (Platinum)'
          : 'ทีมกำลังตรวจสอบข้อมูลและโปรไฟล์',
      status: 'current' as const,
      icon: Loader2,
    },
    {
      id: 'result',
      label: 'แจ้งผล — ผ่าน / ไม่ผ่าน / ขอข้อมูลเพิ่ม',
      status: 'next' as const,
      icon: Lock,
    },
  ];
  return base;
}

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

export default function ProviderRegistrationSuccess({
  onBack,
  applicationId,
  applicationTier = 'standard',
}: {
  onBack: () => void;
  applicationId?: string;
  applicationTier?: Tier;
}) {
  const [confettiShown, setConfettiShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const steps = buildSteps(applicationTier);

  useEffect(() => {
    if (!confettiShown) setConfettiShown(true);
  }, [confettiShown]);

  const copyId = () => {
    if (!applicationId) return;
    navigator.clipboard?.writeText(applicationId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const title =
    applicationTier === 'platinum'
      ? 'รับใบสมัคร Platinum แล้ว'
      : 'รับใบสมัครพาร์ทเนอร์แล้ว';

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
        className="relative min-h-[520px] flex flex-col items-center justify-center p-8 rounded-3xl overflow-hidden"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 20%, rgba(212,175,55,0.15) 0%, transparent 60%), #0a0a0f',
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
          className="text-2xl font-bold text-white text-center mb-2 px-2"
        >
          {title}
        </motion.h2>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold text-emerald-300"
        >
          <Shield className="h-3.5 w-3.5 shrink-0" />
          สถานะปัจจุบัน: {STATUS_PENDING}
        </motion.div>

        {applicationId && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28 }}
            className="w-full max-w-sm mb-6 rounded-xl border border-slate-600/60 bg-slate-900/50 p-3"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">รหัสอ้างอิง (เก็บไว้ติดตาม)</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate text-xs text-amber-200/95 font-mono">{applicationId}</code>
              <button
                type="button"
                onClick={copyId}
                className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-slate-800 px-2 py-1.5 text-[11px] font-medium text-slate-200 hover:bg-slate-700"
              >
                <Copy className="h-3.5 w-3.5" />
                {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
              </button>
            </div>
          </motion.div>
        )}

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-slate-400 text-center text-sm max-w-md mb-6 leading-relaxed px-2"
        >
          ขอบคุณที่ส่งข้อมูล — ทีมจะใช้รหัสอ้างอิงและเบอร์โทรที่ลงทะเบียนเพื่อติดต่อ
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="w-full max-w-sm space-y-2 mb-6 rounded-xl border border-slate-700/60 bg-slate-900/30 p-4 text-left"
        >
          <p className="text-xs font-bold text-slate-300 flex items-center gap-2 mb-2">
            <Smartphone className="h-4 w-4 text-cyan-400" /> ขั้นตอนถัดไป (มาตรฐานที่แนะนำ)
          </p>
          <ul className="space-y-2 text-xs text-slate-400 leading-relaxed">
            <li className="flex gap-2">
              <span className="text-emerald-500 font-bold">1.</span>
              เปิดแอป AQOND แล้ว<strong className="text-slate-300">ยืนยันเบอร์โทรด้วย OTP</strong> — ลดเบอร์ปลอมและผูกบัญชีให้สมบูรณ์
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-500 font-bold">2.</span>
              <strong className="text-slate-300">ติดตามสถานะใบสมัคร</strong> ในแอปหลังเข้าสู่ระบบ (กำลังตรวจสอบ → ผ่าน / ไม่ผ่าน / ขอข้อมูลเพิ่ม)
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-500 font-bold">3.</span>
              แจ้งผลทางอีเมล / การแจ้งเตือนในแอป — โปรดตรวจ Junk mail
            </li>
          </ul>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="w-full max-w-xs space-y-3 mb-6"
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 text-center flex items-center justify-center gap-1">
            <ClipboardList className="h-3.5 w-3.5" /> แทร็กกิ้ง (pipeline)
          </p>
          {steps.map((step) => (
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
                    step.status === 'done'
                      ? 'text-emerald-400'
                      : step.status === 'current'
                        ? 'text-amber-400'
                        : 'text-slate-500'
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
          className="text-amber-400/90 text-xs text-center mb-6 max-w-sm px-2"
        >
          โปรดตรวจสอบอีเมล (รวม Junk) ภายใน 24–48 ชม. สำหรับผลการพิจารณาเบื้องต้น
        </motion.p>

        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          onClick={onBack}
          className="px-8 py-3 rounded-xl border-2 border-slate-600 text-slate-300 font-semibold hover:bg-slate-800/50 hover:border-slate-500 hover:text-white transition-all"
        >
          กลับสู่หน้าหลัก
        </motion.button>
      </div>
    </div>
  );
}
