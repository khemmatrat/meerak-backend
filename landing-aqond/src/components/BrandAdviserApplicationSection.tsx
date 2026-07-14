import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Award, ChevronDown, ChevronUp, Loader2, Send } from 'lucide-react';
import {
  BRAND_ADVISER_APPLICATION_INTRO_TH,
  BRAND_ADVISER_RULES_SECTIONS,
  BRAND_ADVISER_TAGLINE_TH,
} from '../content/brandAdviserRulesTh';
import { submitBrandAdviserApplication } from '../services/brandAdviserApplicationApi';

const PLATFORMS: { id: 'youtube' | 'tiktok' | 'instagram' | 'facebook' | 'other'; label: string }[] = [
  { id: 'youtube', label: 'YouTube' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'other', label: 'อื่นๆ (ระบุในลิงก์หลัก)' },
];

export function BrandAdviserApplicationSection() {
  const [rulesOpen, setRulesOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [form, setForm] = useState({
    full_name: '',
    contact: '',
    primary_platform: 'youtube' as (typeof PLATFORMS)[number]['id'],
    primary_profile_url: '',
    link_youtube: '',
    link_tiktok: '',
    link_instagram: '',
    link_facebook: '',
    follower_count_declared: '',
    motivation: '',
    read_rules: false,
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    const n = parseInt(String(form.follower_count_declared).replace(/\D/g, ''), 10);
    const res = await submitBrandAdviserApplication({
      full_name: form.full_name.trim(),
      contact: form.contact.trim(),
      primary_platform: form.primary_platform,
      primary_profile_url: form.primary_profile_url.trim(),
      link_youtube: form.link_youtube.trim() || undefined,
      link_tiktok: form.link_tiktok.trim() || undefined,
      link_instagram: form.link_instagram.trim() || undefined,
      link_facebook: form.link_facebook.trim() || undefined,
      follower_count_declared: Number.isFinite(n) && n >= 0 ? n : undefined,
      motivation: form.motivation.trim() || undefined,
      read_rules_accepted: form.read_rules,
    });
    setLoading(false);
    if (res.ok) {
      setMsg({
        type: 'ok',
        text: 'ส่งใบสมัครแล้ว — ทีมงานจะตรวจสอบและติดต่อกลับตามช่องทางที่คุณให้ไว้',
      });
      setForm({
        full_name: '',
        contact: '',
        primary_platform: 'youtube',
        primary_profile_url: '',
        link_youtube: '',
        link_tiktok: '',
        link_instagram: '',
        link_facebook: '',
        follower_count_declared: '',
        motivation: '',
        read_rules: false,
      });
    } else {
      setMsg({
        type: 'err',
        text:
          res.error === 'rules_not_accepted'
            ? 'กรุณายอมรับกติกาก่อนส่ง'
            : res.error === 'primary_profile_url_required'
              ? 'ลิงก์โปรไฟล์หลักต้องขึ้นต้นด้วย http:// หรือ https://'
              : res.error === 'network'
                ? 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ลองใหม่ภายหลัง'
                : 'ส่งไม่สำเร็จ — กรุณาตรวจข้อมูลแล้วลองใหม่',
      });
    }
  };

  return (
    <section id="brand-adviser" className="py-20 px-6 bg-gradient-to-b from-amber-50/90 via-white to-slate-50 border-y border-amber-200/60">
      <div className="container mx-auto max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-8"
        >
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold bg-amber-100 text-amber-900 border border-amber-300/60">
            <Award size={18} className="text-amber-600" />
            Brand Adviser
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mt-4 mb-3">
            พาร์ทเนอร์ที่โตไปกับ AQOND
          </h2>
          <p className="text-slate-700 text-base md:text-lg max-w-3xl mx-auto leading-relaxed font-medium">
            {BRAND_ADVISER_TAGLINE_TH}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="grid md:grid-cols-3 gap-6 mb-10"
        >
          {[
            {
              title: 'ยกเว้นค่าธรรมเนียมตามเงื่อนไข',
              body: 'เมื่อสถานะ BA ใช้งานได้และโปรแกรมเปิดบนแพลตฟอร์ม ระบบจะคำนวณค่าธรรมเนียมให้สอดคล้องกับกฎทางการเงิน — โปร่งใสบนใบเสร็จรายได้',
            },
            {
              title: 'Reputation แทนตัวเลขเปล่าๆ',
              body: 'คะแนนสะสมจากกิจกรรมในโปรแกรม ช่วยสะท้อนความสม่ำเสมอในการใช้แอป ไม่ใช่การรับรองจากแพลตฟอร์มโดยตรง',
            },
            {
              title: 'เตือนก่อนพักสิทธิ์',
              body: 'หากใกล้ถึงเกณฑ์เคลื่อนไหว คุณจะได้รับการแจ้งเตือนเพื่อเข้าแอปหรือปิดงาน — รักษาสิทธิ์ของคุณได้ทันเวลา',
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-amber-200/80 bg-white/90 p-6 shadow-lg shadow-amber-500/5 text-left"
            >
              <h3 className="font-bold text-slate-900 mb-2">{item.title}</h3>
              <p className="text-slate-600 text-sm leading-relaxed">{item.body}</p>
            </div>
          ))}
        </motion.div>

        <div className="rounded-2xl border border-amber-200/90 bg-white shadow-lg shadow-amber-500/10 overflow-hidden">
          <button
            type="button"
            onClick={() => setRulesOpen((o) => !o)}
            className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left bg-amber-50/80 hover:bg-amber-50 transition-colors"
          >
            <span className="font-bold text-amber-950">กติกาและเงื่อนไข Brand Adviser (ฉบับเต็ม)</span>
            {rulesOpen ? <ChevronUp className="shrink-0 text-amber-800" /> : <ChevronDown className="shrink-0 text-amber-800" />}
          </button>
          {rulesOpen && (
            <div className="px-5 py-4 space-y-5 text-sm text-slate-700 leading-relaxed border-t border-amber-100 max-h-[min(70vh,520px)] overflow-y-auto">
              {BRAND_ADVISER_RULES_SECTIONS.map((sec) => (
                <div key={sec.title}>
                  <h3 className="font-bold text-slate-900 mb-2">{sec.title}</h3>
                  <ul className="list-disc list-inside space-y-2 pl-1">
                    {sec.bullets.map((b) => (
                      <li key={b.slice(0, 48)}>{b}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-center text-[13px] text-slate-600 mt-6 mb-2">{BRAND_ADVISER_APPLICATION_INTRO_TH}</p>

        <form onSubmit={submit} className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="ba-name" className="block text-xs font-bold text-slate-600 mb-1">
                ชื่อ–นามสกุล <span className="text-red-600">*</span>
              </label>
              <input
                id="ba-name"
                required
                autoComplete="name"
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-400 text-sm"
                placeholder="ตามบัตรประชาชน / หนังสือเดินทาง"
              />
            </div>
            <div>
              <label htmlFor="ba-contact" className="block text-xs font-bold text-slate-600 mb-1">
                อีเมลหรือเบอร์โทร <span className="text-red-600">*</span>
              </label>
              <input
                id="ba-contact"
                required
                value={form.contact}
                onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-400 text-sm"
                placeholder="ใช้ติดต่อกลับและเชื่อมบัญชี AQOND"
              />
            </div>
          </div>

          <div>
            <label htmlFor="ba-platform" className="block text-xs font-bold text-slate-600 mb-1">
              ช่องหลักที่ใช้รับรองเกณฑ์ผู้ติดตาม <span className="text-red-600">*</span>
            </label>
            <select
              id="ba-platform"
              value={form.primary_platform}
              onChange={(e) =>
                setForm((f) => ({ ...f, primary_platform: e.target.value as typeof f.primary_platform }))
              }
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-400 text-sm bg-white"
            >
              {PLATFORMS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="ba-primary-url" className="block text-xs font-bold text-slate-600 mb-1">
              ลิงก์โปรไฟล์ช่องหลัก <span className="text-red-600">*</span>
            </label>
            <input
              id="ba-primary-url"
              required
              type="url"
              value={form.primary_profile_url}
              onChange={(e) => setForm((f) => ({ ...f, primary_profile_url: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-400 text-sm"
              placeholder="https://..."
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="ba-yt" className="block text-xs font-bold text-slate-500 mb-1">
                ลิงก์ YouTube (ถ้ามี)
              </label>
              <input
                id="ba-yt"
                type="url"
                value={form.link_youtube}
                onChange={(e) => setForm((f) => ({ ...f, link_youtube: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-100 bg-slate-50/80 text-sm"
                placeholder="https://youtube.com/@..."
              />
            </div>
            <div>
              <label htmlFor="ba-tt" className="block text-xs font-bold text-slate-500 mb-1">
                ลิงก์ TikTok (ถ้ามี)
              </label>
              <input
                id="ba-tt"
                type="url"
                value={form.link_tiktok}
                onChange={(e) => setForm((f) => ({ ...f, link_tiktok: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-100 bg-slate-50/80 text-sm"
                placeholder="https://tiktok.com/@..."
              />
            </div>
            <div>
              <label htmlFor="ba-ig" className="block text-xs font-bold text-slate-500 mb-1">
                ลิงก์ Instagram (ถ้ามี)
              </label>
              <input
                id="ba-ig"
                type="url"
                value={form.link_instagram}
                onChange={(e) => setForm((f) => ({ ...f, link_instagram: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-100 bg-slate-50/80 text-sm"
                placeholder="https://instagram.com/..."
              />
            </div>
            <div>
              <label htmlFor="ba-fb" className="block text-xs font-bold text-slate-500 mb-1">
                ลิงก์ Facebook (ถ้ามี)
              </label>
              <input
                id="ba-fb"
                type="url"
                value={form.link_facebook}
                onChange={(e) => setForm((f) => ({ ...f, link_facebook: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-100 bg-slate-50/80 text-sm"
                placeholder="https://facebook.com/..."
              />
            </div>
          </div>

          <div>
            <label htmlFor="ba-followers" className="block text-xs font-bold text-slate-600 mb-1">
              จำนวนผู้ติดตามบนช่องหลัก (ประมาณการ ณ วันสมัคร)
            </label>
            <input
              id="ba-followers"
              inputMode="numeric"
              value={form.follower_count_declared}
              onChange={(e) => setForm((f) => ({ ...f, follower_count_declared: e.target.value }))}
              className="w-full max-w-xs px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-500/40 text-sm"
              placeholder="เช่น 52000"
            />
            <p className="text-[11px] text-slate-500 mt-1">เกณฑ์ขั้นต่ำ 50,000 — ทีมงานจะตรวจสอบจากข้อมูลสาธารณะ</p>
          </div>

          <div>
            <label htmlFor="ba-why" className="block text-xs font-bold text-slate-600 mb-1">
              ทำไมคุณถึงอยากเป็น Brand Adviser กับ AQOND
            </label>
            <textarea
              id="ba-why"
              rows={4}
              value={form.motivation}
              onChange={(e) => setForm((f) => ({ ...f, motivation: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-500/40 text-sm"
              placeholder="เช่น กลุ่มเป้าหมายของคุณตรงกับบริการใดใน AQOND คุณจะช่วยดึงผู้คนเข้าแพลตฟอร์มอย่างไร"
            />
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.read_rules}
              onChange={(e) => setForm((f) => ({ ...f, read_rules: e.target.checked }))}
              className="mt-1 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
            />
            <span className="text-sm text-slate-700 leading-snug">
              ข้าพเจ้าได้อ่านกติกาและเงื่อนไขด้านบนแล้ว ยืนยันว่าข้อมูลและลิงก์ที่ให้เป็นของข้าพเจ้าเอง และเข้าใจว่าเป็นสถานะโปรแกรมภายในระบบ ไม่ใช่การรับรองวิชาชีพจากแพลตฟอร์มโดยตรง
            </span>
          </label>

          {msg && (
            <p className={`text-sm font-medium ${msg.type === 'ok' ? 'text-emerald-600' : 'text-red-600'}`} role="status">
              {msg.text}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !form.read_rules}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 text-white font-bold text-sm shadow-lg shadow-amber-500/20 hover:opacity-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
            {loading ? 'กำลังส่ง...' : 'ส่งใบสมัคร Brand Adviser'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-500 mt-8 max-w-2xl mx-auto leading-relaxed">
          หลังอนุมัติเบื้องต้น ทีมงานจะเชื่อมสิทธิ์กับบัญชี AQOND ของคุณ — การมอบสถานะ BA ขั้นสุดท้ายและการเพิกถอนสิทธิ์เป็นไปตามดุลยพิจารณาของแอดมินและกติกาในแอป
        </p>
      </div>
    </section>
  );
}
