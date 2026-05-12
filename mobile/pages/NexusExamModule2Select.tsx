import React, { useEffect, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  NEXUS_MODULE2_CATEGORIES,
  CATEGORIES_WITH_QUESTIONS,
  getModule2PassedCategories,
} from '../services/nexusExamService';
import { ClipboardList, ChevronRight, CheckCircle, Lock, Clock, BookOpen, X } from 'lucide-react';

// ── Metadata: label ภาษาไทย + emoji สำหรับแต่ละ category ──
const CATEGORY_META: Record<string, { label: string; emoji: string; group: string }> = {
  // งานบ้าน
  'Cleaning':      { label: 'แม่บ้าน / ทำความสะอาด', emoji: '🏠', group: 'งานบ้าน' },
  'Gardening':     { label: 'ช่างสวน / จัดสวน',       emoji: '🌱', group: 'งานบ้าน' },
  'Moving':        { label: 'ขนย้ายสิ่งของ',           emoji: '🚛', group: 'งานบ้าน' },
  // ช่าง
  'Repair':        { label: 'ช่างซ่อมแซมทั่วไป',       emoji: '🔧', group: 'ช่าง' },
  'AC Technician': { label: 'ช่างแอร์',                emoji: '❄️', group: 'ช่าง' },
  'Construction':  { label: 'ช่างก่อสร้าง',            emoji: '🏗️', group: 'ช่าง' },
  // ขนส่ง & ความปลอดภัย
  'Delivery':      { label: 'ขนส่ง / จัดส่งพัสดุ',    emoji: '📦', group: 'ขนส่ง & ความปลอดภัย' },
  'Driving':       { label: 'พนักงานขับรถ',            emoji: '🚗', group: 'ขนส่ง & ความปลอดภัย' },
  'Security':      { label: 'รปภ. / ยาม',              emoji: '🛡️', group: 'ขนส่ง & ความปลอดภัย' },
  // อาหาร
  'Chef':          { label: 'พ่อครัว / แม่ครัว',      emoji: '👨‍🍳', group: 'อาหาร' },
  'Catering':      { label: 'จัดเลี้ยง / Catering',   emoji: '🍽️', group: 'อาหาร' },
  // ดูแลบุคคล
  'Babysitter':    { label: 'พี่เลี้ยงเด็ก',          emoji: '👶', group: 'ดูแลบุคคล' },
  'Elderly':       { label: 'ผู้ดูแลผู้สูงอายุ',      emoji: '👴', group: 'ดูแลบุคคล' },
  'Massage':       { label: 'นักนวด / นวดแผนไทย',     emoji: '💆', group: 'ดูแลบุคคล' },
  // สุขภาพ & ความงาม
  'Beauty':        { label: 'ความงาม / เสริมสวย',     emoji: '💅', group: 'สุขภาพ & ความงาม' },
  'Trainer':       { label: 'เทรนเนอร์ฟิตเนส',        emoji: '💪', group: 'สุขภาพ & ความงาม' },
  // สัตว์เลี้ยง
  'Pet Care':      { label: 'ดูแลสัตว์เลี้ยง',        emoji: '🐾', group: 'สัตว์เลี้ยง' },
  // ไอที
  'IT Support':    { label: 'ช่างซ่อมคอมพิวเตอร์ / IT', emoji: '💻', group: 'ไอที' },
  // การสอน & ฝึก
  'Tutor':         { label: 'ครูสอนพิเศษ / ติวเตอร์', emoji: '🎓', group: 'การสอน & ฝึก' },
  'Tutoring':      { label: 'สอนพิเศษ (ทั่วไป)',       emoji: '📚', group: 'การสอน & ฝึก' },
  // ครีเอทีฟ
  'Photography':   { label: 'ช่างภาพ / วิดีโอ',       emoji: '📷', group: 'ครีเอทีฟ' },
  'Design':        { label: 'ออกแบบ / กราฟิก',         emoji: '🎨', group: 'ครีเอทีฟ' },
  // ธุรกิจ & วิชาชีพ
  'Event':         { label: 'จัดงานอีเวนต์',           emoji: '🎉', group: 'ธุรกิจ & วิชาชีพ' },
  'Accounting':    { label: 'บัญชี / การเงิน',         emoji: '📊', group: 'ธุรกิจ & วิชาชีพ' },
  'Legal':         { label: 'กฎหมาย / นิติกรรม',       emoji: '⚖️', group: 'ธุรกิจ & วิชาชีพ' },
  'Medical':       { label: 'สาธารณสุข / การแพทย์',   emoji: '🏥', group: 'ธุรกิจ & วิชาชีพ' },
};

// จัดกลุ่ม categories ตาม group
const GROUPS = [
  'งานบ้าน',
  'ช่าง',
  'ขนส่ง & ความปลอดภัย',
  'อาหาร',
  'ดูแลบุคคล',
  'สุขภาพ & ความงาม',
  'สัตว์เลี้ยง',
  'ไอที',
  'การสอน & ฝึก',
  'ครีเอทีฟ',
  'ธุรกิจ & วิชาชีพ',
];

export default function NexusExamModule2Select() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const fromProfile = searchParams.get("from") === "profile";
  const { user } = useAuth();
  const { t } = useLanguage();
  const [passedCategories, setPassedCategories] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [tutorialDismissed, setTutorialDismissed] = useState(false);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    getModule2PassedCategories(user.id)
      .then((cats) => setPassedCategories(new Set(cats.map((c) => c.skill_name))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.id]);

  const handleSelect = (category: string) => {
    if (passedCategories.has(category)) return;
    if (!CATEGORIES_WITH_QUESTIONS.has(category)) return;
    navigate(`/training/nexus-module2/quiz/${encodeURIComponent(category)}`);
  };

  // จัดกลุ่ม categories
  const grouped = GROUPS.map((group) => ({
    group,
    items: NEXUS_MODULE2_CATEGORIES.filter(
      (cat) => (CATEGORY_META[cat]?.group ?? 'อื่นๆ') === group
    ),
  })).filter((g) => g.items.length > 0);

  const totalAvailable = NEXUS_MODULE2_CATEGORIES.filter((c) =>
    CATEGORIES_WITH_QUESTIONS.has(c)
  ).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-6">
      <div className="max-w-2xl mx-auto">
        {/* คำแนะนำเมื่อมาจากโปรไฟล์ — ไม่ให้งงว่าต้องทำอะไรต่อ */}
        {fromProfile && !tutorialDismissed && (
          <div className="mb-5 rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50/80 p-4 shadow-sm relative">
            <button
              type="button"
              onClick={() => setTutorialDismissed(true)}
              className="absolute top-3 right-3 p-1 rounded-lg text-slate-500 hover:bg-white/80 hover:text-slate-800"
              aria-label="ปิด"
            >
              <X size={18} />
            </button>
            <div className="flex gap-3 pr-8">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
                <BookOpen size={22} />
              </div>
              <div className="min-w-0 text-sm text-slate-800">
                <p className="font-bold text-emerald-900 mb-2 flex items-center gap-2">
                  เพิ่มทักษะที่ผ่านการรับรอง (Module 2)
                </p>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-700 leading-relaxed">
                  <li>
                    <strong>เลือกหมวดอาชีพ</strong> ที่ตรงกับประเภทงานที่คุณจะรับ (เช่น ขับรถ แม่บ้าน ช่างซ่อม)
                  </li>
                  <li>
                    กดที่แถวหมวดนั้นเพื่อเข้าทำ<strong>แบบทดสอบ</strong> — เฉพาะหมวดที่กดได้ (ไม่มีป้าย &quot;เร็วๆ นี้&quot;)
                  </li>
                  <li>
                    ตอบให้ครบและผ่านเกณฑ์ที่กำหนด จากนั้นทักษะหมวดนั้นจะขึ้นในโปรไฟล์เป็น <strong>Certified</strong>
                  </li>
                  <li>
                    ทำได้หลายหมวดตามงานที่รับ — หมวดที่สอบผ่านแล้วจะล็อกไม่ให้ทำซ้ำ
                  </li>
                </ol>
                <p className="mt-3 text-xs text-slate-600 border-t border-emerald-200/60 pt-2">
                  รูปผลงาน / พอร์ต — แก้ที่แท็บ <strong>Portfolio / Expert</strong> ในโปรไฟล์ (แยกจากข้อสอบทักษะนี้)
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setTutorialDismissed(true);
                  setSearchParams((prev) => {
                    const next = new URLSearchParams(prev);
                    next.delete("from");
                    return next;
                  });
                }}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
              >
                เข้าใจแล้ว — ไปเลือกหมวดด้านล่าง
              </button>
              <button
                type="button"
                onClick={() => navigate("/profile")}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              >
                กลับโปรไฟล์
              </button>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ClipboardList size={28} className="text-emerald-600" />
            {t('training.module2_select_title')}
          </h1>
          <p className="text-slate-600 mt-1 text-sm">
            {t('training.module2_select_subtitle')}
          </p>

          {/* Stats bar */}
          <div className="mt-3 flex flex-wrap gap-2">
            {passedCategories.size > 0 && (
              <div className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-1.5">
                <CheckCircle size={13} />
                {t('training.passed_categories').replace('{n}', String(passedCategories.size))}
              </div>
            )}
            <div className="px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-600 flex items-center gap-1.5">
              <ClipboardList size={13} />
              {t('training.ready_exam').replace('{n}', String(totalAvailable))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-slate-500">{t('training.loading_exam')}</div>
        ) : (
          <div className="space-y-6">
            {grouped.map(({ group, items }) => (
              <div key={group}>
                {/* Group header */}
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2 px-1">
                  {group}
                </h2>
                <div className="grid gap-2">
                  {items.map((cat) => {
                    const meta = CATEGORY_META[cat];
                    const isPassed = passedCategories.has(cat);
                    const hasQuestions = CATEGORIES_WITH_QUESTIONS.has(cat);
                    const isDisabled = isPassed || !hasQuestions;

                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => handleSelect(cat)}
                        disabled={isDisabled}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left font-medium shadow-sm transition-all ${
                          isPassed
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 cursor-not-allowed'
                            : !hasQuestions
                            ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
                            : 'border-slate-200 bg-white text-slate-800 hover:bg-emerald-50 hover:border-emerald-300 hover:shadow cursor-pointer'
                        }`}
                      >
                        {/* Left: emoji + label */}
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xl flex-shrink-0">{meta?.emoji ?? '📋'}</span>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate">
                              {meta?.label ?? cat}
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">{cat}</div>
                          </div>
                        </div>

                        {/* Right: badge + icon */}
                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                          {isPassed && (
                            <span className="text-xs font-semibold px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">
                              ผ่านแล้ว
                            </span>
                          )}
                          {!hasQuestions && !isPassed && (
                            <span className="text-xs font-semibold px-2 py-0.5 bg-amber-50 text-amber-600 border border-amber-200 rounded-full flex items-center gap-1">
                              <Clock size={10} />
                              เร็วๆ นี้
                            </span>
                          )}
                          {isPassed ? (
                            <Lock size={16} className="text-emerald-400" />
                          ) : !hasQuestions ? (
                            <Clock size={16} className="text-slate-300" />
                          ) : (
                            <ChevronRight size={18} className="text-slate-400" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
