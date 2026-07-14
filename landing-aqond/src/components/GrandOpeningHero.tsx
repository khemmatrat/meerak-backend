import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Sparkles,
  Star,
  Video,
  MapPin,
  Users,
  Gift,
  Send,
} from 'lucide-react';
import type { GrandOpeningCountdownState } from '../shared/useGrandOpeningCountdown';
import { addUserRegistration, getStats } from '../services/firebaseService';
import { getBackendBaseUrl, submitLandingLeadToBackend } from '../services/landingLeadApi';

function splitFullName(full: string): { first_name: string | null; last_name: string | null } {
  const t = full.trim();
  if (!t) return { first_name: null, last_name: null };
  const i = t.indexOf(' ');
  if (i === -1) return { first_name: t, last_name: null };
  return { first_name: t.slice(0, i), last_name: t.slice(i + 1).trim() || null };
}

const BONUS_TEXT =
  'สมัครก่อนเปิดระบบ รับค่าธรรมเนียม 0 บาท สำหรับ 10 งานแรก!';

type Props = {
  go: GrandOpeningCountdownState;
  onOpenProvider: () => void;
  onOpenUser: () => void;
  /** ฐาน URL ของแอป (สมัครสมาชิก) — ค่าเริ่มต้นจาก VITE_APP_URL */
  appRegisterUrl?: string;
};

export function GrandOpeningHero({
  go,
  onOpenProvider,
  onOpenUser,
  appRegisterUrl = import.meta.env.VITE_APP_URL || 'https://app.aqond.com',
}: Props) {
  const registerHref = `${String(appRegisterUrl).replace(/\/$/, '')}/#/register`;
  const [community, setCommunity] = useState<number | null>(null);
  const [pricePerKm, setPricePerKm] = useState<number | null>(null);
  const [pricingLoading, setPricingLoading] = useState(true);
  const [earlyLoading, setEarlyLoading] = useState(false);
  const [earlyMsg, setEarlyMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [earlyForm, setEarlyForm] = useState({ name: '', contact: '', interest: '' });
  const [earlyKyc, setEarlyKyc] = useState({ nationalId: '', dateOfBirth: '', address: '' });

  useEffect(() => {
    getStats()
      .then((s) => setCommunity(s.totalUsers + s.totalProviders))
      .catch(() => setCommunity(null));
  }, []);

  useEffect(() => {
    const api = getBackendBaseUrl();
    fetch(`${api}/api/settings/pricing`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && typeof d.price_per_km_thb === 'number') setPricePerKm(d.price_per_km_thb);
        else setPricePerKm(25);
      })
      .catch(() => setPricePerKm(25))
      .finally(() => setPricingLoading(false));
  }, []);

  const submitEarly = async (e: React.FormEvent) => {
    e.preventDefault();
    setEarlyLoading(true);
    setEarlyMsg(null);
    const interest = earlyForm.interest || 'Early registration (Grand Opening)';
    const { first_name, last_name } = splitFullName(earlyForm.name);
    const nid = earlyKyc.nationalId.replace(/\D/g, '').slice(0, 13);

    const [fb, api] = await Promise.all([
      addUserRegistration({
        name: earlyForm.name,
        interestService: interest,
        contact: earlyForm.contact,
      }),
      submitLandingLeadToBackend({
        full_name: earlyForm.name.trim() || null,
        contact: earlyForm.contact.trim(),
        interest_service: interest,
        first_name,
        last_name,
        national_id: nid.length >= 5 ? nid : null,
        date_of_birth: earlyKyc.dateOfBirth || null,
        address: earlyKyc.address.trim() || null,
      }),
    ]);

    setEarlyLoading(false);

    if (fb.success && api.ok) {
      setEarlyMsg({ type: 'ok', text: 'ลงทะเบียนรอเปิดระบบแล้ว — เราจะแจ้งเตือนคุณ!' });
      setEarlyForm({ name: '', contact: '', interest: '' });
      setEarlyKyc({ nationalId: '', dateOfBirth: '', address: '' });
    } else if (fb.success && !api.ok) {
      setEarlyMsg({
        type: 'ok',
        text: 'ลงทะเบียนแล้ว — บันทึกเซิร์ฟเวอร์ช้าหรือไม่สำเร็จ คุณยังได้รับการแจ้งเตือนผ่านระบบเดิม',
      });
      setEarlyForm({ name: '', contact: '', interest: '' });
    } else if (!fb.success && api.ok) {
      setEarlyMsg({
        type: 'ok',
        text: 'บันทึกข้อมูลของคุณแล้ว — ระบบแจ้งเตือนสำรองอาจยังไม่สมบูรณ์ กรุณาตรวจอีเมล/โทรอีกครั้ง',
      });
    } else {
      setEarlyMsg({ type: 'err', text: 'ส่งไม่สำเร็จ กรุณาลองใหม่' });
    }
  };

  const unit = (label: string, value: number, isDay?: boolean) => (
    <div className="flex flex-col items-center min-w-[3.5rem] sm:min-w-[4.25rem]">
      <span
        className="aqond-countdown-num tabular-nums text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tighter"
        aria-live="polite"
      >
        {isDay ? String(value) : String(value).padStart(2, '0')}
      </span>
      <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
        {label}
      </span>
    </div>
  );

  return (
    <div className="z-10 max-w-xl lg:max-w-none">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="space-y-6"
      >
        {/* หัวข้อหลัก */}
        <div>
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold tracking-wide bg-gradient-to-r from-cyan-500/12 via-violet-500/12 to-fuchsia-500/12 text-slate-800 border border-slate-200/80 mb-3">
            <Sparkles size={14} className="text-cyan-600 shrink-0" />
            Grand Opening · 24 เม.ย. 2569 · 01:00 น. (เวลาไทย)
          </span>
          <h1 className="text-3xl sm:text-4xl lg:text-[2.5rem] font-extrabold leading-[1.12] tracking-tight text-slate-900">
            <span className="flex items-center gap-3 sm:gap-4">
              <img
                src="/logo.png"
                alt=""
                className="h-11 w-11 sm:h-12 sm:w-12 lg:h-14 lg:w-14 object-contain shrink-0"
                width={56}
                height={56}
                aria-hidden
              />
              <span className="text-emerald-700">AQOND</span>
            </span>
            <span className="block mt-2 text-xl sm:text-2xl font-bold text-slate-800">
              เปิดระบบพร้อมกันทั่วประเทศ
            </span>
          </h1>
          <p className="mt-3 text-sm sm:text-base text-slate-600 leading-relaxed max-w-xl">
            เตรียมพบกับมิติใหม่ของการจ้างงานและรับ-ส่งคน — เปิดระบบพร้อมกันทั่วประเทศ
          </p>
        </div>

        {!go.isLive ? (
          <div
            id="landing-early-reg"
            className="scroll-mt-28 rounded-3xl border border-slate-200/90 bg-white shadow-[0_8px_40px_-12px_rgba(15,23,42,0.12)] overflow-hidden"
          >
            {/* Countdown — แถบเข้ม */}
            <div
              className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4 py-5 sm:px-6 sm:py-6"
              role="timer"
              aria-label="นับถอยหลังจนกว่าเปิดระบบ"
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300/90 mb-4">
                Countdown · Asia/Bangkok
              </p>
              <div className="flex flex-wrap items-end justify-center sm:justify-start gap-2 sm:gap-3 md:gap-5">
                {unit('Days', go.days, true)}
                <span className="hidden sm:inline text-slate-600 text-2xl font-light pb-0.5" aria-hidden>
                  :
                </span>
                {unit('Hours', go.hours)}
                <span className="hidden sm:inline text-slate-600 text-2xl font-light pb-0.5" aria-hidden>
                  :
                </span>
                {unit('Min', go.minutes)}
                <span className="hidden sm:inline text-slate-600 text-2xl font-light pb-0.5" aria-hidden>
                  :
                </span>
                {unit('Sec', go.seconds)}
              </div>
            </div>

            {/* โบนัส + สังคม */}
            <div className="px-4 py-3 sm:px-6 bg-slate-50/90 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/60 bg-amber-50 px-3 py-1.5 text-[11px] font-bold text-amber-950">
                <Gift size={13} className="shrink-0 text-amber-600" />
                {BONUS_TEXT}
              </span>
              {community != null && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
                  <Users size={15} className="text-emerald-600 shrink-0" />
                  ผู้ร่วมรอเปิดระบบ{' '}
                  <strong className="text-emerald-700">{community.toLocaleString('th-TH')}</strong> คน
                </span>
              )}
            </div>

            {/* ราคา */}
            <div className="px-4 py-3 sm:px-6 border-b border-slate-100 flex gap-3 items-start bg-white">
              <MapPin className="text-emerald-600 shrink-0 mt-0.5" size={18} />
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-emerald-800 uppercase tracking-wide">
                  ราคาต่อกิโลเมตร (จากระบบแอดมิน)
                </p>
                <p className="text-slate-800 font-semibold text-sm mt-0.5">
                  {pricingLoading ? (
                    <span className="text-slate-500 font-normal">กำลังโหลด...</span>
                  ) : (
                    <>
                      <strong className="text-emerald-700">{pricePerKm?.toLocaleString('th-TH')} ฿</strong>
                      <span className="text-slate-600 font-normal"> / กม. — โปร่งใส เปรียบเทียบได้</span>
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* Early registration — ทางเลือก (แจ้งเตือน) ไม่ใช่เงื่อนไขก่อนสมัครแอป */}
            <div className="px-4 py-6 sm:px-6 bg-white">
              <div className="mb-4 rounded-2xl border border-emerald-200/90 bg-gradient-to-br from-emerald-50/95 to-white px-4 py-3.5">
                <p className="text-sm font-bold text-emerald-950">สมัครสมาชิก AQOND ได้ทันที</p>
                <p className="mt-1 text-xs text-emerald-900/85 leading-relaxed">
                  ไม่ต้องรอ Grand Opening และไม่จำเป็นต้องกรอกฟอร์มด้านล่าง — ฟอร์มนี้เป็นทางเลือกสำหรับรับข่าว/โปรก่อนเปิดเท่านั้น
                </p>
                <a
                  href={registerHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-emerald-800 underline decoration-emerald-600/40 underline-offset-2 hover:text-emerald-950"
                >
                  ไปหน้าสมัครสมาชิกแอป →
                </a>
              </div>
              <div className="mb-4">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Star size={18} className="text-amber-500 shrink-0" />
                  Early Registration (ทางเลือก) — แจ้งเตือนเมื่อเปิด
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  ถ้าต้องการรับแจ้งเตือนและสิทธิ์ก่อนเปิด — กรอกด้านล่าง (ไม่บังคับ)
                </p>
                <ol className="mt-3 text-xs text-slate-500 space-y-1 list-decimal list-inside border-l-2 border-slate-200 pl-3 ml-1">
                  <li>กรอกชื่อ-นามสกุล</li>
                  <li>กรอกอีเมลหรือเบอร์โทรที่ติดต่อได้</li>
                  <li>กดปุ่มส่งด้านล่าง — ข้อมูลจะถูกบันทึกทั้งในระบบแจ้งเตือนและเซิร์ฟเวอร์ AQOND</li>
                </ol>
              </div>

              <form onSubmit={submitEarly} className="space-y-3">
                <div>
                  <label htmlFor="early-name" className="sr-only">
                    ชื่อ-นามสกุล
                  </label>
                  <input
                    id="early-name"
                    required
                    type="text"
                    autoComplete="name"
                    placeholder="ชื่อ-นามสกุล *"
                    value={earlyForm.name}
                    onChange={(e) => setEarlyForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="early-contact" className="sr-only">
                    อีเมลหรือเบอร์โทร
                  </label>
                  <input
                    id="early-contact"
                    required
                    type="text"
                    autoComplete="email"
                    placeholder="อีเมล หรือ เบอร์โทร *"
                    value={earlyForm.contact}
                    onChange={(e) => setEarlyForm((f) => ({ ...f, contact: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="early-interest" className="sr-only">
                    บริการที่สนใจ
                  </label>
                  <input
                    id="early-interest"
                    type="text"
                    placeholder="บริการที่สนใจ (ถ้ามี)"
                    value={earlyForm.interest}
                    onChange={(e) => setEarlyForm((f) => ({ ...f, interest: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm"
                  />
                </div>

                <details className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm">
                  <summary className="cursor-pointer font-medium text-slate-700">
                    ยืนยันตัวตนเบื้องต้น (ไม่บังคับ) — ช่วยให้ทีมติดต่อกลับเร็วขึ้น
                  </summary>
                  <div className="mt-3 space-y-3 pb-1">
                    <label className="block">
                      <span className="text-xs text-slate-500">เลขบัตรประชาชน (ถ้ามี)</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="13 หลัก"
                        value={earlyKyc.nationalId}
                        onChange={(e) => setEarlyKyc((k) => ({ ...k, nationalId: e.target.value }))}
                        className="mt-1 w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs text-slate-500">วันเกิด</span>
                      <input
                        type="date"
                        value={earlyKyc.dateOfBirth}
                        onChange={(e) => setEarlyKyc((k) => ({ ...k, dateOfBirth: e.target.value }))}
                        className="mt-1 w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs text-slate-500">ที่อยู่โดยสังเขป (ถ้ามี)</span>
                      <input
                        type="text"
                        autoComplete="street-address"
                        placeholder="จังหวัด / เขต"
                        value={earlyKyc.address}
                        onChange={(e) => setEarlyKyc((k) => ({ ...k, address: e.target.value }))}
                        className="mt-1 w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm"
                      />
                    </label>
                  </div>
                </details>

                {earlyMsg && (
                  <p
                    className={`text-sm font-medium ${earlyMsg.type === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}
                    role="status"
                  >
                    {earlyMsg.text}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={earlyLoading}
                  className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-gradient-to-r from-slate-900 to-violet-900 text-white font-bold text-sm sm:text-base shadow-lg shadow-slate-900/15 hover:opacity-[0.98] transition-opacity disabled:opacity-60"
                >
                  {earlyLoading ? (
                    'กำลังส่งข้อมูล...'
                  ) : (
                    <>
                      <Send size={18} className="shrink-0" aria-hidden />
                      ส่งข้อมูลลงทะเบียนรอเปิดระบบ
                    </>
                  )}
                </button>
                <p className="text-center text-[11px] text-slate-400 leading-relaxed">
                  กดปุ่มด้านบนเพื่อส่งข้อมูลถึงทีม AQOND — ไม่มีค่าใช้จ่ายในการลงทะเบียนรอ
                </p>
              </form>
            </div>
          </div>
        ) : (
          <motion.div
            id="landing-early-reg"
            className="scroll-mt-28 rounded-3xl border-2 border-emerald-400/60 bg-gradient-to-br from-emerald-500/10 via-emerald-400/5 to-cyan-500/10 p-6 shadow-lg shadow-emerald-500/10"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <p className="text-center text-lg sm:text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-cyan-600">
              Grand Opening: AQOND is LIVE!
            </p>
            <p className="text-center text-slate-700 font-semibold mt-2">
              ยินดีต้อนรับสู่ระบบ — เริ่มจ้างงานและรับงานได้ทันที
            </p>
          </motion.div>
        )}

        {/* ข้อความมาร์เก็ตติ้ง — แยกจากการ์ดด้านบน */}
        <div className="pt-2 border-t border-slate-200/80">
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold leading-[1.2] tracking-tight text-slate-900">
            เลิกเสี่ยงดวงกับ{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-violet-600">
              มาตรฐานเดิมๆ
            </span>
          </h2>
          <p className="mt-3 text-sm sm:text-base text-slate-600 leading-relaxed max-w-lg">
            AQOND เชื่อมโยงคุณกับผู้เชี่ยวชาญระดับพรีเมียมตัวจริง ไม่ว่าจะเป็นงานช่างหรืองานไลฟ์สไตล์ เราคัดมาให้คุณแล้วเป๊ะๆ
          </p>
        </div>

        {go.isLive && (
          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-lg">
            <button
              type="button"
              onClick={onOpenProvider}
              className="flex-1 px-6 py-3.5 bg-slate-950 text-white rounded-2xl font-bold hover:shadow-xl transition-all flex items-center justify-center gap-2 text-sm sm:text-base"
            >
              <Video size={20} /> สมัครเป็นพาร์ทเนอร์ VIP
            </button>
            <button
              type="button"
              onClick={onOpenUser}
              className="flex-1 px-6 py-3.5 bg-accent text-slate-950 rounded-2xl font-bold hover:shadow-xl transition-all flex items-center justify-center gap-2 text-sm sm:text-base"
            >
              <Star size={20} /> จองสิทธิ์รับส่วนลด 50%
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
