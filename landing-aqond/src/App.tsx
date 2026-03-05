import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles, Star, ChevronRight, Phone, CheckCircle2, X,
  Home, Truck, BookOpen, Wrench, Baby, Flower2, ChefHat, Heart,
  Camera, Package, Dog, Scissors, Car, Droplets, Zap, Monitor,
  AirVent, Hammer, Shield, UtensilsCrossed, Hand, GraduationCap,
  Dumbbell, Utensils, Palette, Calculator, Scale, Calendar, Stethoscope,
  ShieldCheck, Award, CreditCard,
  Facebook, Instagram, Twitter, Linkedin,
  Video, Upload, Link2, Gift,
  FileSearch, ClipboardCheck, ShieldAlert, Play,
} from 'lucide-react';
import { addProviderRegistration, addUserRegistration, uploadVideoToStorage, type SkillDemoType } from './services/firebaseService';
import AdminDashboard from './pages/AdminDashboard';
import ProviderRegistrationSuccess from './components/ProviderRegistrationSuccess';

// --- Trust Step Card (Peace of Mind) ---
const TrustStepCard = ({
  step,
  Icon,
  title,
  content,
  tooltip,
  color,
  hasClaim,
}: {
  step: number;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  content: string;
  tooltip: { title: string; detail: string; status: string };
  color: 'emerald' | 'gold';
  hasClaim?: boolean;
}) => {
  const colorClasses =
    color === 'emerald'
      ? 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/40 text-emerald-400'
      : 'from-amber-500/20 to-amber-600/10 border-amber-500/40 text-amber-400';

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="group relative"
    >
      <div
        className={`relative h-full rounded-2xl border bg-gradient-to-b p-6 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-amber-500/10 ${colorClasses}`}
      >
        <div className="flex items-start gap-4">
          <div
            className={`shrink-0 w-14 h-14 rounded-xl flex items-center justify-center ${
              color === 'emerald' ? 'bg-emerald-500/30' : 'bg-amber-500/30'
            }`}
          >
            <Icon size={28} className={color === 'emerald' ? 'text-emerald-400' : 'text-amber-400'} />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-xs font-bold text-slate-400 mb-1 block">Step {step}</span>
            <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
            <p className="text-slate-400 text-sm leading-relaxed">{content}</p>
            {hasClaim && (
              <button
                type="button"
                className="mt-4 px-5 py-2.5 rounded-xl font-bold text-sm bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/20 border border-amber-400/50"
              >
                Claim ประกัน
              </button>
            )}
          </div>
        </div>

        {/* Mobile UI Tooltip on hover */}
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 translate-y-full opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-20 pointer-events-none">
          <div className="w-48 rounded-xl overflow-hidden bg-slate-900 border-2 border-slate-600 shadow-2xl">
            <div className="p-3 bg-slate-800 border-b border-slate-700">
              <p className="text-[10px] text-slate-400">AQOND App</p>
              <p className="text-xs font-bold text-white">{tooltip.title}</p>
            </div>
            <div className="p-3 space-y-1">
              <p className="text-[10px] text-emerald-400 font-medium">{tooltip.detail}</p>
              <p className="text-[10px] text-slate-400">{tooltip.status}</p>
            </div>
            <div className="h-1 bg-slate-700" />
          </div>
          <div className="w-0 h-0 border-l-8 border-r-8 border-b-8 border-l-transparent border-r-transparent border-b-slate-600 absolute -top-1 left-1/2 -translate-x-1/2" />
        </div>
      </div>
    </motion.div>
  );
};

// --- Mobile Provider Mockup (The AQOND Experience) ---
const MobileProviderMockup = () => {
  const [isHovered, setIsHovered] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isHovered) v.play().catch(() => {});
    else v.pause();
  }, [isHovered]);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group cursor-pointer"
    >
      <div className="relative w-[280px] md:w-[320px] mx-auto">
        {/* iPhone frame */}
        <div className="relative bg-slate-900 rounded-[3rem] p-3 shadow-[0_25px_80px_rgba(0,0,0,0.3)] border-[10px] border-slate-800">
          {/* Notch */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-6 bg-slate-900 rounded-b-2xl z-10" />
          {/* Screen */}
          <div className="bg-white rounded-[2.25rem] overflow-hidden aspect-[9/19] max-h-[580px]">
            {/* Status bar */}
            <div className="h-10 bg-slate-50 flex items-center justify-center text-[10px] text-slate-500 font-medium">
              9:41
            </div>
            {/* Provider header */}
            <div className="p-4 bg-gradient-to-b from-slate-50 to-white border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-full overflow-hidden bg-slate-200 shrink-0">
                  <img
                    src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80"
                    alt="Provider"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-slate-900 text-sm">ช่างสมชาย</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 flex items-center gap-0.5">
                      <Award size={10} /> Platinum
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 flex items-center gap-0.5">
                      <Shield size={10} /> ประกัน
                    </span>
                  </div>
                  <p className="text-slate-500 text-xs mt-0.5">Expert Electrician</p>
                </div>
              </div>
            </div>
            {/* Tabs */}
            <div className="flex border-b border-slate-200 bg-white">
              <div className="flex-1 py-2 text-center text-[11px] font-medium text-slate-500">โปรไฟล์</div>
              <div className="flex-1 py-2 text-center text-[11px] font-bold text-amber-600 border-b-2 border-amber-500">
                Video Story
              </div>
              <div className="flex-1 py-2 text-center text-[11px] font-medium text-slate-500">รีวิว</div>
            </div>
            {/* Video Story content */}
            <div className="relative aspect-video bg-slate-900">
              <video
                ref={videoRef}
                src="https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"
                className="w-full h-full object-cover"
                muted
                loop
                playsInline
                poster="https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=400&q=80"
              />
              {!isHovered && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity">
                  <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                    <Play className="w-7 h-7 text-slate-900 ml-1" />
                  </div>
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
                <p className="text-white text-xs font-bold">สาธิตซ่อมไฟฟ้า</p>
                <p className="text-white/80 text-[10px]">มากกว่า 200 งาน • คะแนน 4.9</p>
              </div>
            </div>
            {/* Bottom CTA */}
            <div className="p-4 bg-slate-50">
              <button className="w-full py-3 bg-slate-900 text-white rounded-xl text-sm font-bold">
                จองงาน
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Reusable Components ---
const GlassCard = ({ children, className }: { children: React.ReactNode, className?: string }) => (
  <motion.div
    whileHover={{ y: -5 }}
    className={`bg-white/70 backdrop-blur-xl border border-white/40 rounded-3xl p-6 shadow-xl ${className}`}
  >
    {children}
  </motion.div>
);

const ServiceImageCard = ({ src, label, sub }: { src: string, label: string, sub: string }) => (
  <motion.div 
    initial={{ opacity: 0, scale: 0.9 }}
    whileInView={{ opacity: 1, scale: 1 }}
    viewport={{ once: true }}
    className="relative group overflow-hidden rounded-3xl h-80 shadow-lg"
  >
    <img src={src} alt={label} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-6">
      <h4 className="text-white font-bold text-xl">{label}</h4>
      <p className="text-white/70 text-sm">{sub}</p>
    </div>
  </motion.div>
);

// --- Services Data (แท็บบริการ) ---
const SERVICES = [
  { id: 'cleaning', icon: Home, title: 'CLEANING', sub: 'แม่บ้าน / ทำความสะอาด', gradient: 'from-emerald-500 to-teal-600' },
  { id: 'delivery', icon: Truck, title: 'DELIVERY', sub: 'ขนส่ง / จัดส่งพัสดุ', gradient: 'from-amber-500 to-orange-600' },
  { id: 'tutoring', icon: BookOpen, title: 'TUTORING', sub: 'สอนพิเศษ / ติวเตอร์', gradient: 'from-blue-500 to-indigo-600' },
  { id: 'repair', icon: Wrench, title: 'REPAIR', sub: 'ช่างซ่อม / ซ่อมบำรุงทั่วไป', gradient: 'from-slate-600 to-slate-800' },
  { id: 'babysitting', icon: Baby, title: 'BABYSITTING', sub: 'พี่เลี้ยงเด็ก', gradient: 'from-pink-500 to-rose-600' },
  { id: 'gardening', icon: Flower2, title: 'GARDENING', sub: 'งานสวน / ดูแลสวน', gradient: 'from-green-500 to-emerald-700' },
  { id: 'cooking', icon: ChefHat, title: 'COOKING', sub: 'พ่อครัว / แม่ครัว / จัดเลี้ยง', gradient: 'from-red-500 to-rose-600' },
  { id: 'eldercare', icon: Heart, title: 'ELDERCARE', sub: 'ดูแลผู้สูงอายุ', gradient: 'from-rose-500 to-pink-600' },
  { id: 'photography', icon: Camera, title: 'PHOTOGRAPHY', sub: 'ช่างภาพ', gradient: 'from-violet-500 to-purple-600' },
  { id: 'moving', icon: Package, title: 'MOVING', sub: 'ขนย้าย', gradient: 'from-cyan-500 to-blue-600' },
  { id: 'petcare', icon: Dog, title: 'PETCARE', sub: 'ดูแลสัตว์เลี้ยง', gradient: 'from-amber-600 to-yellow-700' },
  { id: 'beauty', icon: Scissors, title: 'BEAUTY', sub: 'ช่างแต่งหน้า / ทำผม / เสริมสวย', gradient: 'from-fuchsia-500 to-pink-600' },
  { id: 'driver', icon: Car, title: 'DRIVER', sub: 'คนขับรถ / พนักงานขับรถ', gradient: 'from-sky-500 to-blue-600' },
  { id: 'plumber', icon: Droplets, title: 'PLUMBER', sub: 'ช่างประปา', gradient: 'from-blue-400 to-cyan-600' },
  { id: 'electrician', icon: Zap, title: 'ELECTRICIAN', sub: 'ช่างไฟฟ้า', gradient: 'from-yellow-500 to-amber-600' },
  { id: 'it-support', icon: Monitor, title: 'IT SUPPORT', sub: 'ช่างซ่อมคอมพิวเตอร์ / IT Support', gradient: 'from-indigo-500 to-violet-600' },
  { id: 'ac-technician', icon: AirVent, title: 'AC TECHNICIAN', sub: 'ช่างแอร์ / ช่างปรับอากาศ', gradient: 'from-cyan-400 to-blue-500' },
  { id: 'construction', icon: Hammer, title: 'CONSTRUCTION', sub: 'ช่างก่อสร้าง', gradient: 'from-stone-600 to-slate-800' },
  { id: 'security', icon: Shield, title: 'SECURITY GUARD', sub: 'รปภ. / ยาม / การ์ดดูแลความปลอดภัย', gradient: 'from-slate-600 to-zinc-700' },
  { id: 'chef', icon: UtensilsCrossed, title: 'CHEF / COOK', sub: 'พ่อครัว / แม่ครัว', gradient: 'from-orange-500 to-red-600' },
  { id: 'massage', icon: Hand, title: 'MASSAGE THERAPIST', sub: 'นักนวด / นวดแผนไทย', gradient: 'from-amber-400 to-orange-500' },
  { id: 'tutor', icon: GraduationCap, title: 'TUTOR', sub: 'ครูสอนพิเศษ / ติวเตอร์', gradient: 'from-blue-600 to-indigo-700' },
  { id: 'trainer', icon: Dumbbell, title: 'PERSONAL TRAINER', sub: 'เทรนเนอร์ฟิตเนส / ผู้ฝึกสอนส่วนตัว', gradient: 'from-lime-500 to-green-600' },
  { id: 'videographer', icon: Camera, title: 'PHOTOGRAPHER / VIDEOGRAPHER', sub: 'ช่างภาพ / วิดีโอกราฟเฟอร์', gradient: 'from-purple-500 to-fuchsia-600' },
  { id: 'catering', icon: Utensils, title: 'CATERING', sub: 'จัดเลี้ยง / Catering', gradient: 'from-red-600 to-orange-600' },
  { id: 'designer', icon: Palette, title: 'GRAPHIC / UX DESIGNER', sub: 'นักออกแบบกราฟิก / ดีไซเนอร์', gradient: 'from-pink-500 to-violet-600' },
  { id: 'accountant', icon: Calculator, title: 'ACCOUNTANT', sub: 'นักบัญชี / ผู้ทำบัญชี', gradient: 'from-emerald-600 to-teal-700' },
  { id: 'legal', icon: Scale, title: 'LEGAL CONSULTANT', sub: 'ที่ปรึกษากฎหมาย / นักกฎหมาย', gradient: 'from-slate-700 to-slate-900' },
  { id: 'event', icon: Calendar, title: 'EVENT ORGANIZER', sub: 'ผู้จัดงานอีเวนต์', gradient: 'from-rose-500 to-red-600' },
  { id: 'healthcare', icon: Stethoscope, title: 'HEALTHCARE WORKER', sub: 'ผู้ช่วยแพทย์ / บุคลากรสาธารณสุข', gradient: 'from-teal-500 to-cyan-600' },
];

// --- Counter Animation ---
const AnimatedCounter = ({ target, suffix = '', duration = 2000 }: { target: number; suffix?: string; duration?: number }) => {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || hasAnimated.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          const start = 0;
          const startTime = performance.now();

          const update = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeOut = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(easeOut * target));
            if (progress < 1) requestAnimationFrame(update);
          };
          requestAnimationFrame(update);
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, duration]);

  return <span ref={ref}>{count}{suffix}</span>;
};

// --- Registration Forms ---
const SKILL_DEMO_OPTIONS: { value: SkillDemoType; label: string }[] = [
  { value: 'intro', label: 'คลิปแนะนำตัว (ไม่เกิน 30 วินาที)' },
  { value: 'tutorial', label: 'คลิปสอน / สาธิตทักษะ' },
  { value: 'on-site', label: 'คลิปหน้างานจริง' },
  { value: 'other', label: 'อื่นๆ' },
];

const ProviderRegistrationForm = ({
  onSuccess,
  onSuccessStateChange,
  referralCode,
}: {
  onSuccess: () => void;
  onSuccessStateChange?: (show: boolean) => void;
  referralCode?: string | null;
}) => {
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [form, setForm] = useState({
    name: '', profession: '', experience: '', portfolioLink: '', phone: '',
    videoLinks: [] as string[],
    skillDemoType: '' as SkillDemoType | '',
  });
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const addVideoLink = (url: string) => {
    const trimmed = url.trim();
    if (trimmed && !form.videoLinks.includes(trimmed)) {
      setForm({ ...form, videoLinks: [...form.videoLinks, trimmed] });
      setVideoPreviewUrl(trimmed);
    }
  };

  const removeVideoLink = (url: string) => {
    const next = form.videoLinks.filter((v) => v !== url);
    setForm({ ...form, videoLinks: next });
    setVideoPreviewUrl(videoPreviewUrl === url ? (next[0] || null) : videoPreviewUrl);
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('video/')) return;
    if (file.size > 50 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'ไฟล์ไม่เกิน 50MB กรุณาอัดคลิปสั้นๆ ไม่เกิน 30 วินาที' });
      return;
    }
    setUploading(true);
    setMessage(null);
    const url = await uploadVideoToStorage(file);
    setUploading(false);
    if (url) {
      setForm({ ...form, videoLinks: [...form.videoLinks, url] });
      setVideoPreviewUrl(url);
    } else {
      setMessage({ type: 'error', text: 'อัปโหลดวิดีโอไม่สำเร็จ กรุณาลองใหม่' });
    }
    e.target.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const result = await addProviderRegistration({
      name: form.name,
      profession: form.profession,
      experience: form.experience,
      portfolioLink: form.portfolioLink || undefined,
      phone: form.phone,
      portfolioVideos: form.videoLinks.length > 0 ? form.videoLinks : undefined,
      skillDemoType: form.skillDemoType || undefined,
      referralCode: referralCode || undefined,
    });
    setLoading(false);
    if (result.success) {
      onSuccessStateChange?.(true);
    } else {
      setMessage({ type: 'error', text: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง' });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">ชื่อ-นามสกุล</label>
        <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-900 focus:border-transparent" placeholder="ชื่อของคุณ" />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">อาชีพ/ความเชี่ยวชาญ</label>
        <input type="text" required value={form.profession} onChange={(e) => setForm({ ...form, profession: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-900 focus:border-transparent" placeholder="เช่น ช่างแอร์, แม่บ้าน, เชฟ" />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">ประสบการณ์</label>
        <input type="text" required value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-900 focus:border-transparent" placeholder="เช่น 5 ปี, มากกว่า 10 ปี" />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">ลิงก์ผลงาน (ถ้ามี)</label>
        <input type="url" value={form.portfolioLink} onChange={(e) => setForm({ ...form, portfolioLink: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-900 focus:border-transparent" placeholder="https://..." />
      </div>

      {/* Video Portfolio Section */}
      <div className="pt-4 border-t border-slate-200">
        <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
          <Video size={18} /> Showcase Your Skills (Video Portfolio)
        </label>
        <p className="text-xs text-amber-600 font-medium mb-3 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
          Providers with video demonstrations have a 3x higher chance of being selected for Platinum jobs.
        </p>

        {/* Social Links */}
        <div className="mb-3">
          <label className="block text-xs font-medium text-slate-600 mb-1">Social Media Links (TikTok / YouTube / IG)</label>
          <div className="flex gap-2">
            <input
              type="url"
              className="flex-1 px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm"
              placeholder="https://tiktok.com/... หรือ youtube.com/..."
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addVideoLink((e.target as HTMLInputElement).value))}
            />
            <button
              type="button"
              onClick={(e) => {
                const input = (e.currentTarget.previousElementSibling as HTMLInputElement);
                addVideoLink(input.value);
                input.value = '';
              }}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-sm flex items-center gap-1"
            >
              <Link2 size={16} /> เพิ่ม
            </button>
          </div>
        </div>

        {/* Upload Zone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className="mb-3 p-6 rounded-2xl bg-white/5 backdrop-blur-sm border-2 border-dashed border-slate-300 hover:border-slate-400/60 cursor-pointer transition-all hover:bg-white/10 text-center"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/webm"
            onChange={handleVideoUpload}
            className="hidden"
          />
          {uploading ? (
            <p className="text-slate-400 text-sm">กำลังอัปโหลด...</p>
          ) : (
            <>
              <Video className="w-10 h-10 text-slate-400 mx-auto mb-2" />
              <p className="text-sm text-slate-600 font-medium">หรืออัปโหลดคลิปสั้น (.mp4)</p>
              <p className="text-xs text-slate-400 mt-0.5">แนะนำไม่เกิน 30 วินาที • สูงสุด 50MB</p>
            </>
          )}
        </div>

        {/* Skill Demo Type */}
        <div className="mb-3">
          <label className="block text-xs font-medium text-slate-600 mb-1">ประเภทคลิป</label>
          <select
            value={form.skillDemoType}
            onChange={(e) => setForm({ ...form, skillDemoType: e.target.value as SkillDemoType })}
            className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm"
          >
            <option value="">เลือกประเภท (ถ้ามี)</option>
            {SKILL_DEMO_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Preview */}
        {videoPreviewUrl && (
          <div className="mt-3">
            <label className="block text-xs font-medium text-slate-600 mb-1">Preview</label>
            <div className="rounded-xl overflow-hidden bg-slate-900 aspect-video">
              {videoPreviewUrl.includes('youtube.com') || videoPreviewUrl.includes('youtu.be') ? (
                <iframe
                  src={(() => {
                    const m = videoPreviewUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
                    return m ? `https://www.youtube.com/embed/${m[1]}` : videoPreviewUrl;
                  })()}
                  className="w-full h-full"
                  allowFullScreen
                  title="Video preview"
                />
              ) : videoPreviewUrl.includes('tiktok.com') || videoPreviewUrl.includes('instagram.com') ? (
                <a href={videoPreviewUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center h-full text-white/80 hover:text-white">
                  <span className="text-sm">เปิดลิงก์ในแท็บใหม่</span>
                </a>
              ) : (
                <video src={videoPreviewUrl} controls className="w-full h-full object-contain" playsInline />
              )}
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {form.videoLinks.map((url) => (
                <span
                  key={url}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs cursor-pointer transition-colors ${
                    videoPreviewUrl === url ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <button type="button" onClick={() => setVideoPreviewUrl(url)} className="text-left truncate max-w-[180px]">
                    {url.length > 40 ? url.slice(0, 37) + '...' : url}
                  </button>
                  <button type="button" onClick={() => removeVideoLink(url)} className="text-red-500 hover:text-red-700 shrink-0">×</button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">เบอร์โทรศัพท์</label>
        <input type="tel" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-900 focus:border-transparent" placeholder="08X-XXX-XXXX" />
      </div>
      {message && <p className={`text-sm font-medium ${message.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>{message.text}</p>}
      <button type="submit" disabled={loading} className="w-full py-4 bg-slate-950 text-white rounded-2xl font-bold hover:shadow-xl transition-all disabled:opacity-70">
        {loading ? 'กำลังส่ง...' : 'สมัครเลย'}
      </button>
    </form>
  );
};

const UserRegistrationForm = ({ onSuccess, referralCode }: { onSuccess: () => void; referralCode?: string | null }) => {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [form, setForm] = useState({ name: '', interestService: '', contact: '', location: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const result = await addUserRegistration({
      name: form.name,
      interestService: form.interestService,
      contact: form.contact,
      location: form.location || undefined,
      referralCode: referralCode || undefined,
    });
    setLoading(false);
    if (result.success) {
      setMessage({ type: 'success', text: 'จองสิทธิ์สำเร็จ! คุณจะได้รับส่วนลด 50% เมื่อใช้งานครั้งแรก' });
      setTimeout(onSuccess, 1500);
    } else {
      setMessage({ type: 'error', text: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง' });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">ชื่อ-นามสกุล</label>
        <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-accent focus:border-transparent" placeholder="ชื่อของคุณ" />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">บริการที่สนใจ</label>
        <input type="text" required value={form.interestService} onChange={(e) => setForm({ ...form, interestService: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-accent focus:border-transparent" placeholder="เช่น ล้างแอร์, แม่บ้าน, เชฟ" />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">อีเมล หรือ เบอร์โทร</label>
        <input type="text" required value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-accent focus:border-transparent" placeholder="อีเมล หรือ 08X-XXX-XXXX" />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">พื้นที่ (ถ้ามี)</label>
        <input type="text" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-accent focus:border-transparent" placeholder="เช่น กรุงเทพ, สมุทรปราการ" />
      </div>
      {message && <p className={`text-sm font-medium ${message.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>{message.text}</p>}
      <button type="submit" disabled={loading} className="w-full py-4 bg-accent text-slate-950 rounded-2xl font-bold hover:shadow-xl transition-all disabled:opacity-70">
        {loading ? 'กำลังส่ง...' : 'จองสิทธิ์เลย'}
      </button>
    </form>
  );
};

const APP_REGISTER_URL = (import.meta as any).env?.VITE_APP_URL || 'http://localhost:3000';

export default function App() {
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [showProviderSuccess, setShowProviderSuccess] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [refCode, setRefCode] = useState<string | null>(null);
  const [manualRefCode, setManualRefCode] = useState('');
  const [refCodeValid, setRefCodeValid] = useState<boolean | null>(null);
  const [refCodeValidating, setRefCodeValidating] = useState(false);
  const [leaderboard, setLeaderboard] = useState<Array<{ fullName: string; referralCount: number; earnedThisWeek: number }>>([]);

  useEffect(() => {
    const path = window.location.pathname || '';
    const search = window.location.search || '';
    const pathMatch = path.match(/^\/ref\/([A-Za-z0-9]+)$/);
    const searchMatch = search && new URLSearchParams(search).get('ref');
    const code = pathMatch?.[1] || searchMatch || null;
    if (code) {
      setRefCode(code);
      try { localStorage.setItem('referral_code', code); } catch (_) {}
    }
  }, []);

  const effectiveRefCode = refCode || (refCodeValid ? manualRefCode.trim().toUpperCase() : null) || null;

  const validateRefCode = async () => {
    const code = manualRefCode.trim().toUpperCase();
    if (!code || code.length < 4) {
      setRefCodeValid(null);
      return;
    }
    setRefCodeValidating(true);
    setRefCodeValid(null);
    try {
      const api = (import.meta as any).env?.VITE_BACKEND_URL || 'https://api.aqond.com';
      const res = await fetch(`${api}/api/referral/validate/${encodeURIComponent(code)}`);
      const data = await res.json();
      setRefCodeValid(!!data.valid);
      if (data.valid) {
        try { localStorage.setItem('referral_code', code); } catch (_) {}
      }
    } catch {
      setRefCodeValid(false);
    } finally {
      setRefCodeValidating(false);
    }
  };

  useEffect(() => {
    const api = (import.meta as any).env?.VITE_BACKEND_URL || 'http://localhost:3001';
    fetch(`${api}/api/referral/leaderboard?limit=5`).then((r) => r.json()).then((d) => setLeaderboard(d.leaderboard || [])).catch(() => {});
  }, []);

  const isAdminRoute = typeof window !== 'undefined' && window.location.hash === '#/admin';
  if (isAdminRoute) {
    return (
      <AdminDashboard
        onLogout={() => {
          window.location.hash = '';
          window.location.reload();
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1E293B] overflow-x-hidden">
      
      {/* Header with Logo & AQOND */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-100">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <a href="#" className="flex items-center gap-3">
            <img src="/logo.png" alt="AQOND" className="h-10 w-10 object-contain" />
            <span className="text-xl font-bold text-slate-900 tracking-tight">AQOND</span>
          </a>
          <nav className="hidden md:flex items-center gap-6 text-slate-600 font-medium">
            <a href="#services" className="hover:text-slate-900 transition-colors">บริการ</a>
            <a href="#referral" className="hover:text-slate-900 transition-colors">แนะนำเพื่อน</a>
            <a href="#interested" className="hover:text-slate-900 transition-colors">สนใจ</a>
            <a href="#about" className="hover:text-slate-900 transition-colors">เกี่ยวกับเรา</a>
          </nav>
        </div>
      </header>
      
      {/* 1. HERO SECTION — Video Story Feed + 3 Wows */}
      <section className="relative pt-10 pb-20 lg:pt-20 lg:pb-32 px-6 container mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          
          {/* Left: Content */}
          <div className="z-10">
            <motion.div initial={{ opacity: 0, x: -50 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8 }}>
              <span className="inline-block px-4 py-2 bg-accent/20 text-darkSlate rounded-full text-sm font-bold mb-6 tracking-wide">
                Transforming Talents into Jobs through Quality Video & Trust
              </span>
              <h1 className="text-5xl lg:text-7xl font-extrabold leading-[1.1] mb-8 tracking-tighter text-slate-900">
                เลิกเสี่ยงดวงกับ <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-violet-600">
                  มาตรฐานเดิมๆ
                </span>
              </h1>
              <p className="text-xl text-slate-600 mb-10 max-w-lg leading-relaxed">
                AQOND เชื่อมโยงคุณกับผู้เชี่ยวชาญระดับพรีเมียมตัวจริง ไม่ว่าจะเป็นงานช่างหรืองานไลฟ์สไตล์ เราคัดมาให้คุณแล้วเป๊ะๆ
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <button onClick={() => { setShowProviderSuccess(false); setShowProviderModal(true); }} className="px-8 py-4 bg-slate-950 text-white rounded-2xl font-bold hover:shadow-2xl transition-all flex items-center justify-center gap-2">
                  <Video size={20} /> สมัครเป็นพาร์ทเนอร์ VIP
                </button>
                <button onClick={() => setShowUserModal(true)} className="px-8 py-4 bg-accent text-slate-950 rounded-2xl font-bold hover:shadow-2xl transition-all flex items-center justify-center gap-2">
                  <Star size={20} /> จองสิทธิ์รับส่วนลด 50%
                </button>
              </div>
            </motion.div>
          </div>

          {/* Right: มือถือโชว์แอป + ผู้จ้างงานโพสงาน + รถไปรับงาน */}
          <div className="relative h-[500px] lg:h-[600px]">
            {/* มือถือโชว์แอป */}
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5, duration: 1 }}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-64 md:w-72"
            >
              <div className="relative p-4 bg-slate-950 rounded-[3rem] shadow-[0_0_50px_rgba(0,0,0,0.2)] border-[8px] border-slate-800">
                <div className="bg-white rounded-[2rem] h-[450px] overflow-hidden flex flex-col items-center justify-center p-6 text-center">
                  <div className="flex items-center gap-2 mb-4">
                    <img src="/logo.png" alt="AQOND" className="w-12 h-12 object-contain" />
                    <span className="font-black text-xl text-slate-900">AQOND</span>
                  </div>
                  <div className="space-y-3 w-full">
                    <div className="h-4 bg-slate-100 rounded-full w-3/4 mx-auto"></div>
                    <div className="h-4 bg-slate-100 rounded-full w-1/2 mx-auto"></div>
                    <div className="mt-8 p-4 bg-blue-50 rounded-2xl border border-blue-100">
                      <p className="text-[10px] text-blue-600 font-bold uppercase tracking-widest">Matched Found!</p>
                      <p className="text-xs font-bold mt-1">ช่างแอร์กำลังเดินทางไปหาคุณ</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* ผู้จ้างงานเล่นโทรศัพท์โพสหางาน (ฝั่งขวา) */}
            <motion.img 
              initial={{ x: 100, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.8, duration: 1 }}
              src="https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?auto=format&fit=crop&w=600&q=80" 
              className="absolute right-0 top-10 w-48 md:w-64 h-auto rounded-3xl shadow-2xl z-30 border-4 border-white"
              alt="ผู้จ้างงานโพสหางาน"
            />

            {/* รถ/คนขี่มอไซค์ กำลังไปหาผู้จ้างงาน (ฝั่งซ้าย) */}
            <motion.div
              initial={{ x: -200, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 1.2, duration: 1.5, ease: "easeOut" }}
              className="absolute left-0 bottom-20 z-40 bg-white p-3 rounded-2xl shadow-2xl flex items-center gap-4"
            >
              <div className="w-16 h-16 rounded-xl overflow-hidden">
                <img src="https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=200&q=80" className="w-full h-full object-cover" alt="Rider กำลังไปรับงาน" />
              </div>
              <div>
                <p className="text-xs font-bold">Rider ID: AQ-402</p>
                <p className="text-[10px] text-emerald-600 font-bold">● กำลังไปรับงาน</p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* แนะนำเพื่อน — Viral Gate (Premium) */}
      <section id="referral" className="py-24 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-50/80 via-white to-amber-100/40" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(251,191,36,0.15),transparent)]" />
        <div className="container mx-auto relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <span className="inline-block px-5 py-2.5 bg-gradient-to-r from-amber-400/20 to-amber-500/20 text-amber-800 rounded-full text-sm font-bold mb-4 border border-amber-300/50 shadow-sm">
              <Gift size={16} className="inline mr-1.5 -mt-0.5" />
              แนะนำเพื่อน
            </span>
            <h2 className="text-3xl md:text-5xl font-bold text-slate-900 mb-4 tracking-tight">เพื่อนได้งาน คุณได้ตังค์</h2>
            <p className="text-slate-600 max-w-xl mx-auto text-lg">รับ 1.5% จากยอดจ้างงานเมื่อเพื่อนที่คุณแนะนำมีงานจ้างครั้งแรก — ภายใน 7 วัน</p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="max-w-2xl mx-auto rounded-3xl overflow-hidden bg-white/90 backdrop-blur-xl border border-amber-200/70 shadow-2xl shadow-amber-500/10 p-8 md:p-10"
          >
            {/* ช่องใส่รหัสเพื่อนแนะนำ — Premium */}
            <div className="mb-8 p-6 rounded-2xl bg-gradient-to-br from-slate-50 to-amber-50/50 border border-amber-200/50">
              <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                <Link2 size={18} className="text-amber-600" />
                มีรหัสเพื่อนแนะนำ? ใส่เพื่อรับสิทธิพิเศษ
              </label>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={manualRefCode}
                  onChange={(e) => {
                    setManualRefCode(e.target.value.toUpperCase());
                    setRefCodeValid(null);
                  }}
                  onBlur={() => manualRefCode.trim() && validateRefCode()}
                  placeholder="เช่น ABC12345"
                  maxLength={12}
                  className="flex-1 px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 font-mono text-lg tracking-wider placeholder:text-slate-400 transition-all"
                />
                <button
                  type="button"
                  onClick={validateRefCode}
                  disabled={refCodeValidating || !manualRefCode.trim()}
                  className="px-5 py-3 rounded-xl bg-amber-500 text-slate-950 font-bold hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2"
                >
                  {refCodeValidating ? (
                    <span className="animate-pulse">ตรวจสอบ...</span>
                  ) : refCodeValid === true ? (
                    <><CheckCircle2 size={20} /> ถูกต้อง</>
                  ) : refCodeValid === false ? (
                    <span className="text-red-600">ไม่พบ</span>
                  ) : (
                    'ตรวจสอบ'
                  )}
                </button>
              </div>
              {(effectiveRefCode || refCodeValid) && (
                <p className="mt-2 text-sm text-emerald-600 font-medium flex items-center gap-1">
                  <CheckCircle2 size={14} /> รหัส {effectiveRefCode} จะถูกใช้เมื่อสมัครสมาชิก
                </p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
              <div>
                <p className="text-slate-600 text-sm mb-2">แชร์ลิงก์ให้เพื่อนสมัคร</p>
                <p className="text-2xl font-bold text-amber-700">รับ 1.5% ทุกบิลที่เพื่อนทำงาน</p>
              </div>
              <a
                href={`${APP_REGISTER_URL}/#/register${effectiveRefCode ? `?ref=${effectiveRefCode}` : ''}`}
                className="px-8 py-4 bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 rounded-2xl font-bold hover:from-amber-400 hover:to-amber-500 transition-all shadow-lg shadow-amber-500/30 flex items-center gap-2 border border-amber-400/50"
              >
                <Gift size={20} /> สมัครสมาชิก
              </a>
            </div>
            {leaderboard.length > 0 && (
              <div className="mt-8 pt-6 border-t border-slate-200">
                <p className="text-sm font-bold text-slate-600 mb-3 flex items-center gap-2">
                  <Award size={16} className="text-amber-500" />
                  อันดับผู้แนะนำประจำสัปดาห์
                </p>
                <div className="space-y-3">
                  {leaderboard.slice(0, 5).map((e, i) => (
                    <div key={i} className="flex justify-between items-center text-sm py-2 px-3 rounded-xl hover:bg-slate-50 transition-colors">
                      <span className={`font-bold ${i < 3 ? 'text-amber-700' : 'text-slate-600'}`}>
                        <span className="inline-flex w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs items-center justify-center mr-2">{i + 1}</span>
                        {e.fullName}
                      </span>
                      <span className="text-slate-500 font-medium">฿{e.earnedThisWeek.toLocaleString()} • {e.referralCount} คน</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </section>

      {/* 2. Featured Talent of the Month — Wow 1 */}
      <section className="py-20 px-6 bg-gradient-to-b from-white to-slate-50">
        <div className="container mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <span className="inline-block px-4 py-2 bg-accent/20 text-slate-800 rounded-full text-sm font-bold mb-4">Wow 1: Talent Showcase</span>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Featured Talent of the Month</h2>
            <p className="text-slate-600 max-w-xl mx-auto">ผู้เชี่ยวชาญที่เราคัดสรร—ดูคลิปงานจริงก่อนจ้าง</p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="max-w-2xl mx-auto rounded-3xl overflow-hidden bg-white/80 backdrop-blur-xl border border-slate-200/60 shadow-2xl"
          >
            <div className="aspect-video bg-slate-900 relative">
              <img src="https://images.unsplash.com/photo-1581578731548-c64695cc6958?auto=format&fit=crop&w=800&q=80" alt="Featured work clip" className="w-full h-full object-cover" />
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <div className="w-20 h-20 rounded-full bg-white/90 flex items-center justify-center shadow-xl cursor-pointer hover:scale-110 transition-transform">
                  <Play className="w-10 h-10 text-slate-900 ml-1" />
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/90 to-transparent">
                <p className="text-accent font-bold text-sm">ช่างแอร์มือโปร • มากกว่า 500 งาน</p>
                <p className="text-white font-semibold text-lg">ล้างแอร์สะอาด ไม่เติมน้ำยาหลอก</p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* The AQOND Experience — Mobile Mockup */}
      <section className="py-24 px-6 bg-white">
        <div className="container mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left: Copy */}
            <motion.div
              initial={{ opacity: 0, x: -24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="order-2 lg:order-1"
            >
              <span className="inline-block px-4 py-2 bg-accent/20 text-slate-800 rounded-full text-sm font-bold mb-4">
                The AQOND Experience
              </span>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6 leading-tight">
                สัมผัสประสบการณ์จ้างงานที่คุณเห็นฝีมือก่อนจ้างจริง
              </h2>
              <p className="text-slate-600 text-lg leading-relaxed">
                ความมั่นใจระดับ Platinum ที่หาจากที่ไหนไม่ได้
              </p>
            </motion.div>

            {/* Right: iPhone Mockup */}
            <motion.div
              initial={{ opacity: 0, x: 24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="order-1 lg:order-2 flex flex-col items-center justify-center"
            >
              <MobileProviderMockup />
              <p className="text-slate-500 text-sm mt-4 text-center">เลื่อนเมาส์มาวางที่มือถือเพื่อดูคลิป</p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* AQOND Peace of Mind — Wow 3: Insurance & Trust */}
      <section
        className="py-24 px-6 relative overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #0f172a 0%, #0c1222 50%, #0a0f1a 100%)',
        }}
      >
        <div className="container mx-auto relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <span className="inline-block px-4 py-2 rounded-full text-sm font-bold mb-4 border border-amber-500/40 text-amber-400 bg-amber-500/10">
              Wow 3: Insurance & Trust
            </span>
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">
              AQOND Peace of Mind
            </h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">
              จ้างงานอย่างไรให้สบายใจที่สุด
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 mb-16 pb-12">
            {[
              {
                step: 1,
                Icon: ShieldCheck,
                title: 'Smart Escrow',
                content: 'ระบบพักเงินที่ปลอดภัยที่สุด เงินจะถึงมือผู้เชี่ยวชาญเมื่อคุณพึงพอใจเท่านั้น',
                tooltip: { title: 'Escrow', detail: 'เงินถูกพักไว้ ฿2,500', status: 'รอตรวจงาน' },
                color: 'emerald' as const,
              },
              {
                step: 2,
                Icon: Video,
                title: 'Video Evidence',
                content: "ตรวจสอบผลงานผ่านคลิป 'Completion Story' ก่อนจบงาน มั่นใจว่างานเนี๊ยบตรงปก",
                tooltip: { title: 'Completion Story', detail: 'ช่างส่งคลิปงานเสร็จ', status: 'รอคุณยืนยัน' },
                color: 'gold' as const,
              },
              {
                step: 3,
                Icon: Award,
                title: 'Platinum Insurance',
                content: 'มีปัญหา? เราแก้ไขให้! ด้วยระบบประกันงานที่กล้าดูแลคุณจนถึงที่สุด',
                tooltip: { title: 'เคลมประกัน', detail: 'กด Claim ได้ทันที', status: 'เราดูแลให้' },
                color: 'gold' as const,
                hasClaim: true,
              },
            ].map((item, i) => (
              <React.Fragment key={i}>
                <TrustStepCard
                  step={item.step}
                  Icon={item.Icon}
                  title={item.title}
                  content={item.content}
                  tooltip={item.tooltip}
                  color={item.color}
                  hasClaim={item.hasClaim}
                />
              </React.Fragment>
            ))}
          </div>

          {/* Certified Safe badge */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="flex flex-col items-center gap-3"
          >
            <div className="flex items-center gap-2 px-6 py-3 rounded-full bg-emerald-500/10 border border-emerald-500/40">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <span className="font-bold text-emerald-400">Certified Safe</span>
            </div>
            <p className="text-slate-500 text-sm">ระบบ Escrow & ประกันงานผ่านมาตรฐานความปลอดภัย</p>
          </motion.div>
        </div>
      </section>

      {/* 3. Quality You Can See — Wow 2 + How We Vet */}
      <section className="bg-slate-900 py-24 px-6 overflow-hidden">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <span className="inline-block px-4 py-2 bg-accent/30 text-white rounded-full text-sm font-bold mb-4">Wow 2: Tangible Service</span>
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">Quality You Can See</h2>
            <p className="text-slate-400 max-w-2xl mx-auto italic">&quot;ตั้งแต่ซ่อมท่อน้ำ ยันไปเดทริมแม่น้ำเจ้าพระยา เราคัดสรรสิ่งที่ดีที่สุดให้คุณ&quot;</p>
          </div>

          {/* Video snippet cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-20">
            {[
              { img: 'https://images.unsplash.com/photo-1581578731548-c64695cc6958?auto=format&fit=crop&w=500&q=80', label: 'ช่างแอร์', sub: 'ล้างแอร์จริง ไม่เติมน้ำยาหลอก' },
              { img: 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=500&q=80', label: 'Chef Cooking', sub: 'อาหารระดับมิชลินที่บ้านคุณ' },
              { img: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=500&q=80', label: 'แม่บ้าน', sub: 'สะอาดกริ๊บ ทุกมุมบ้าน' },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="group rounded-2xl overflow-hidden bg-white/5 backdrop-blur-sm border border-slate-600/40 hover:border-accent/40 transition-all"
              >
                <div className="aspect-video relative">
                  <img src={item.img} alt={item.label} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/20 transition-colors">
                    <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Play className="w-8 h-8 text-slate-900 ml-1" />
                    </div>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                    <h4 className="text-white font-bold">{item.label}</h4>
                    <p className="text-white/80 text-sm">{item.sub}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* How We Vet */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h3 className="text-2xl md:text-3xl font-bold text-white mb-8">How We Vet</h3>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                { icon: FileSearch, title: 'Background Check', sub: 'ตรวจสอบประวัติ 100%' },
                { icon: ClipboardCheck, title: 'Skill Test', sub: 'ทดสอบฝีมือจริง' },
                { icon: Video, title: 'Video Verification', sub: 'คลิปสาธิตงานจริง' },
              ].map((item, i) => {
                const Icon = item.icon;
                return (
                  <div key={i} className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-slate-600/40">
                    <div className="inline-flex p-4 rounded-xl bg-accent/20 mb-4">
                      <Icon className="w-8 h-8 text-white" />
                    </div>
                    <h4 className="text-white font-bold text-lg mb-1">{item.title}</h4>
                    <p className="text-slate-400 text-sm">{item.sub}</p>
                  </div>
                );
              })}
            </div>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <ServiceImageCard
              src="/A-cleaning.jpg"
              label="ช่างแอร์มือโปร"
              sub="ล้างสะอาด ไม่เติมน้ำยาหลอก"
            />
            <ServiceImageCard
              src="https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=500&q=80"
              label="ช่างไฟฟ้าผู้เชี่ยวชาญ"
              sub="ตรวจเช็คระบบ ปลอดภัย 100%"
            />
            <ServiceImageCard
              src="https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=500&q=80"
              label="แม่บ้านวางใจได้"
              sub="สะอาดกริ๊บ ทุกมุมบ้าน"
            />
            <ServiceImageCard
              src="https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=500&q=80"
              label="Chef at Home"
              sub="อาหารระดับมิชลินที่บ้านคุณ"
            />
            <ServiceImageCard
              src="https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=500&q=80"
              label="Professional Barber"
              sub="ตัดแต่งทรงผมถึงที่"
            />
            <ServiceImageCard
              src="https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=500&q=80"
              label="Platinum Date Night"
              sub="ชุดหรู พร้อมบรรยากาศสุดพิเศษ"
            />
            <div className="lg:col-span-2 bg-gradient-to-br from-blue-600 to-violet-700 rounded-3xl p-10 flex flex-col justify-center text-white relative overflow-hidden shadow-2xl">
              <Sparkles className="absolute top-5 right-5 opacity-20" size={100} />
              <h3 className="text-3xl font-black mb-4">AQOND PLATINUM</h3>
              <p className="text-blue-100 text-lg mb-8">สัมผัสประสบการณ์ที่เหนือกว่า <br />ความใส่ใจที่เรามอบให้มากกว่าแค่บริการ</p>
              <div className="flex gap-4">
                <div className="flex items-center gap-2 text-sm font-bold bg-white/10 px-4 py-2 rounded-full border border-white/20">
                  <CheckCircle2 size={16} /> Verified Pros
                </div>
                <div className="flex items-center gap-2 text-sm font-bold bg-white/10 px-4 py-2 rounded-full border border-white/20">
                  <CheckCircle2 size={16} /> 24/7 Support
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* Wow 3: Guarantee System — Platinum Insurance Shield (Section แยก) */}
      <section className="py-24 px-6 bg-gradient-to-br from-[#0f172a] via-[#1e3a5f] to-[#0f172a] border-y-2 border-accent/40">
        <div className="container mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <span className="inline-block px-4 py-2 bg-accent/30 text-white rounded-full text-sm font-bold mb-4">Wow 3: Guarantee System</span>
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">Platinum Insurance Shield</h2>
            <p className="text-slate-400 max-w-xl mx-auto">ความมั่นใจที่เรามอบให้ทุกการจอง</p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="max-w-4xl mx-auto rounded-3xl overflow-hidden bg-white/5 backdrop-blur-xl border-2 border-accent/60 p-8 md:p-16 relative shadow-2xl"
          >
            <div className="absolute top-0 right-0 w-96 h-96 bg-accent/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="relative flex flex-col md:flex-row items-center justify-between gap-10">
              <div className="flex items-center gap-6 md:gap-8">
                <div className="flex-shrink-0 w-24 h-24 rounded-2xl bg-accent/30 border-2 border-accent flex items-center justify-center shadow-lg shadow-accent/20">
                  <ShieldAlert className="w-12 h-12 text-accent" />
                </div>
                <div>
                  <h3 className="text-2xl md:text-4xl font-black text-white mb-3">Every Job is Insured.</h3>
                  <p className="text-slate-300 text-lg md:text-xl leading-relaxed font-semibold">100% Satisfaction or We Fix It.</p>
                </div>
              </div>
              <div className="text-center md:text-right">
                <p className="text-cyan-400 font-bold text-lg md:text-xl">ทุกงานรับประกัน</p>
                <p className="text-white/90 font-medium">พึงพอใจ 100% หรือเราจัดการให้</p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* 4. สนใจ — แท็บใหม่ */}
      <section id="interested" className="py-24 px-6 bg-gradient-to-b from-slate-50 to-white">
        <div className="container mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <span className="inline-block px-4 py-2 bg-accent/20 text-slate-800 rounded-full text-sm font-bold mb-4 tracking-wide">
              สนใจ
            </span>
            <h2 className="text-3xl md:text-5xl font-bold text-slate-900 mb-4">พร้อมเริ่มต้นแล้วหรือยัง?</h2>
            <p className="text-slate-600 max-w-2xl mx-auto">ไม่ว่าจะเป็นผู้ให้บริการหรือผู้รับบริการ — AQOND พร้อมเชื่อมคุณกับโอกาสที่ดีที่สุด</p>
          </motion.div>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="bg-white/80 backdrop-blur-xl rounded-3xl p-8 border border-slate-200/60 shadow-xl hover:shadow-2xl transition-shadow"
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 rounded-2xl bg-slate-900 flex items-center justify-center">
                  <Video className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">เป็นผู้เชี่ยวชาญ</h3>
              </div>
              <p className="text-slate-600 mb-6">สมัครเป็นพาร์ทเนอร์ Platinum สร้างรายได้จากทักษะของคุณ</p>
              <button onClick={() => { setShowProviderSuccess(false); setShowProviderModal(true); }} className="w-full py-4 bg-slate-950 text-white rounded-2xl font-bold hover:shadow-xl transition-all flex items-center justify-center gap-2">
                <Sparkles size={20} /> สมัครเป็นพาร์ทเนอร์     
              </button>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="bg-white/80 backdrop-blur-xl rounded-3xl p-8 border border-slate-200/60 shadow-xl hover:shadow-2xl transition-shadow"
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 rounded-2xl bg-accent/20 flex items-center justify-center">
                  <Star className="w-7 h-7 text-slate-900" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">เป็นลูกค้า</h3>
              </div>
              <p className="text-slate-600 mb-6">จองสิทธิ์รับส่วนลด 50% เมื่อใช้งานครั้งแรก</p>
              <button onClick={() => setShowUserModal(true)} className="w-full py-4 bg-accent text-slate-950 rounded-2xl font-bold hover:shadow-xl transition-all flex items-center justify-center gap-2">
                <Star size={20} /> จองสิทธิ์รับส่วนลด 50%
              </button>
            </motion.div>
          </div>
        </div>
      </section>

      {/* 5. SERVICES TAB — แท็บบริการ (อาชีพทั้งหมด) */}
      <section id="services" className="relative py-24 px-6 overflow-hidden bg-gradient-to-b from-slate-50 to-white">
        <div className="container mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <span className="inline-block px-4 py-2 bg-accent/20 text-slate-800 rounded-full text-sm font-bold mb-4 tracking-wide">
              บริการของเรา
            </span>
            <h2 className="text-3xl md:text-5xl font-bold text-slate-900 mb-4">อาชีพที่เราคัดสรร</h2>
            <p className="text-slate-600 max-w-2xl mx-auto">ตั้งแต่ซ่อมท่อน้ำ ยันไปเดทริมแม่น้ำเจ้าพระยา เราคัดสรรผู้เชี่ยวชาญระดับพรีเมียมให้คุณ</p>
          </motion.div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-5">
            {SERVICES.map((service, i) => {
              const Icon = service.icon;
              return (
                <motion.div
                  key={service.id}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.02 }}
                  whileHover={{ y: -4, scale: 1.02 }}
                  className="group"
                >
                  <div className="h-full bg-white rounded-2xl p-5 shadow-lg shadow-slate-200/60 border border-slate-100 hover:shadow-xl hover:shadow-slate-300/50 hover:border-slate-200 transition-all duration-300">
                    <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${service.gradient} mb-3 group-hover:scale-110 transition-transform`}>
                      <Icon className="w-6 h-6 text-white" strokeWidth={2} />
                    </div>
                    <h4 className="font-bold text-slate-900 text-sm md:text-base mb-0.5 tracking-tight">{service.title}</h4>
                    <p className="text-slate-500 text-xs md:text-sm leading-snug">{service.sub}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 4. ABOUT US — Platinum Theme (5 ส่วนหลัก) */}
      <section id="about" className="relative overflow-hidden">
        {/* Hero Header */}
        <div className="relative py-24 md:py-32 px-6">
          <div className="absolute inset-0 bg-[#0a0a0f] bg-[url('https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1920&q=80')] bg-cover bg-center" />
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md" />
          <div className="relative container mx-auto text-center">
            <motion.h2
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-4xl md:text-6xl lg:text-7xl font-bold text-white tracking-tight max-w-4xl mx-auto leading-[1.1]"
            >
              มากกว่าแค่บริการ คือ <span className="text-accent">การจัดการไลฟ์สไตล์</span>
            </motion.h2>
          </div>
        </div>

        {/* 1. The Vision — วิสัยทัศน์ที่เหนือกว่า */}
        <div className="bg-slate-900 py-24 px-6">
          <div className="container mx-auto max-w-4xl">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center"
            >
              <span className="inline-block text-accent font-semibold tracking-widest text-sm uppercase mb-4">The Vision</span>
              <h3 className="text-3xl md:text-4xl font-bold text-white mb-6">วิสัยทัศน์ที่เหนือกว่า</h3>
              <p className="text-slate-300 text-lg md:text-xl leading-relaxed">
                เราไม่ใช่แอปหาช่าง—เราเป็น <span className="text-accent font-semibold">ผู้ยกระดับมาตรฐานชีวิต</span>
              </p>
              <p className="text-slate-400 text-lg leading-relaxed mt-6">
                AQOND เกิดขึ้นเพื่อทลายกำแพงความเสี่ยงในงานบริการ เราเชื่อว่าทุกคนคู่ควรกับบริการที่เป๊ะ ตรงเวลา และมีคุณภาพระดับสูงสุด โดยไม่ต้องลุ้นหรือเสี่ยงดวงอีกต่อไป
              </p>
            </motion.div>
          </div>
        </div>

        {/* 2. The Golden Balance — ความสมดุลแห่งคุณภาพ */}
        <div className="bg-slate-950 py-24 px-6 border-t border-slate-700/50">
          <div className="container mx-auto">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              <motion.div
                initial={{ opacity: 0, x: -40 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="relative rounded-2xl overflow-hidden border border-slate-600/50 shadow-2xl"
              >
                <img
                  src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80"
                  alt="บ้านหรู - ความสมดุลแห่งคุณภาพ"
                  className="w-full h-[400px] lg:h-[500px] object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 to-transparent" />
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: 40 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="space-y-6"
              >
                <span className="inline-block text-accent font-semibold tracking-widest text-sm uppercase">The Golden Balance</span>
                <h3 className="text-3xl md:text-4xl font-bold text-white">ความสมดุลแห่งคุณภาพ</h3>
                <p className="text-slate-300 leading-relaxed">
                  เราคัดกรองผู้เชี่ยวชาญอย่างเข้มงวดด้วย <span className="text-accent">การตรวจสอบประวัติ 100%</span> การทดสอบฝีมือจริง และระบบให้คะแนนที่โปร่งใส เพื่อให้ได้ความสมดุลระหว่าง
                </p>
                <ul className="space-y-2 text-slate-400">
                  <li className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-accent" /> ราคาที่สมเหตุสมผล</li>
                  <li className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-accent" /> คุณภาพระดับพรีเมียม</li>
                </ul>
                <p className="text-slate-400 leading-relaxed">
                  ไม่ใช่แค่ถูกหรือแค่ดี—แต่ได้ทั้งสองอย่างในที่เดียว
                </p>
              </motion.div>
            </div>
          </div>
        </div>

        {/* 3. Why AQOND? — ทำไมต้องเป็นเรา? */}
        <div className="bg-slate-900 py-24 px-6 border-t border-slate-700/50">
          <div className="container mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <h3 className="text-3xl md:text-4xl font-bold text-white mb-4">Why AQOND?</h3>
              <p className="text-slate-400 text-lg">ทำไมต้องเป็นเรา?</p>
            </motion.div>
            <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
              {[
                { icon: ShieldCheck, title: 'Curated Professionals', sub: 'ผู้เชี่ยวชาญที่เราคัดมาแล้ว', desc: 'ไม่ใช่ใครก็ได้ แต่ต้องเป็นคนที่เราคัดสรรและตรวจสอบแล้วเท่านั้น' },
                { icon: CreditCard, title: 'Transparent & Secure', sub: 'ราคาชัดเจน ชำระปลอดภัย', desc: 'ราคากลางชัดเจน จ่ายเงินผ่านระบบที่ปลอดภัย มีการคุ้มครองผู้ใช้' },
                { icon: Phone, title: 'Platinum Support', sub: 'ทีมงานดูแลตลอด 24 ชม.', desc: 'ทีมงานดูแลช่วยเหลือตลอด 24 ชั่วโมง พร้อมอยู่เคียงคุณทุกเมื่อ' },
              ].map((item, i) => {
                const Icon = item.icon;
                return (
                  <motion.div
                    key={item.title}
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    whileHover={{ y: -6 }}
                    className="bg-white/5 backdrop-blur-xl border border-slate-600/40 rounded-2xl p-8 hover:border-accent/30 transition-all duration-300"
                  >
                    <div className="inline-flex p-4 rounded-xl bg-accent/20 border border-accent/30 mb-4">
                      <Icon className="w-8 h-8 text-white" strokeWidth={1.5} />
                    </div>
                    <h4 className="text-xl font-bold text-white mb-1">{item.title}</h4>
                    <p className="text-accent font-semibold text-sm mb-3">{item.sub}</p>
                    <p className="text-slate-400 text-sm leading-relaxed">{item.desc}</p>
                  </motion.div>
                );
              })}
            </div>
            {/* Interactive Counter */}
            <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto mt-16">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                className="flex items-center justify-center gap-4 p-6 rounded-2xl bg-white/5 border border-slate-600/50"
              >
                <span className="text-4xl font-bold text-accent text-cyan-400"><AnimatedCounter target={100} suffix="%" /></span>
                <div className="text-left">
                  <p className="text-white font-semibold ">ผู้เชี่ยวชาญผ่านการตรวจสอบ</p>
                  <p className="text-slate-400 text-sm">ทุกคนผ่านการคัดกรอง</p>
                </div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                className="flex items-center justify-center gap-4 p-6 rounded-2xl bg-white/5 border border-slate-600/50"
              >
                <span className="text-4xl font-bold text-accent text-cyan-400"><AnimatedCounter target={24} suffix="/7" /></span>
                <div className="text-left">
                  <p className="text-white font-semibold">บริการดูแลลูกค้า</p>
                  <p className="text-slate-400 text-sm">พร้อมช่วยเหลือตลอด 24 ชม.</p>
                </div>
              </motion.div>
            </div>
          </div>
        </div>

        {/* 4. Our Story — เรื่องราวของเรา */}
        <div className="bg-slate-950 py-24 px-6 border-t border-slate-700/50">
          <div className="container mx-auto max-w-3xl">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center"
            >
              <span className="inline-block text-accent font-semibold tracking-widest text-sm uppercase mb-4">Our Story</span>
              <h3 className="text-3xl md:text-4xl font-bold text-white mb-8">เรื่องราวของเรา</h3>
              <p className="text-slate-300 text-lg leading-relaxed mb-6">
                จากปัญหาที่เคยเจอ—ช่างทิ้งงาน บริการที่ไม่ได้มาตรฐาน ความไม่แน่นอนในทุกการจอง—เราเริ่มต้นสร้าง Ecosystem ที่ดีที่สุดสำหรับทั้งสองฝั่ง
              </p>
              <div className="grid md:grid-cols-2 gap-6 text-left">
                <div className="p-6 rounded-2xl bg-white/5 border border-slate-600/40">
                  <h4 className="text-accent font-bold text-lg mb-2">ผู้ให้บริการ (Providers)</h4>
                  <p className="text-slate-400 text-sm">รายได้ที่มั่นคง โอกาสงานที่ผ่านการคัดกรอง ระบบที่โปร่งใส</p>
                </div>
                <div className="p-6 rounded-2xl bg-white/5 border border-slate-600/40">
                  <h4 className="text-accent font-bold text-lg mb-2">ผู้รับบริการ (Users)</h4>
                  <p className="text-slate-400 text-sm">ประสบการณ์ที่ประทับใจ บริการที่ตรงเวลา คุณภาพที่รับประกันได้</p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* 5. Meet the Founder / The Team — ทีมงานเบื้องหลัง */}
        <div className="bg-slate-900 py-24 px-6 border-t border-slate-700/50">
          <div className="container mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <span className="inline-block text-accent font-semibold tracking-widest text-sm uppercase mb-4">Meet the Team</span>
              <h3 className="text-3xl md:text-4xl font-bold text-white mb-4">ทีมงานเบื้องหลัง</h3>
              <p className="text-slate-400 max-w-xl mx-auto">คนจริงๆ ที่คอยขับเคลื่อนระบบนี้ให้คุณทุกวัน</p>
            </motion.div>
            <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-12">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                className="flex flex-col items-center"
              >
                <div className="w-40 h-60 rounded-2xl overflow-hidden border-2 border-slate-600/50 shadow-xl mb-4">
                  <img
                    src="/boss.png"
                    alt="Founder - AQOND"
                    className="w-full h-full object-cover"
                  />
                </div>
                <h4 className="text-white font-bold text-lg">Founder</h4>
                <p className="text-accent font-semibold text-sm" style={{ fontFamily: "'Cinzel', serif" }}>AQOND</p>
                <p className="text-slate-400 text-sm mt-1">ผู้ก่อตั้ง</p>
              </motion.div>
              <div className="hidden md:block w-px h-32 bg-slate-600/50" />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                className="flex flex-col items-center"
              >
                <div className="w-40 h-60 rounded-2xl overflow-hidden border-2 border-slate-600/50 shadow-xl mb-4">
                  <img
                    src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80"
                    alt="Team - AQOND"
                    className="w-full h-full object-cover"
                  />
                </div>
                <h4 className="text-white font-bold text-lg">AQOND Team</h4>
                <p className="text-slate-400 text-sm mt-1">ทีมงานมืออาชีพ</p>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* Collaboration Footer — Tech-Luxe */}
      <footer className="relative bg-[#020617] border-t-[0.5px] border-slate-400/80 overflow-hidden">
        {/* 1. Team Showcase Section */}
        <div className="py-16 px-6">
          <div className="container mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-8"
            >
              <h3 className="text-2xl md:text-3xl font-bold text-white mb-2">Crafted with Passion by the AQOND Core Team</h3>
              <p className="text-slate-400">ทีมงานเบื้องหลังที่สร้างสรรค์ด้วยความปรารถนาดี</p>
            </motion.div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
              {[
  
              ].map((src, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                  className="group"
                >
                  <div className="relative rounded-3xl overflow-hidden border border-slate-400/60 shadow-2xl aspect-[4/3]">
                    <img
                      src={src}
                      alt={`Team member ${i + 1}`}
                      className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* 2. AI Collaboration Section — Scrolling Marquee */}
        <div className="py-12 px-6 border-t border-slate-600/40">
          <div className="container mx-auto">
            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="text-center text-slate-400 text-sm font-medium mb-8 tracking-widest uppercase"
            >
              Powered by the World&apos;s Most Advanced AI
            </motion.p>
            <div className="relative py-2">
              {/* Mobile: กริดเรียงลงมา 2 คอลัมน์ */}
              <div className="md:hidden grid grid-cols-2 gap-3 sm:gap-4">
                {[
                  { name: 'Gemini 2.0', glow: 'violet', logo: 'https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d4735304ff6292a690345.svg' },
                  { name: 'Cursor AI', glow: 'blue', logo: 'https://cursor.com/favicon.ico' },
                  { name: 'Grok Automation', glow: 'green', logo: 'https://x.ai/favicon.ico' },
                  { name: 'Google AI Studio', glow: 'cyan', logo: 'https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_92x30dp.png' },
                  { name: 'Claude 3.5', glow: 'amber', logo: 'https://www.anthropic.com/images/icons/apple-touch-icon-120x120.png' },
                ].map((ai, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl border border-slate-600/40 bg-white/5 backdrop-blur-sm font-mono text-xs font-medium text-slate-300
                      ${ai.glow === 'violet' ? 'shadow-[0_0_20px_rgba(139,92,246,0.4)]' : ''}
                      ${ai.glow === 'blue' ? 'shadow-[0_0_20px_rgba(59,130,246,0.4)]' : ''}
                      ${ai.glow === 'green' ? 'shadow-[0_0_20px_rgba(34,197,94,0.4)]' : ''}
                      ${ai.glow === 'cyan' ? 'shadow-[0_0_20px_rgba(6,182,212,0.4)]' : ''}
                      ${ai.glow === 'amber' ? 'shadow-[0_0_20px_rgba(245,158,11,0.4)]' : ''}
                    `}
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    <img src={ai.logo} alt={ai.name} className="w-6 h-6 object-contain shrink-0" />
                    <span className="truncate">{ai.name}</span>
                  </div>
                ))}
              </div>
              {/* Desktop: Marquee เลื่อนแนวนอน */}
              <div className="hidden md:block overflow-hidden">
                <div className="flex animate-marquee flex-nowrap gap-0" style={{ width: 'max-content' }}>
                  {[
                    { name: 'Gemini 2.0', glow: 'violet', logo: 'https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d4735304ff6292a690345.svg' },
                    { name: 'Cursor AI', glow: 'blue', logo: 'https://cursor.com/favicon.ico' },
                    { name: 'Grok Automation', glow: 'green', logo: 'https://x.ai/favicon.ico' },
                    { name: 'Google AI Studio', glow: 'cyan', logo: 'https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_92x30dp.png' },
                    { name: 'Claude 3.5', glow: 'amber', logo: 'https://www.anthropic.com/images/icons/apple-touch-icon-120x120.png' },
                  ].map((ai, i) => (
                    <div
                      key={i}
                      className={`inline-flex items-center gap-3 mx-8 px-6 py-4 rounded-xl border border-slate-600/40 bg-white/5 backdrop-blur-sm font-mono text-sm font-medium text-slate-300
                        ${ai.glow === 'violet' ? 'shadow-[0_0_20px_rgba(139,92,246,0.4)] hover:shadow-[0_0_30px_rgba(139,92,246,0.4)]' : ''}
                        ${ai.glow === 'blue' ? 'shadow-[0_0_20px_rgba(59,130,246,0.4)] hover:shadow-[0_0_30px_rgba(59,130,246,0.4)]' : ''}
                        ${ai.glow === 'green' ? 'shadow-[0_0_20px_rgba(34,197,94,0.4)] hover:shadow-[0_0_30px_rgba(34,197,94,0.4)]' : ''}
                        ${ai.glow === 'cyan' ? 'shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:shadow-[0_0_30px_rgba(6,182,212,0.4)]' : ''}
                        ${ai.glow === 'amber' ? 'shadow-[0_0_20px_rgba(245,158,11,0.4)] hover:shadow-[0_0_30px_rgba(245,158,11,0.4)]' : ''}
                      `}
                      style={{ fontFamily: 'var(--font-mono)' }}
                    >
                      <img src={ai.logo} alt={ai.name} className="w-8 h-8 object-contain" />
                      {ai.name}
                    </div>
                  ))}
                  {[
                    { name: 'Gemini 2.0', glow: 'violet', logo: 'https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d4735304ff6292a690345.svg' },
                    { name: 'Cursor AI', glow: 'blue', logo: 'https://cursor.com/favicon.ico' },
                    { name: 'Grok Automation', glow: 'green', logo: 'https://x.ai/favicon.ico' },
                    { name: 'Google AI Studio', glow: 'cyan', logo: 'https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_92x30dp.png' },
                    { name: 'Claude 3.5', glow: 'amber', logo: 'https://www.anthropic.com/images/icons/apple-touch-icon-120x120.png' },
                  ].map((ai, i) => (
                    <div
                      key={`dup-${i}`}
                      className={`inline-flex items-center gap-3 mx-8 px-6 py-4 rounded-xl border border-slate-600/40 bg-white/5 backdrop-blur-sm font-mono text-sm font-medium text-slate-300
                        ${ai.glow === 'violet' ? 'shadow-[0_0_20px_rgba(139,92,246,0.4)]' : ''}
                        ${ai.glow === 'blue' ? 'shadow-[0_0_20px_rgba(59,130,246,0.4)]' : ''}
                        ${ai.glow === 'green' ? 'shadow-[0_0_20px_rgba(34,197,94,0.4)]' : ''}
                        ${ai.glow === 'cyan' ? 'shadow-[0_0_20px_rgba(6,182,212,0.4)]' : ''}
                        ${ai.glow === 'amber' ? 'shadow-[0_0_20px_rgba(245,158,11,0.4)]' : ''}
                      `}
                      style={{ fontFamily: 'var(--font-mono)' }}
                    >
                      <img src={ai.logo} alt={ai.name} className="w-8 h-8 object-contain" />
                      {ai.name}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Footer Infrastructure — Glassmorphism */}
        <div className="py-16 px-6 border-t border-slate-600/40">
          <div className="container mx-auto">
            <div className="bg-white/5 backdrop-blur-md rounded-3xl border border-slate-600/30 p-8 md:p-12">
              <div className="flex flex-col md:flex-row items-center justify-between gap-8">
                <div className="flex items-center gap-3">
                  <img src="/logo.png" alt="AQOND" className="h-10 w-10 object-contain" />
                  <span className="text-xl font-bold text-white">AQOND</span>
                </div>
                <nav className="flex flex-wrap items-center justify-center gap-6 text-slate-400">
                  <a href="#services" className="hover:text-white transition-colors">บริการ</a>
                  <a href="#interested" className="hover:text-white transition-colors">สนใจ</a>
                  <a href="#about" className="hover:text-white transition-colors">เกี่ยวกับเรา</a>
                  <a href="#" className="hover:text-white transition-colors">ติดต่อเรา</a>
                  <a href="#/admin" className="text-slate-600 hover:text-slate-400 transition-colors text-xs">Admin</a>
                </nav>
                <div className="flex items-center gap-4">
                  <a href="#" className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
                    <Facebook size={20} />
                  </a>
                  <a href="#" className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
                    <Instagram size={20} />
                  </a>
                  <a href="#" className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
                    <Twitter size={20} />
                  </a>
                  <a href="#" className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
                    <Linkedin size={20} />
                  </a>
                </div>
              </div>
              <p className="text-center text-slate-500 text-sm mt-8 pt-8 border-t border-slate-600/30">
                &copy; {new Date().getFullYear()} AQOND. Premium Lifestyle Management.</p>
              <p className="text-center text-slate-500/80 text-xs mt-2">
                Built in Collaboration with Artificial Intelligence.
              </p>
            </div>
          </div>
        </div>
      </footer>

      {/* Provider Modal - สมัครเป็นพาร์ทเนอร์ VIP */}
      <AnimatePresence>
        {showProviderModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => {
              setShowProviderModal(false);
              setShowProviderSuccess(false);
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className={`rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto ${
                showProviderSuccess ? 'bg-transparent' : 'bg-white'
              }`}
            >
              {!showProviderSuccess && (
                <div className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                      <Sparkles className="text-amber-500" size={28} />
                      <h3 className="text-xl font-bold text-slate-900">สมัครเป็นพาร์ทเนอร์ VIP</h3>
                    </div>
                    <button
                      onClick={() => {
                        setShowProviderModal(false);
                        setShowProviderSuccess(false);
                      }}
                      className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                    >
                      <X size={20} />
                    </button>
                  </div>
                  <ProviderRegistrationForm
                    onSuccess={() => {
                      setShowProviderModal(false);
                      setShowProviderSuccess(false);
                    }}
                    onSuccessStateChange={setShowProviderSuccess}
                    referralCode={effectiveRefCode}
                  />
                </div>
              )}
              {showProviderSuccess && (
                <ProviderRegistrationSuccess
                  onBack={() => {
                    setShowProviderModal(false);
                    setShowProviderSuccess(false);
                  }}
                />
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* User Modal - จองสิทธิ์รับส่วนลด 50% */}
      <AnimatePresence>
        {showUserModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowUserModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <Star className="text-amber-500" size={28} />
                    <h3 className="text-xl font-bold text-slate-900">จองสิทธิ์รับส่วนลด 50%</h3>
                  </div>
                  <button onClick={() => setShowUserModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                    <X size={20} />
                  </button>
                </div>
                <UserRegistrationForm onSuccess={() => setShowUserModal(false)} referralCode={effectiveRefCode} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}