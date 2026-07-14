import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, ExternalLink, Loader2 } from 'lucide-react';
import { addUserRegistration } from '../services/firebaseService';
import { submitLandingLeadToBackend } from '../services/landingLeadApi';

function splitFullName(full: string): { first_name: string | null; last_name: string | null } {
  const t = full.trim();
  if (!t) return { first_name: null, last_name: null };
  const i = t.indexOf(' ');
  if (i === -1) return { first_name: t, last_name: null };
  return { first_name: t.slice(0, i), last_name: t.slice(i + 1).trim() || null };
}

export type AudiencePreAppIntent = 'provider' | 'user';

type Props = {
  open: boolean;
  onClose: () => void;
  intent: AudiencePreAppIntent;
  appRegisterUrl: string;
  referralCode?: string | null;
};

export function AudiencePreAppModal({ open, onClose, intent, appRegisterUrl, referralCode }: Props) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [interest, setInterest] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const registerHref = `${String(appRegisterUrl).replace(/\/$/, '')}/#/register${referralCode ? `?ref=${encodeURIComponent(referralCode)}` : ''}`;

  const interestLabel =
    intent === 'provider'
      ? 'AudienceHub · Talent/Provider — สมัครพาร์ทเนอร์ / โชว์ทักษะ'
      : 'AudienceHub · User — จองสิทธิ์ / ผู้ใช้งาน';

  const reset = () => {
    setName('');
    setContact('');
    setInterest('');
    setDone(false);
    setErr(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    const interestFinal = interest.trim() || interestLabel;
    const { first_name, last_name } = splitFullName(name);

    const [fb, api] = await Promise.all([
      addUserRegistration({
        name: name.trim(),
        interestService: interestFinal,
        contact: contact.trim(),
        referralCode: referralCode || undefined,
      }),
      submitLandingLeadToBackend({
        full_name: name.trim() || null,
        contact: contact.trim(),
        interest_service: interestFinal,
        first_name,
        last_name,
      }),
    ]);

    setLoading(false);
    if (fb.success || api.ok) {
      setDone(true);
    } else {
      setErr('ส่งไม่สำเร็จ — กรุณาลองอีกครั้งหรือใช้ปุ่มไปสมัครแอปด้านล่าง');
    }
  };

  const title = 'ลงทะเบียนเบื้องต้น — แล้วไปแอป AQOND';

  const subtitle =
    intent === 'provider'
      ? 'กรอกข้อมูลให้ทีมติดต่อได้ — จากนั้นเปิดสมัครสมาชิกแอปในขั้นตอนถัดไป'
      : 'กรอกข้อมูลเพื่อจองสิทธิ์ / รับการติดต่อ — แล้วสมัครแอปเมื่อพร้อม';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto border border-slate-200"
          >
            <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{title}</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{subtitle}</p>
              </div>
              <button type="button" onClick={handleClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="ปิด">
                <X size={20} />
              </button>
            </div>

            {!done ? (
              <form onSubmit={onSubmit} className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">ชื่อ-นามสกุล *</label>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-600 focus:border-transparent text-sm"
                    placeholder="ชื่อที่ใช้ติดต่อ"
                    autoComplete="name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">อีเมลหรือเบอร์โทร *</label>
                  <input
                    required
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-600 focus:border-transparent text-sm"
                    placeholder="ใช้ยืนยันและติดต่อกลับ"
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">สายงาน / ความสนใจ (ถ้ามี)</label>
                  <input
                    value={interest}
                    onChange={(e) => setInterest(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-600 focus:border-transparent text-sm"
                    placeholder={intent === 'provider' ? 'เช่น ช่างแอร์, ไรเดอร์' : 'เช่น จ้างงานบ้าน, ส่วนลด'}
                  />
                </div>
                {err && <p className="text-sm text-red-600">{err}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 disabled:opacity-60"
                >
                  {loading ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                  {loading ? 'กำลังส่ง...' : 'ส่งข้อมูล — ขั้นตอนถัดไป: แอป'}
                </button>
                <p className="text-[11px] text-slate-400 text-center leading-relaxed">
                  ข้อมูลถูกเก็บในระบบ AQOND (รวมถึงฐานข้อมูลสำหรับทีมงาน) — ไม่แทนที่การสมัครสมาชิกในแอป
                </p>
                <a
                  href={registerHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center text-sm text-emerald-700 font-semibold hover:underline"
                >
                  ข้ามฟอร์ม — ไปสมัครแอปโดยตรง
                </a>
              </form>
            ) : (
              <div className="p-6 space-y-4">
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-900">
                  <p className="font-bold">รับข้อมูลแล้ว</p>
                  <p className="text-xs mt-1 text-emerald-800/90">ขั้นตอนถัดไป: สมัครสมาชิกในแอป AQOND และยืนยันเบอร์ (OTP) เมื่อพร้อม</p>
                </div>
                <a
                  href={registerHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-800"
                >
                  <ExternalLink size={18} />
                  เปิดหน้าสมัครสมาชิกแอป
                </a>
                <button type="button" onClick={handleClose} className="w-full py-3 rounded-xl border border-slate-200 font-semibold text-slate-700 hover:bg-slate-50">
                  ปิด
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
