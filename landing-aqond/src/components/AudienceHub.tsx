import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import {
  Video,
  ShieldCheck,
  Gift,
  Star,
  UserCircle,
  Smartphone,
  Award,
  Bell,
  Home,
  AirVent,
  Wrench,
  Truck,
  BookOpen,
  Baby,
  Building2,
  Shield,
  Users,
  Sparkles,
  ChevronRight,
  ArrowUpRight,
  ExternalLink,
} from 'lucide-react';

export type AudienceKey = 'users' | 'talent' | 'partner' | 'enterprise';

type HubItem = {
  Icon: LucideIcon;
  title: string;
  description: string;
  action?: 'provider' | 'user' | 'referral' | 'none';
};

type HubGroup = {
  category: string;
  items: HubItem[];
};

const AUDIENCE_TABS: { key: AudienceKey; label: string; hint: string }[] = [
  { key: 'users', label: 'ผู้ใช้งาน', hint: 'จ้างงาน & สิทธิพิเศษ' },
  { key: 'talent', label: 'Talent', hint: 'ผู้ให้บริการ' },
  { key: 'partner', label: 'พาร์ทเนอร์', hint: 'Brand Adviser' },
  { key: 'enterprise', label: 'องค์กร', hint: 'ธุรกิจ & ทีม' },
];

/** โทนสีต่อแท็บ — ให้ความรู้สึกน่าใช้แต่ยัง premium */
const TAB_THEME: Record<
  AudienceKey,
  {
    active: string;
    inactiveHover: string;
    hintActive: string;
    iconBox: string;
    iconClass: string;
    rowHover: string;
    listPanel: string;
    cardHeader: string;
    labelAccent: string;
    blob: string;
    ctaDecor: string;
  }
> = {
  users: {
    active:
      'bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-700 text-white shadow-xl shadow-blue-500/25',
    inactiveHover: 'hover:bg-sky-50/95 hover:text-sky-900',
    hintActive: 'text-sky-100',
    iconBox:
      'bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-100/90 shadow-lg shadow-sky-500/10 ring-1 ring-white/60',
    iconClass: 'text-sky-700',
    rowHover: 'hover:bg-sky-50/50',
    listPanel:
      'bg-gradient-to-br from-sky-50/30 via-white to-indigo-50/20 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7)]',
    cardHeader: 'from-sky-50/95 via-white to-indigo-50/50',
    labelAccent: 'text-sky-600',
    blob: 'bg-[radial-gradient(ellipse_80%_60%_at_20%_80%,rgba(56,189,248,0.14),transparent)]',
    ctaDecor: 'decoration-sky-500/45 underline-offset-4 group-hover/row:decoration-sky-600',
  },
  talent: {
    active:
      'bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-700 text-white shadow-xl shadow-emerald-500/30',
    inactiveHover: 'hover:bg-emerald-50/95 hover:text-emerald-900',
    hintActive: 'text-emerald-100',
    iconBox:
      'bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-100/80 shadow-lg shadow-emerald-500/10 ring-1 ring-white/60',
    iconClass: 'text-emerald-700',
    rowHover: 'hover:bg-emerald-50/50',
    listPanel:
      'bg-gradient-to-br from-emerald-50/25 via-white to-teal-50/15 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7)]',
    cardHeader: 'from-emerald-50/95 via-white to-teal-50/45',
    labelAccent: 'text-emerald-600',
    blob: 'bg-[radial-gradient(ellipse_75%_55%_at_85%_75%,rgba(52,211,153,0.16),transparent)]',
    ctaDecor: 'decoration-emerald-500/45 underline-offset-4 group-hover/row:decoration-emerald-600',
  },
  partner: {
    active:
      'bg-gradient-to-br from-amber-400 via-amber-500 to-amber-700 text-slate-900 shadow-xl shadow-amber-500/35',
    inactiveHover: 'hover:bg-amber-50/95 hover:text-amber-950',
    hintActive: 'text-amber-950/75',
    iconBox:
      'bg-gradient-to-br from-amber-50 via-amber-100/90 to-yellow-50 shadow-lg shadow-amber-500/15 ring-1 ring-white/70',
    iconClass: 'text-amber-800',
    rowHover: 'hover:bg-amber-50/50',
    listPanel:
      'bg-gradient-to-br from-amber-50/30 via-white to-yellow-50/20 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7)]',
    cardHeader: 'from-amber-50/95 via-white to-yellow-50/50',
    labelAccent: 'text-amber-700',
    blob: 'bg-[radial-gradient(ellipse_70%_50%_at_50%_100%,rgba(251,191,36,0.18),transparent)]',
    ctaDecor: 'decoration-amber-600/50 underline-offset-4 group-hover/row:decoration-amber-700',
  },
  enterprise: {
    active:
      'bg-gradient-to-br from-violet-600 via-indigo-700 to-slate-900 text-white shadow-xl shadow-violet-500/25',
    inactiveHover: 'hover:bg-violet-50/95 hover:text-violet-950',
    hintActive: 'text-violet-100',
    iconBox:
      'bg-gradient-to-br from-violet-50 via-indigo-50 to-slate-100/80 shadow-lg shadow-violet-500/10 ring-1 ring-white/60',
    iconClass: 'text-violet-700',
    rowHover: 'hover:bg-violet-50/50',
    listPanel:
      'bg-gradient-to-br from-violet-50/25 via-white to-indigo-50/15 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7)]',
    cardHeader: 'from-violet-50/95 via-white to-indigo-50/45',
    labelAccent: 'text-violet-600',
    blob: 'bg-[radial-gradient(ellipse_65%_55%_at_0%_60%,rgba(167,139,250,0.14),transparent)]',
    ctaDecor: 'decoration-violet-500/45 underline-offset-4 group-hover/row:decoration-violet-600',
  },
};

const HUB_BY_AUDIENCE: Record<
  AudienceKey,
  { sectionTitle: string; sectionSubtitle: string; groups: HubGroup[] }
> = {
  users: {
    sectionTitle: 'จ้างงานอย่างมั่นใจกับ AQOND',
    sectionSubtitle: 'ดูฝีมือก่อนจ้าง จ่ายเมื่อพอใจ และสิทธิพิเศษสำหรับสมาชิก',
    groups: [
      {
        category: 'ความมั่นใจในการจ้าง',
        items: [
          {
            Icon: Video,
            title: 'ดูคลิปก่อนตัดสินใจ',
            description:
              'เลือกผู้เชี่ยวชาญจากวิดีโอโชว์งานจริง — ลดความเสี่ยงจากมาตรฐานเดิมๆ ที่เดาไม่ได้',
            action: 'none',
          },
          {
            Icon: ShieldCheck,
            title: 'Smart Escrow',
            description:
              'ระบบพักเงินปลอดภัย เงินถึงมือผู้ให้บริการเมื่องานเป็นไปตามที่ตกลงและคุณยืนยัน',
            action: 'none',
          },
          {
            Icon: Video,
            title: 'Video Evidence & Completion Story',
            description:
              'ตรวจงานผ่านคลิปก่อนปิดงาน มั่นใจว่าผลลัพธ์ตรงที่คุยกัน',
            action: 'none',
          },
        ],
      },
      {
        category: 'สิทธิพิเศษ',
        items: [
          {
            Icon: Gift,
            title: 'แนะนำเพื่อน รับส่วนแบ่ง',
            description:
              'รับ 1.5% จากยอดจ้างงานเมื่อเพื่อนที่คุณแนะนำมีงานจ้างครั้งแรก (ภายใน 7 วัน)',
            action: 'referral',
          },
          {
            Icon: Star,
            title: 'จองสิทธิ์ส่วนลด 50%',
            description:
              'ลงทะเบียนรับสิทธิ์ใช้งานครั้งแรกในราคาพิเศษ — จำกัดสิทธิ์ตามช่วงโปรโมชัน',
            action: 'user',
          },
        ],
      },
    ],
  },
  talent: {
    sectionTitle: 'สร้างรายได้กับ AQOND',
    sectionSubtitle: 'โชว์ทักษะด้วยวิดีโอ รับงานผ่านแอป และเติบโตไปกับระบบ',
    groups: [
      {
        category: 'เริ่มต้นกับเรา',
        items: [
          {
            Icon: UserCircle,
            title: 'สมัครเป็นพาร์ทเนอร์ VIP',
            description:
              'ลงทะเบียนเป็นผู้ให้บริการ แนบพอร์ตวิดีโอและข้อมูลเพื่อเข้าสู่ระบบจับคู่งาน',
            action: 'provider',
          },
          {
            Icon: Smartphone,
            title: 'รับงานผ่านแอป',
            description:
              'รับงาน อัปเดตสถานะ และสื่อสารกับลูกค้าในแพลตฟอร์มเดียว',
            action: 'none',
          },
          {
            Icon: Video,
            title: 'วิดีโอโชว์ทักษะ',
            description:
              'คลิปแนะนำตัว สาธิตงาน หรือหน้างานจริง — โอกาสถูกเลือกสูงขึ้นเมื่อมีพอร์ตชัดเจน',
            action: 'provider',
          },
        ],
      },
      {
        category: 'หมวดงานที่เปิดรับ (ตัวอย่าง)',
        items: [
          {
            Icon: Home,
            title: 'ทำความสะอาด / แม่บ้าน',
            description: 'บริการทำความสะอาดและดูแลบ้านตามที่ลูกค้ากำหนด',
            action: 'none',
          },
          {
            Icon: AirVent,
            title: 'ช่างแอร์ / ปรับอากาศ',
            description: 'ซ่อม ล้าง ติดตั้ง และบำรุงรักษาเครื่องปรับอากาศ',
            action: 'none',
          },
          {
            Icon: Wrench,
            title: 'ช่างซ่อมทั่วไป',
            description: 'งานซ่อมบำรุงและช่างฮาร์ดแวร์หลากหลายประเภท',
            action: 'none',
          },
          {
            Icon: Truck,
            title: 'ขนส่ง / จัดส่ง',
            description: 'รับส่งพัสดุและงานล็อกจิสติกส์ตามรอบพื้นที่',
            action: 'none',
          },
          {
            Icon: BookOpen,
            title: 'ติวเตอร์ / สอนพิเศษ',
            description: 'สอนออนไลน์หรือออนไซต์ตามความถนัด',
            action: 'none',
          },
          {
            Icon: Baby,
            title: 'พี่เลี้ยงเด็ก',
            description: 'ดูแลเด็กตามเวลาที่จอง พร้อมโปรไฟล์ที่ตรวจสอบได้',
            action: 'none',
          },
        ],
      },
    ],
  },
  partner: {
    sectionTitle: 'พาร์ทเนอร์ที่โตไปกับ AQOND',
    sectionSubtitle: 'โปรแกรม Brand Adviser และสิทธิประโยชน์สำหรับผู้ใช้งานแพลตฟอร์มอย่างสม่ำเสมอ',
    groups: [
      {
        category: 'Brand Adviser',
        items: [
          {
            Icon: Award,
            title: 'ยกเว้นค่าธรรมเนียมตามเงื่อนไข',
            description:
              'เมื่อสถานะ BA ใช้งานได้ ระบบคำนวณค่าธรรมเนียมให้สอดคล้องกับกฎทางการเงินบนแพลตฟอร์ม',
            action: 'none',
          },
          {
            Icon: Sparkles,
            title: 'Reputation จากกิจกรรมจริง',
            description:
              'สะสมคะแนนจากการใช้งานและกิจกรรมในระบบ สะท้อนความสม่ำเสมอ ไม่ใช่ตัวเลขเปล่าๆ',
            action: 'none',
          },
          {
            Icon: Bell,
            title: 'แจ้งเตือนก่อนพักสิทธิ์',
            description:
              'แจ้งเตือนเมื่อใกล้ถึงเกณฑ์เคลื่อนไหว ให้คุณเข้าแอปหรือปิดงานทันเวลา',
            action: 'none',
          },
        ],
      },
      {
        category: 'การสมัคร',
        items: [
          {
            Icon: UserCircle,
            title: 'สมัครพาร์ทเนอร์ VIP',
            description:
              'กรอกข้อมูล แนบวิดีโอ และรอการตรวจสอบจากทีมงาน',
            action: 'provider',
          },
        ],
      },
    ],
  },
  enterprise: {
    sectionTitle: 'ธุรกิจและองค์กรกับ AQOND',
    sectionSubtitle: 'ความปลอดภัยในการจ่ายเงิน มาตรฐานการจ้าง และการทำงานเป็นทีม',
    groups: [
      {
        category: 'ความน่าเชื่อถือ',
        items: [
          {
            Icon: Shield,
            title: 'Platinum Insurance & การเคลม',
            description:
              'กรอบการดูแลเมื่อเกิดปัญหาตามเงื่อนไขแพลตฟอร์ม — ลดความเสี่ยงฝั่งองค์กร',
            action: 'none',
          },
          {
            Icon: ShieldCheck,
            title: 'Escrow สำหรับงานมูลค่าสูง',
            description:
              'เหมาะสำหรับการจ้างงานที่ต้องการความชัดเจนด้านการชำระเงินและการส่งมอบ',
            action: 'none',
          },
        ],
      },
      {
        category: 'การทำงานร่วมกัน',
        items: [
          {
            Icon: Users,
            title: 'ผู้ให้บริการหลายสายงาน',
            description:
              'เชื่อมต่องานบริการหลากหลายประเภทในที่เดียว — ลดเวลาค้นหาและประสานงาน',
            action: 'none',
          },
          {
            Icon: Building2,
            title: 'พร้อมขยายตามความต้องการ',
            description:
              'โครงสร้างแพลตฟอร์มรองรับการจ้างงานซ้ำและการบริหารงานหลายโครงการ',
            action: 'none',
          },
        ],
      },
    ],
  },
};

function HubRow({
  item,
  theme,
  onProvider,
  onUser,
  onReferral,
  onScrollToEarlyReg,
  onRequestPreAppLead,
  appRegisterUrl,
  grandOpeningLive,
}: {
  item: HubItem;
  theme: (typeof TAB_THEME)[AudienceKey];
  onProvider: () => void;
  onUser: () => void;
  onReferral: () => void;
  /** ก่อนเปิดระบบ — เลื่อนไปฟอร์ม Early Registration ใน Hero */
  onScrollToEarlyReg: () => void;
  /** ฟอร์มสั้นก่อนนำทางไปแอป (ก่อน Grand Opening) */
  onRequestPreAppLead: (kind: 'provider' | 'user') => void;
  appRegisterUrl: string;
  grandOpeningLive: boolean;
}) {
  const registerHref = `${String(appRegisterUrl).replace(/\/$/, '')}/#/register`;
  const { Icon, title, description, action } = item;
  const handleCta = () => {
    if (action === 'provider') onProvider();
    else if (action === 'user') onUser();
    else if (action === 'referral') onReferral();
  };
  const showCta = action && action !== 'none';
  const ctaLocked = !grandOpeningLive && showCta;

  return (
    <div
      className={`group/row flex gap-4 sm:gap-5 rounded-2xl px-3 py-4 sm:px-4 sm:py-5 -mx-1 transition-colors duration-200 ${theme.rowHover}`}
    >
      <div className="shrink-0 pt-0.5">
        <div
          className={`flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl transition-transform duration-200 group-hover/row:scale-[1.03] ${theme.iconBox}`}
          aria-hidden
        >
          <Icon className={`h-[22px] w-[22px] sm:h-6 sm:w-6 ${theme.iconClass}`} strokeWidth={1.65} />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <h4 className="font-semibold text-slate-900 text-[15px] sm:text-base tracking-tight leading-snug">
          {title}
        </h4>
        <p className="text-slate-600 text-sm leading-relaxed mt-1.5 max-w-prose">
          {description}
        </p>
        {ctaLocked && (
          <div className="mt-3.5 flex max-w-md flex-col gap-2">
            {action === 'referral' ? (
              <>
                <button
                  type="button"
                  onClick={onReferral}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 sm:w-auto"
                >
                  ไปส่วนแนะนำเพื่อน
                </button>
                <a
                  href={registerHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-950 shadow-sm transition-colors hover:bg-emerald-100/90 sm:w-auto"
                >
                  <ExternalLink className="h-4 w-4 shrink-0" />
                  สมัครแอปเพื่อใช้สิทธิ์แนะนำ
                </a>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() =>
                    onRequestPreAppLead(action === 'provider' ? 'provider' : 'user')
                  }
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 sm:w-auto"
                >
                  กรอกข้อมูลเบื้องต้น — แล้วไปแอป
                </button>
                <button
                  type="button"
                  onClick={onScrollToEarlyReg}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-50 sm:w-auto"
                >
                  รับแจ้งเตือนเมื่อเปิด — ฟอร์ม Hero (ไม่บังคับ)
                </button>
                <a
                  href={registerHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center gap-1.5 text-sm font-semibold text-emerald-800 hover:text-emerald-950 underline underline-offset-2 decoration-emerald-400/50"
                >
                  <ExternalLink className="h-4 w-4 shrink-0" />
                  ข้ามฟอร์ม — ไปสมัครแอปโดยตรง
                </a>
              </>
            )}
            <p className="text-xs text-slate-500 leading-snug">
              {action === 'referral'
                ? 'สมัครแอปได้ทันที — ส่วนแนะนำเพื่อนใช้รหัสหลังมีบัญชี'
                : 'แนะนำกรอกฟอร์มสั้นก่อน แล้วค่อยสมัครแอป — หรือกดลิงก์ด้านบนเพื่อไปแอปทันที ฟอร์ม Hero ยังใช้รับข่าวก่อนเปิดระบบได้'}
            </p>
          </div>
        )}
        {showCta && !ctaLocked && (
          <button
            type="button"
            onClick={handleCta}
            className="mt-3.5 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800 transition-colors group-hover/row:text-slate-950"
          >
            <span className={`underline decoration-2 transition-colors ${theme.ctaDecor}`}>
              ดำเนินการ
            </span>
            <ArrowUpRight className="h-4 w-4 opacity-75 transition-transform group-hover/row:translate-x-0.5 group-hover/row:-translate-y-0.5" />
          </button>
        )}
      </div>
    </div>
  );
}

type AudienceHubProps = {
  /** false = ก่อนเปิดระบบ — แสดงปุ่มไปฟอร์มลงทะเบียนแทนปุ่มดำเนินการเต็มรูปแบบ */
  grandOpeningLive: boolean;
  onOpenProvider: () => void;
  onOpenUser: () => void;
  onScrollReferral: () => void;
  onScrollToEarlyReg: () => void;
  /** ฐาน URL แอป — สมัครสมาชิก */
  appRegisterUrl: string;
  /** เปิดฟอร์มลีดก่อนไปแอป (ก่อนเปิดระบบ) */
  onRequestPreAppLead: (kind: 'provider' | 'user') => void;
};

export function AudienceHub({
  grandOpeningLive,
  onOpenProvider,
  onOpenUser,
  onScrollReferral,
  onScrollToEarlyReg,
  appRegisterUrl,
  onRequestPreAppLead,
}: AudienceHubProps) {
  const [tab, setTab] = useState<AudienceKey>('users');
  const content = HUB_BY_AUDIENCE[tab];
  const th = TAB_THEME[tab];

  return (
    <section
      id="discover"
      className="relative overflow-hidden bg-gradient-to-b from-slate-50 via-violet-50/30 to-amber-50/40"
    >
      {/* ambient — โทนรวม + โทนตามแท็บ */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_100%_55%_at_50%_-15%,rgba(212,175,55,0.12),transparent)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_45%_at_100%_0%,rgba(99,102,241,0.08),transparent)]"
        aria-hidden
      />
      <div
        key={tab}
        className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${th.blob}`}
        aria-hidden
      />

      <div className="relative container mx-auto max-w-7xl px-4 sm:px-8 lg:px-12 xl:px-14 py-16 md:py-24">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto mb-12 max-w-3xl text-center md:mb-14"
        >
          <p className="mb-3 inline-flex items-center rounded-full bg-gradient-to-r from-amber-100/90 via-amber-50 to-yellow-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-900 shadow-md shadow-amber-500/15 ring-1 ring-white/50">
            Discover AQOND
          </p>
          <h2 className="text-balance text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl md:text-[2.35rem] md:leading-[1.15]">
            บริการครบวงจร{' '}
            <span className="bg-gradient-to-r from-blue-600 via-violet-600 to-amber-500 bg-clip-text text-transparent">
              หรือโอกาสสร้างรายได้
            </span>
          </h2>
          <p className="mt-4 text-pretty text-[15px] leading-relaxed text-slate-600 sm:text-base">
            เลือกมุมมองที่ตรงกับคุณ — สรุปฟังก์ชันหลักของแพลตฟอร์ม แยกตามบทบาท
          </p>
        </motion.div>

        {/* Segmented tabs */}
        <div className="mx-auto mb-10 w-full md:mb-12">
          <div
            className="flex flex-col gap-2 rounded-[1.25rem] bg-white/45 p-2 shadow-[0_20px_50px_-24px_rgba(15,23,42,0.18)] backdrop-blur-xl sm:flex-row sm:items-stretch sm:gap-2"
            role="tablist"
            aria-label="เลือกบทบาท"
          >
            {AUDIENCE_TABS.map(({ key, label, hint }) => {
              const active = tab === key;
              const t = TAB_THEME[key];
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  id={`tab-${key}`}
                  onClick={() => setTab(key)}
                  className={`relative flex min-h-[3rem] flex-1 flex-col items-center justify-center rounded-[0.9rem] px-3 py-2.5 text-center transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20 focus-visible:ring-offset-2 ${
                    active
                      ? t.active
                      : `text-slate-600 ${t.inactiveHover}`
                  }`}
                >
                  <span className="text-sm font-semibold leading-tight">{label}</span>
                  <span
                    className={`mt-0.5 text-[10px] font-medium leading-none sm:text-[11px] ${
                      active ? t.hintActive : 'text-slate-400'
                    }`}
                  >
                    {hint}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-hidden rounded-[1.75rem] bg-white/55 shadow-[0_24px_64px_-20px_rgba(59,130,246,0.12)] backdrop-blur-xl">
          <div className={`bg-gradient-to-r px-5 py-7 sm:px-10 sm:py-8 lg:px-14 ${th.cardHeader}`}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
              >
                <h3 className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
                  {content.sectionTitle}
                </h3>
                <p className="mt-1.5 max-w-4xl text-sm leading-relaxed text-slate-500 sm:text-[15px]">
                  {content.sectionSubtitle}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="px-4 pb-2 pt-4 sm:px-8 sm:pb-3 sm:pt-5 md:px-12 md:pb-4 md:pt-6 lg:px-14">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={tab}
                role="tabpanel"
                aria-labelledby={`tab-${tab}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-col gap-12 md:gap-14"
              >
                {content.groups.map((group) => (
                  <div
                    key={group.category}
                    className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:gap-12 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:gap-14"
                  >
                    <div className="md:pt-1">
                      <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${th.labelAccent}`}>
                        หมวด
                      </p>
                      <h4 className="mt-1.5 text-base font-semibold leading-snug text-slate-900 md:text-[1.05rem]">
                        {group.category}
                      </h4>
                    </div>
                    <div className={`min-w-0 rounded-2xl p-3 sm:p-4 ${th.listPanel}`}>
                      <div className="flex flex-col gap-1">
                        {group.items.map((item) => (
                          <HubRow
                            key={item.title}
                            item={item}
                            theme={th}
                            grandOpeningLive={grandOpeningLive}
                            onProvider={onOpenProvider}
                            onUser={onOpenUser}
                            onReferral={onScrollReferral}
                            onScrollToEarlyReg={onScrollToEarlyReg}
                            onRequestPreAppLead={onRequestPreAppLead}
                            appRegisterUrl={appRegisterUrl}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="border-t border-slate-200/60 bg-gradient-to-b from-white to-slate-50/90 px-6 py-11 sm:px-10 lg:px-12">
            <a
              href="#services"
              aria-label="ดูรายการอาชีพและหมวดบริการทั้งหมด"
              className="group mx-auto flex w-full max-w-2xl flex-col items-center rounded-2xl bg-[#0c0c0c] px-7 py-8 text-center shadow-[0_1px_2px_rgba(0,0,0,0.06)] outline outline-1 outline-white/10 transition duration-300 hover:-translate-y-px hover:shadow-[0_20px_50px_-24px_rgba(0,0,0,0.35)] focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 sm:px-10 sm:py-9"
            >
              <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/40">
                รายการหมวดอาชีพ
              </span>
              <span className="mt-3 text-balance text-[15px] font-semibold leading-snug text-white sm:text-[1.125rem] sm:leading-relaxed">
                ดูรายการอาชีพและหมวดบริการทั้งหมด
              </span>
              <span className="mt-6 flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.08] transition-colors duration-300 group-hover:bg-white/[0.14]">
                <ChevronRight
                  className="size-[18px] text-white/75 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-white"
                  aria-hidden
                />
              </span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
