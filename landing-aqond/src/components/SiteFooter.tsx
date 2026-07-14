import { useState, useRef, useEffect, useId } from 'react';
import { motion } from 'motion/react';
import { Facebook, Instagram, Linkedin, Youtube, ChevronDown, ShieldCheck } from 'lucide-react';
import { getAqondDiscordCommunityHref } from '../constants/discord';

const BRAND = '#00A859';
/** Logos: Claude uses Simple Icons CDN (Anthropic favicon often blocks hotlinking) */
const AI_PARTNERS: { name: string; glow: string; logo: string }[] = [
  { name: 'Gemini 2.0', glow: 'violet', logo: 'https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d4735304ff6292a690345.svg' },
  { name: 'Cursor AI', glow: 'blue', logo: 'https://cursor.com/favicon.ico' },
  { name: 'Grok Automation', glow: 'green', logo: 'https://x.ai/favicon.ico' },
  { name: 'Google AI Studio', glow: 'cyan', logo: 'https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_92x30dp.png' },
  { name: 'Claude 3.5', glow: 'amber', logo: 'https://cdn.simpleicons.org/anthropic/D97757' },
];

const LINK_GROUPS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: 'About AQOND',
    links: [
      { label: 'เกี่ยวกับ AQOND', href: '#about' },
      { label: 'วิสัยทัศน์', href: '#about' },
    ],
  },
  {
    title: 'Users',
    links: [
      { label: 'ค้นหาบริการ', href: '#discover' },
      { label: 'หมวดอาชีพ', href: '#services' },
      { label: 'แนะนำเพื่อน', href: '#referral' },
    ],
  },
  {
    title: 'Talent',
    links: [
      { label: 'ร่วมทีม AQOND', href: '#recruit' },
      { label: 'สมัครพาร์ทเนอร์', href: '#interested' },
      { label: 'โปรโมชั่น', href: '#interested' },
    ],
  },
  {
    title: 'Partners',
    links: [
      { label: 'Brand Adviser', href: '#brand-adviser' },
      { label: 'โปรแกรมสมาชิก', href: '#brand-adviser' },
      { label: 'สมัคร VIP', href: '#interested' },
    ],
  },
];

/** สีแบรนด์ผ่าน index.css (.aqond-social-btn--*) กันไอคอนกลายเป็นขาวบนพื้นเทา */
const SOCIAL: {
  href: string;
  label: string;
  Icon: typeof Facebook;
  btnClass: string;
}[] = [
  { href: '#', label: 'Facebook', Icon: Facebook, btnClass: 'aqond-social-btn aqond-social-btn--fb' },
  { href: '#', label: 'Instagram', Icon: Instagram, btnClass: 'aqond-social-btn aqond-social-instagram' },
  { href: '#', label: 'LinkedIn', Icon: Linkedin, btnClass: 'aqond-social-btn aqond-social-btn--li' },
  { href: '#', label: 'YouTube', Icon: Youtube, btnClass: 'aqond-social-btn aqond-social-btn--yt' },
];

const COUNTRIES = [
  { code: 'TH', label: 'ประเทศไทย', flag: '🇹🇭' },
  { code: 'SG', label: 'Singapore', flag: '🇸🇬' },
  { code: 'MY', label: 'Malaysia', flag: '🇲🇾' },
];

function AiBadgeIcon({ name, logo, className }: { name: string; logo: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center rounded-lg bg-white/10 text-[10px] font-bold text-white/80 ${className}`}
        aria-hidden
      >
        {name.slice(0, 2)}
      </span>
    );
  }
  return (
    <img
      src={logo}
      alt=""
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function GooglePlayIconGlyph() {
  const uid = useId().replace(/:/g, '');
  const gradId = `aqond-gp-${uid}`;
  return (
    <div className="aqond-store-badge-icon-slot">
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <path d="M4 5.5v13L19 12 4 5.5z" fill={`url(#${gradId})`} />
        <defs>
          <linearGradient id={gradId} x1="4" y1="5.5" x2="20" y2="18.5" gradientUnits="userSpaceOnUse">
            <stop stopColor="#00D9FF" />
            <stop offset="0.5" stopColor="#00F076" />
            <stop offset="1" stopColor="#FFD23B" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

function AppleGlyphInSlot() {
  return (
    <div className="aqond-store-badge-icon-slot text-white">
      <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <path d="M18.71 19.5c-.83 1.24-1.74 2.35-3.05 2.36-1.28.01-1.69-.76-3.16-.76-1.46 0-1.91.74-3.11.77-1.24.03-2.19-1.24-3.02-2.48-1.65-2.51-1.91-5.52-.52-7.1.94-1.07 2.4-1.69 3.82-1.71 1.2-.02 2.34.8 3.08.8.75 0 2.15-1 3.6-.85.62.03 2.36.25 3.48 1.42-.08.05-2.08 1.22-2.06 3.64.02 2.88 2.53 3.84 2.56 3.85-.02.07-.39 1.36-1.36 2.7-.76 1.07-1.55 2.14-2.6 2.15zM13 3.5c.06-.83.58-1.7 1.35-2.3.69-.55 1.9-.99 2.63-.95.13.87-.25 1.78-.82 2.5-.58.73-1.54 1.3-2.48 1.23-.14-.88.25-1.77.32-1.48z" />
      </svg>
    </div>
  );
}

/** การ์ดดาวน์โหลดแบบเดียวกัน — พื้นเข้ม ไม่เลียนแบบ badge ยาว (กันข้อความตัด + ไม่ซีด/ไม่กระพริบสีขาวบนดำ) */
function FooterStoreDownloadCards() {
  return (
    <div className="aqond-store-download-row">
      <div className="aqond-store-download-card" role="img" aria-label="App Store">
        <AppleGlyphInSlot />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold leading-tight tracking-tight text-white">App Store</p>
          <p className="mt-1 text-[11px] leading-snug text-white/45">เร็วๆ นี้</p>
        </div>
      </div>
      <div className="aqond-store-download-card" role="img" aria-label="Google Play">
        <GooglePlayIconGlyph />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold leading-tight tracking-tight text-white">Google Play</p>
          <p className="mt-1 text-[11px] leading-snug text-white/45">เร็วๆ นี้</p>
        </div>
      </div>
      <div className="aqond-store-download-card aqond-store-download-card--huawei" role="img" aria-label="AppGallery">
        <div className="aqond-store-badge-icon-slot">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#ce0e2d]/90 text-[10px] font-bold text-white ring-1 ring-white/25">
            AG
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold leading-tight tracking-tight text-white">AppGallery</p>
          <p className="mt-1 text-[11px] leading-snug text-white/45">เร็วๆ นี้</p>
        </div>
      </div>
    </div>
  );
}

function FooterBottomBar({ year }: { year: number }) {
  return (
    <div className="aqond-footer-bottom-bar mt-6 w-full font-inter text-white">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between lg:gap-12">
          <div className="flex max-w-lg flex-col gap-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[15px] font-medium leading-snug text-white/95">
              <a href="/terms" className="transition hover:text-white hover:underline">
                ข้อตกลงและเงื่อนไขการใช้งาน
              </a>
              <span className="text-white/35" aria-hidden>
                •
              </span>
              <a href="/privacy" className="transition hover:text-white hover:underline">
                ประกาศความเป็นส่วนตัว
              </a>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/25 ring-1 ring-sky-400/35">
                <ShieldCheck className="h-5 w-5 text-sky-100" strokeWidth={2} aria-hidden />
              </div>
              <p className="pt-0.5 text-[13px] leading-relaxed text-white/55">คุ้มครองข้อมูลส่วนบุคคลตามกฎหมาย PDPA</p>
            </div>
          </div>

          <p className="text-center text-[13px] leading-relaxed text-slate-400 lg:max-w-sm lg:flex-1 lg:pt-1 lg:text-center">
            © 2024 – {year} AQOND · All rights reserved.
          </p>

          <div className="w-full lg:w-auto lg:min-w-[min(100%,620px)]">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35 lg:text-right">แอปพลิเคชัน</p>
            <FooterStoreDownloadCards />
          </div>
        </div>

        <div className="mt-10 flex justify-end border-t border-white/[0.08] pt-5">
          <a href="#/admin" className="text-[11px] tracking-[0.08em] text-white/[0.28] transition hover:text-white/45">
            Admin
          </a>
        </div>
      </div>
    </div>
  );
}

function CountrySelector() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(COUNTRIES[0]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  return (
    <div ref={ref} className="relative w-full max-w-[280px]">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-slate-200/90 bg-white px-4 py-3 text-left text-sm shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-slate-300 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00A859]/30 focus-visible:ring-offset-2"
      >
        <span className="text-lg leading-none" aria-hidden>
          {selected.flag}
        </span>
        <span className="min-w-0 flex-1">
          <span className="font-semibold text-[#00A859]">{selected.code}</span>
          <span className="text-slate-600"> · {selected.label}</span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute left-0 top-full z-30 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl shadow-slate-900/10"
        >
          {COUNTRIES.map((c) => (
            <li key={c.code} role="option" aria-selected={selected.code === c.code}>
              <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-slate-800 transition hover:bg-slate-50"
                onClick={() => {
                  setSelected(c);
                  setOpen(false);
                }}
              >
                <span aria-hidden>{c.flag}</span>
                <span>
                  <span className="font-semibold text-[#00A859]">{c.code}</span> · {c.label}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AiMarqueeStrip() {
  const row = [...AI_PARTNERS, ...AI_PARTNERS];
  const cardClass = (glow: string) =>
    `inline-flex shrink-0 items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-xs font-medium text-slate-200 backdrop-blur-sm transition hover:bg-white/[0.07] sm:px-6 sm:py-3.5 sm:text-sm
    ${glow === 'violet' ? 'shadow-[0_0_24px_rgba(139,92,246,0.15)]' : ''}
    ${glow === 'blue' ? 'shadow-[0_0_24px_rgba(59,130,246,0.12)]' : ''}
    ${glow === 'green' ? 'shadow-[0_0_24px_rgba(34,197,94,0.12)]' : ''}
    ${glow === 'cyan' ? 'shadow-[0_0_24px_rgba(6,182,212,0.12)]' : ''}
    ${glow === 'amber' ? 'shadow-[0_0_24px_rgba(245,158,11,0.12)]' : ''}`;

  return (
    <section className="aqond-ai-strip-bg relative">
      <div className="mx-auto max-w-7xl px-6 pb-14 pt-12">
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mb-10 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500"
        >
          Powered by the World&apos;s Most Advanced AI
        </motion.p>
        <div className="aqond-ai-marquee-fade relative overflow-hidden">
          <div className="aqond-ai-marquee-track">
            {row.map((ai, i) => (
              <div key={`${ai.name}-${i}`} className={`mx-3 sm:mx-5 ${cardClass(ai.glow)}`} style={{ fontFamily: 'var(--font-mono)' }}>
                <AiBadgeIcon name={ai.name} logo={ai.logo} className="h-7 w-7 shrink-0 object-contain sm:h-8 sm:w-8" />
                {ai.name}
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Soft handoff to footer — ไม่ตัดฉับจาก dark ไป white */}
      <div className="aqond-ai-bridge-gradient h-16" aria-hidden />
    </section>
  );
}

export function SiteFooter() {
  const year = new Date().getFullYear();
  const discordHref = getAqondDiscordCommunityHref();

  const navHeading = 'text-[15px] font-semibold leading-none tracking-tight text-[#111827]';
  const navLink =
    'text-[15px] leading-[1.65] text-[#4B5563] transition-colors duration-200 hover:text-[#00A859] hover:underline decoration-[#00A859]/30 underline-offset-[3px]';
  const labelSm = 'mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500';

  return (
    <>
      <AiMarqueeStrip />

      <footer className="aqond-footer-bg font-inter pb-12 pt-2 text-[#111827] antialiased">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="aqond-gold-frame rounded-2xl">
            <div className="aqond-footer-panel-bg rounded-[14px] px-6 py-14 sm:px-10 sm:py-16 lg:px-14 lg:py-[4.25rem]">
              {/* แถวแบรนด์ — ไม่มีเส้นแบ่ง */}
              <div className="flex flex-col gap-8 pb-4 lg:flex-row lg:items-center lg:justify-between lg:gap-16">
                <div className="flex items-center gap-5">
                  <img src="/logo.png" alt="" className="h-16 w-16 shrink-0 object-contain" width={64} height={64} />
                  <div>
                    <p className="text-[26px] font-bold tracking-tight text-[#0a0a0a]">AQOND</p>
                    <p className="mt-0.5 text-[15px] font-semibold" style={{ color: BRAND }}>
                      Forward Together
                    </p>
                  </div>
                </div>
                <p className="max-w-xl text-[15px] leading-[1.7] text-[#4B5563] lg:max-w-md lg:text-right">
                  Premium Lifestyle Management — เชื่อม Talent กับงานจริงด้วยความไว้วางใจ
                </p>
              </div>

              <div className="grid grid-cols-1 gap-16 pt-10 sm:grid-cols-2 lg:grid-cols-5 lg:gap-x-12 lg:gap-y-14 xl:gap-x-16">
                <div className="flex flex-col gap-12 sm:col-span-2 lg:col-span-1">
                  <div>
                    <p className={labelSm}>Follow us</p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      {SOCIAL.map(({ href, label, Icon, btnClass }) => (
                        <a
                          key={label}
                          href={href}
                          aria-label={label}
                          className={`flex h-11 w-11 items-center justify-center rounded-full shadow-[0_2px_8px_rgba(15,23,42,0.18)] transition hover:brightness-110 ${btnClass}`}
                        >
                          <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
                        </a>
                      ))}
                      <a
                        href={discordHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Discord — AQOND Community Center"
                        className="aqond-social-btn aqond-social-btn--discord flex h-14 w-14 min-h-[3.5rem] min-w-[3.5rem] items-center justify-center rounded-full p-2.5 shadow-[0_2px_8px_rgba(15,23,42,0.18)] transition hover:brightness-110"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          className="h-7 w-7 shrink-0 drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]"
                          aria-hidden
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.074.074 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                        </svg>
                      </a>
                    </div>
                  </div>
                  <div>
                    <p className={labelSm}>Country / Region</p>
                    <div className="mt-4">
                      <CountrySelector />
                    </div>
                  </div>
                </div>

                {LINK_GROUPS.map((group, gi) => (
                  <nav key={group.title} className="min-w-0" aria-labelledby={`footer-h-${gi}`}>
                    <h2 id={`footer-h-${gi}`} className={`${navHeading} mb-6`}>
                      {group.title}
                    </h2>
                    <ul className="flex flex-col gap-[0.7rem]">
                      {group.links.map((link) => (
                        <li key={link.label}>
                          <a href={link.href} className={navLink}>
                            {link.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </nav>
                ))}
              </div>
            </div>
          </div>
        </div>

        <FooterBottomBar year={year} />
      </footer>
    </>
  );
}
