import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles,
  Star,
  ChevronRight,
  ChevronLeft,
  Phone,
  CheckCircle2,
  X,
  User,
  ListChecks,
  Briefcase,
  UserCircle,
  Home,
  Truck,
  BookOpen,
  Wrench,
  Baby,
  Flower2,
  ChefHat,
  Heart,
  Camera,
  Package,
  Dog,
  Scissors,
  Car,
  Droplets,
  Zap,
  Monitor,
  AirVent,
  Hammer,
  Shield,
  UtensilsCrossed,
  Hand,
  GraduationCap,
  Dumbbell,
  Utensils,
  Palette,
  Calculator,
  Scale,
  Calendar,
  Stethoscope,
  ShieldCheck,
  Award,
  CreditCard,
  Video,
  Upload,
  Link2,
  Gift,
  FileSearch,
  ClipboardCheck,
  ShieldAlert,
  Play,
} from "lucide-react";
import {
  addProviderRegistration,
  addUserRegistration,
  uploadVideoToStorage,
  type SkillDemoType,
} from "./services/firebaseService";
import AdminDashboard from "./pages/AdminDashboard";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import ProviderRegistrationSuccess from "./components/ProviderRegistrationSuccess";
import { NotificationBanner } from "./components/NotificationBanner";
import { AudienceHub } from "./components/AudienceHub";
import { SiteFooter } from "./components/SiteFooter";
import { GrandOpeningHero } from "./components/GrandOpeningHero";
import { AudiencePreAppModal } from "./components/AudiencePreAppModal";
import { BrandAdviserApplicationSection } from "./components/BrandAdviserApplicationSection";
import { useGrandOpeningCountdown } from "./shared/useGrandOpeningCountdown";
import { getBackendBaseUrl } from "./services/landingLeadApi";

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
  color: "emerald" | "gold";
  hasClaim?: boolean;
}) => {
  const colorClasses =
    color === "emerald"
      ? "from-emerald-500/20 to-emerald-600/10 border-emerald-500/40 text-emerald-400"
      : "from-amber-500/20 to-amber-600/10 border-amber-500/40 text-amber-400";

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
              color === "emerald" ? "bg-emerald-500/30" : "bg-amber-500/30"
            }`}
          >
            <Icon
              size={28}
              className={
                color === "emerald" ? "text-emerald-400" : "text-amber-400"
              }
            />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-xs font-bold text-slate-400 mb-1 block">
              Step {step}
            </span>
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
              <p className="text-[10px] text-emerald-400 font-medium">
                {tooltip.detail}
              </p>
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
                    <span className="font-bold text-slate-900 text-sm">
                      ช่างสมชาย
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 flex items-center gap-0.5">
                      <Award size={10} /> Platinum
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 flex items-center gap-0.5">
                      <Shield size={10} /> ประกัน
                    </span>
                  </div>
                  <p className="text-slate-500 text-xs mt-0.5">
                    Expert Electrician
                  </p>
                </div>
              </div>
            </div>
            {/* Tabs */}
            <div className="flex border-b border-slate-200 bg-white">
              <div className="flex-1 py-2 text-center text-[11px] font-medium text-slate-500">
                โปรไฟล์
              </div>
              <div className="flex-1 py-2 text-center text-[11px] font-bold text-amber-600 border-b-2 border-amber-500">
                Video Story
              </div>
              <div className="flex-1 py-2 text-center text-[11px] font-medium text-slate-500">
                รีวิว
              </div>
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
                <p className="text-white/80 text-[10px]">
                  มากกว่า 200 งาน • คะแนน 4.9
                </p>
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
const GlassCard = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <motion.div
    whileHover={{ y: -5 }}
    className={`bg-white/70 backdrop-blur-xl border border-white/40 rounded-3xl p-6 shadow-xl ${className}`}
  >
    {children}
  </motion.div>
);

const ServiceImageCard = ({
  src,
  label,
  sub,
}: {
  src: string;
  label: string;
  sub: string;
}) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.9 }}
    whileInView={{ opacity: 1, scale: 1 }}
    viewport={{ once: true }}
    className="relative group overflow-hidden rounded-3xl h-80 shadow-lg"
  >
    <img
      src={src}
      alt={label}
      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
    />
    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-6">
      <h4 className="text-white font-bold text-xl">{label}</h4>
      <p className="text-white/70 text-sm">{sub}</p>
    </div>
  </motion.div>
);

// --- Services Data (แท็บบริการ) ---
const SERVICES = [
  {
    id: "cleaning",
    icon: Home,
    title: "CLEANING",
    sub: "แม่บ้าน / ทำความสะอาด",
    gradient: "from-emerald-500 to-teal-600",
  },
  {
    id: "delivery",
    icon: Truck,
    title: "DELIVERY",
    sub: "ขนส่ง / จัดส่งพัสดุ",
    gradient: "from-amber-500 to-orange-600",
  },
  {
    id: "tutoring",
    icon: BookOpen,
    title: "TUTORING",
    sub: "สอนพิเศษ / ติวเตอร์",
    gradient: "from-blue-500 to-indigo-600",
  },
  {
    id: "repair",
    icon: Wrench,
    title: "REPAIR",
    sub: "ช่างซ่อม / ซ่อมบำรุงทั่วไป",
    gradient: "from-slate-600 to-slate-800",
  },
  {
    id: "babysitting",
    icon: Baby,
    title: "BABYSITTING",
    sub: "พี่เลี้ยงเด็ก",
    gradient: "from-pink-500 to-rose-600",
  },
  {
    id: "gardening",
    icon: Flower2,
    title: "GARDENING",
    sub: "งานสวน / ดูแลสวน",
    gradient: "from-green-500 to-emerald-700",
  },
  {
    id: "cooking",
    icon: ChefHat,
    title: "COOKING",
    sub: "พ่อครัว / แม่ครัว / จัดเลี้ยง",
    gradient: "from-red-500 to-rose-600",
  },
  {
    id: "eldercare",
    icon: Heart,
    title: "ELDERCARE",
    sub: "ดูแลผู้สูงอายุ",
    gradient: "from-rose-500 to-pink-600",
  },
  {
    id: "photography",
    icon: Camera,
    title: "PHOTOGRAPHY",
    sub: "ช่างภาพ",
    gradient: "from-violet-500 to-purple-600",
  },
  {
    id: "moving",
    icon: Package,
    title: "MOVING",
    sub: "ขนย้าย",
    gradient: "from-cyan-500 to-blue-600",
  },
  {
    id: "petcare",
    icon: Dog,
    title: "PETCARE",
    sub: "ดูแลสัตว์เลี้ยง",
    gradient: "from-amber-600 to-yellow-700",
  },
  {
    id: "beauty",
    icon: Scissors,
    title: "BEAUTY",
    sub: "ช่างแต่งหน้า / ทำผม / เสริมสวย",
    gradient: "from-fuchsia-500 to-pink-600",
  },
  {
    id: "driver",
    icon: Car,
    title: "DRIVER",
    sub: "คนขับรถ / พนักงานขับรถ",
    gradient: "from-sky-500 to-blue-600",
  },
  {
    id: "plumber",
    icon: Droplets,
    title: "PLUMBER",
    sub: "ช่างประปา",
    gradient: "from-blue-400 to-cyan-600",
  },
  {
    id: "electrician",
    icon: Zap,
    title: "ELECTRICIAN",
    sub: "ช่างไฟฟ้า",
    gradient: "from-yellow-500 to-amber-600",
  },
  {
    id: "it-support",
    icon: Monitor,
    title: "IT SUPPORT",
    sub: "ช่างซ่อมคอมพิวเตอร์ / IT Support",
    gradient: "from-indigo-500 to-violet-600",
  },
  {
    id: "ac-technician",
    icon: AirVent,
    title: "AC TECHNICIAN",
    sub: "ช่างแอร์ / ช่างปรับอากาศ",
    gradient: "from-cyan-400 to-blue-500",
  },
  {
    id: "construction",
    icon: Hammer,
    title: "CONSTRUCTION",
    sub: "ช่างก่อสร้าง",
    gradient: "from-stone-600 to-slate-800",
  },
  {
    id: "security",
    icon: Shield,
    title: "SECURITY GUARD",
    sub: "รปภ. / ยาม / การ์ดดูแลความปลอดภัย",
    gradient: "from-slate-600 to-zinc-700",
  },
  {
    id: "chef",
    icon: UtensilsCrossed,
    title: "CHEF / COOK",
    sub: "พ่อครัว / แม่ครัว",
    gradient: "from-orange-500 to-red-600",
  },
  {
    id: "massage",
    icon: Hand,
    title: "MASSAGE THERAPIST",
    sub: "นักนวด / นวดแผนไทย",
    gradient: "from-amber-400 to-orange-500",
  },
  {
    id: "tutor",
    icon: GraduationCap,
    title: "TUTOR",
    sub: "ครูสอนพิเศษ / ติวเตอร์",
    gradient: "from-blue-600 to-indigo-700",
  },
  {
    id: "trainer",
    icon: Dumbbell,
    title: "PERSONAL TRAINER",
    sub: "เทรนเนอร์ฟิตเนส / ผู้ฝึกสอนส่วนตัว",
    gradient: "from-lime-500 to-green-600",
  },
  {
    id: "videographer",
    icon: Camera,
    title: "PHOTOGRAPHER / VIDEOGRAPHER",
    sub: "ช่างภาพ / วิดีโอกราฟเฟอร์",
    gradient: "from-purple-500 to-fuchsia-600",
  },
  {
    id: "catering",
    icon: Utensils,
    title: "CATERING",
    sub: "จัดเลี้ยง / Catering",
    gradient: "from-red-600 to-orange-600",
  },
  {
    id: "designer",
    icon: Palette,
    title: "GRAPHIC / UX DESIGNER",
    sub: "นักออกแบบกราฟิก / ดีไซเนอร์",
    gradient: "from-pink-500 to-violet-600",
  },
  {
    id: "accountant",
    icon: Calculator,
    title: "ACCOUNTANT",
    sub: "นักบัญชี / ผู้ทำบัญชี",
    gradient: "from-emerald-600 to-teal-700",
  },
  {
    id: "legal",
    icon: Scale,
    title: "LEGAL CONSULTANT",
    sub: "ที่ปรึกษากฎหมาย / นักกฎหมาย",
    gradient: "from-slate-700 to-slate-900",
  },
  {
    id: "event",
    icon: Calendar,
    title: "EVENT ORGANIZER",
    sub: "ผู้จัดงานอีเวนต์",
    gradient: "from-rose-500 to-red-600",
  },
  {
    id: "healthcare",
    icon: Stethoscope,
    title: "HEALTHCARE WORKER",
    sub: "ผู้ช่วยแพทย์ / บุคลากรสาธารณสุข",
    gradient: "from-teal-500 to-cyan-600",
  },
];

// --- Counter Animation ---
const AnimatedCounter = ({
  target,
  suffix = "",
  duration = 2000,
}: {
  target: number;
  suffix?: string;
  duration?: number;
}) => {
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
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, duration]);

  return (
    <span ref={ref}>
      {count}
      {suffix}
    </span>
  );
};

// --- Registration Forms ---
const SKILL_DEMO_OPTIONS: { value: SkillDemoType; label: string }[] = [
  { value: "intro", label: "คลิปแนะนำตัว (ไม่เกิน 30 วินาที)" },
  { value: "tutorial", label: "คลิปสอน / สาธิตทักษะ" },
  { value: "on-site", label: "คลิปหน้างานจริง" },
  { value: "other", label: "อื่นๆ" },
];

const PARTNER_STEPS = [
  { id: 1, title: "ข้อมูลติดต่อ", sub: "ยืนยันชื่อและเบอร์โทร" },
  { id: 2, title: "ความเชี่ยวชาญ", sub: "สายงานและประสบการณ์" },
  { id: 3, title: "วิดีโอโชว์ทักษะ", sub: "พอร์ตวิดีโอ (แนะนำ)" },
] as const;

const ProviderRegistrationForm = ({
  onSuccess,
  onSuccessStateChange,
  onApplicationCreated,
  referralCode,
}: {
  onSuccess: () => void;
  onSuccessStateChange?: (show: boolean) => void;
  onApplicationCreated?: (payload: {
    id: string;
    tier: "standard" | "platinum";
  }) => void;
  referralCode?: string | null;
}) => {
  const [step, setStep] = useState(1);
  const [applicationTier, setApplicationTier] = useState<
    "standard" | "platinum"
  >("standard");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [form, setForm] = useState({
    name: "",
    profession: "",
    experience: "",
    portfolioLink: "",
    phone: "",
    videoLinks: [] as string[],
    skillDemoType: "" as SkillDemoType | "",
  });
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const socialUrlInputRef = React.useRef<HTMLInputElement>(null);

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
    setVideoPreviewUrl(
      videoPreviewUrl === url ? next[0] || null : videoPreviewUrl,
    );
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("video/")) return;
    if (file.size > 50 * 1024 * 1024) {
      setMessage({
        type: "error",
        text: "ไฟล์ไม่เกิน 50MB กรุณาอัดคลิปสั้นๆ ไม่เกิน 30 วินาที",
      });
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
      setMessage({
        type: "error",
        text: "อัปโหลดวิดีโอไม่สำเร็จ กรุณาลองใหม่",
      });
    }
    e.target.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step !== 3) return;
    if (applicationTier === "platinum" && form.videoLinks.length < 1) {
      setMessage({
        type: "error",
        text: "ระดับ Platinum ต้องแนบวิดีโอโชว์ทักษะอย่างน้อย 1 คลิปต่อสายงานที่สมัคร",
      });
      return;
    }
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
      applicationTier,
    });
    setLoading(false);
    if (result.success) {
      onApplicationCreated?.({ id: result.id, tier: applicationTier });
      onSuccessStateChange?.(true);
    } else {
      const err = "error" in result ? result.error : null;
      if (err === "platinum_requires_video") {
        setMessage({
          type: "error",
          text: "ระดับ Platinum ต้องมีวิดีโออย่างน้อย 1 คลิป — กรุณาแนบในขั้นตอนนี้",
        });
      } else {
        setMessage({
          type: "error",
          text: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง",
        });
      }
    }
  };

  const canAdvanceFromStep1 =
    form.name.trim().length >= 2 && form.phone.trim().length >= 9;
  const canAdvanceFromStep2 =
    form.profession.trim().length >= 2 && form.experience.trim().length >= 1;

  const goNext = () => {
    setMessage(null);
    if (step === 1 && !canAdvanceFromStep1) {
      setMessage({ type: "error", text: "กรุณากรอกชื่อและเบอร์โทรให้ครบถ้วน" });
      return;
    }
    if (step === 2 && !canAdvanceFromStep2) {
      setMessage({ type: "error", text: "กรุณากรอกสายงานและประสบการณ์" });
      return;
    }
    setStep((s) => Math.min(3, s + 1));
  };

  const goBack = () => {
    setMessage(null);
    setStep((s) => Math.max(1, s - 1));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Stepper — โทนแบบแพลตฟอร์มบริการ (ชัดขั้น / มีมาตรฐาน) */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
            ขั้นตอนการสมัครพาร์ทเนอร์
          </p>
          <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
            {step}/3
          </span>
        </div>
        <div className="flex items-center gap-1">
          {PARTNER_STEPS.map((s, i) => (
            <React.Fragment key={s.id}>
              <button
                type="button"
                onClick={() => {
                  if (
                    s.id < step ||
                    (s.id === 2 && canAdvanceFromStep1) ||
                    (s.id === 3 && canAdvanceFromStep1 && canAdvanceFromStep2)
                  ) {
                    setStep(s.id);
                    setMessage(null);
                  }
                }}
                className={`flex-1 min-w-0 rounded-xl px-2 py-2 text-center transition-all ${
                  step === s.id
                    ? "bg-slate-900 text-white shadow-md"
                    : step > s.id
                      ? "bg-emerald-50 text-emerald-900 border border-emerald-200"
                      : "bg-slate-100 text-slate-500"
                }`}
              >
                <span className="block text-[10px] font-bold leading-tight sm:text-[11px]">
                  {s.title}
                </span>
                <span className="hidden sm:block text-[9px] opacity-80 mt-0.5 leading-tight">
                  {s.sub}
                </span>
              </button>
              {i < PARTNER_STEPS.length - 1 && (
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-slate-300 hidden sm:block"
                  aria-hidden
                />
              )}
            </React.Fragment>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-600">
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />{" "}
            ข้อมูลใช้เพื่อตรวจสอบและติดต่อกลับ
          </span>
          <span className="inline-flex items-center gap-1">
            <ListChecks className="h-3.5 w-3.5 text-slate-500 shrink-0" />{" "}
            มาตรฐานเดียวกับการสมัครผู้ให้บริการบนแอป
          </span>
        </div>
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-white p-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
              <User className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">
                เริ่มจากข้อมูลติดต่อ
              </p>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                ใช้ยืนยันตัวตนและติดต่อกลับเมื่อคัดเลือก —
                ขั้นตอนถัดไปคือยืนยันเบอร์ (OTP) ในแอป AQOND หลังมีบัญชี
              </p>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              ชื่อ-นามสกุล *
            </label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-900 focus:border-transparent"
              placeholder="ตามบัตรประชาชน / ชื่อที่ใช้ติดต่อ"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              เบอร์โทรศัพท์ *
            </label>
            <input
              type="tel"
              required
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-900 focus:border-transparent"
              placeholder="08X-XXX-XXXX"
            />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-white p-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
              <Briefcase className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">
                ความเชี่ยวชาญและประสบการณ์
              </p>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                ช่วยทีมคัดกรองให้ตรงสายงาน — โปร่งใสเหมือนมาตรฐานแพลตฟอร์มบริการ
              </p>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              สายงาน / ความเชี่ยวชาญ *
            </label>
            <input
              type="text"
              required
              value={form.profession}
              onChange={(e) => setForm({ ...form, profession: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-900 focus:border-transparent"
              placeholder="เช่น ช่างแอร์, แม่บ้าน, เชฟ, ไรเดอร์"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              ประสบการณ์ *
            </label>
            <input
              type="text"
              required
              value={form.experience}
              onChange={(e) => setForm({ ...form, experience: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-900 focus:border-transparent"
              placeholder="เช่น 5 ปี, มากกว่า 200 งาน"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              ลิงก์ผลงาน (ถ้ามี)
            </label>
            <input
              type="url"
              value={form.portfolioLink}
              onChange={(e) =>
                setForm({ ...form, portfolioLink: e.target.value })
              }
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-900 focus:border-transparent"
              placeholder="Portfolio, Facebook, เว็บไซต์"
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-900">
              เลือกระดับการสมัคร *
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setApplicationTier("standard")}
                className={`rounded-2xl border-2 p-4 text-left transition-all ${
                  applicationTier === "standard"
                    ? "border-slate-900 bg-slate-50 shadow-md"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <p className="font-bold text-slate-900">ทั่วไป (Standard)</p>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  วิดีโอไม่บังคับ — แนะนำแนบเพื่อให้ทีมคัดกรองเร็วขึ้น
                </p>
              </button>
              <button
                type="button"
                onClick={() => setApplicationTier("platinum")}
                className={`rounded-2xl border-2 p-4 text-left transition-all ${
                  applicationTier === "platinum"
                    ? "border-amber-500 bg-amber-50/90 shadow-md ring-1 ring-amber-200"
                    : "border-slate-200 bg-white hover:border-amber-200"
                }`}
              >
                <p className="font-bold text-amber-950 flex items-center gap-1.5">
                  <Award className="h-4 w-4 shrink-0 text-amber-600" /> Platinum
                </p>
                <p className="text-xs text-amber-950/85 mt-1 leading-relaxed">
                  ต้องมีวิดีโอโชว์ทักษะอย่างน้อย 1 คลิปต่อสายงาน —
                  คัดคุณภาพระดับพรีเมียม
                </p>
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          {applicationTier === "platinum" && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-950">
              โหมด Platinum: ต้องแนบวิดีโออย่างน้อย 1 คลิปก่อนส่งใบสมัคร
            </div>
          )}
          <div className="rounded-xl border border-violet-200 bg-violet-50/80 px-3 py-3">
            <p className="text-sm font-semibold text-violet-950 flex items-center gap-2">
              <Video className="h-4 w-4 shrink-0" /> วิดีโอโชว์ทักษะ
            </p>
            <p className="text-xs text-violet-900/85 mt-1 leading-relaxed">
              ลิงก์ TikTok / YouTube / IG หรืออัปโหลดไฟล์ —
              ให้ทีมเห็นฝีมือจริงก่อนคัดเลือก
            </p>
            <ul className="mt-2 space-y-1 text-[11px] text-violet-900/90 list-disc list-inside">
              <li>แสง มุมกล้อง และเสียงชัด — โฟกัสที่งานจริง</li>
              <li>ความยาวแนะนำไม่เกิน ~30 วินาที • ไฟล์ไม่เกิน 50MB</li>
              <li>
                ระดับ Platinum: อย่างน้อย 1 คลิปต่อสายงานที่ระบุในขั้นที่ 2
              </li>
            </ul>
          </div>

          <div className="pt-1 border-t border-slate-100">
            <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
              <Video size={18} className="text-slate-700" /> พอร์ตวิดีโอ
            </label>
            <p className="text-xs text-amber-800 font-medium mb-3 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200/80">
              ผู้สมัครที่แนบวิดีโอมีโอกาสผ่านการคัดเลือกและงานพรีเมียมสูงขึ้นอย่างมีนัยสำคัญ
            </p>

            <div className="mb-3">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                ลิงก์โซเชียล (TikTok / YouTube / IG)
              </label>
              <div className="flex gap-2">
                <input
                  ref={socialUrlInputRef}
                  type="url"
                  className="flex-1 px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm"
                  placeholder="วางลิงก์แล้วกดเพิ่ม"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const v = (e.target as HTMLInputElement).value;
                      addVideoLink(v);
                      (e.target as HTMLInputElement).value = "";
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const input = socialUrlInputRef.current;
                    if (input) {
                      addVideoLink(input.value);
                      input.value = "";
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-sm flex items-center gap-1 shrink-0"
                >
                  <Link2 size={16} /> เพิ่ม
                </button>
              </div>
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              className="mb-3 p-6 rounded-2xl border-2 border-dashed border-slate-300 hover:border-slate-400/80 cursor-pointer transition-all hover:bg-slate-50 text-center"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm"
                onChange={handleVideoUpload}
                className="hidden"
              />
              {uploading ? (
                <p className="text-slate-500 text-sm">กำลังอัปโหลด...</p>
              ) : (
                <>
                  <Upload className="w-9 h-9 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm text-slate-700 font-medium">
                    อัปโหลดคลิปจากเครื่อง (.mp4 / .webm)
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    ลากวางหรือกดเพื่อเลือกไฟล์
                  </p>
                </>
              )}
            </div>

            <div className="mb-3">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                ประเภทคลิป
              </label>
              <select
                value={form.skillDemoType}
                onChange={(e) =>
                  setForm({
                    ...form,
                    skillDemoType: e.target.value as SkillDemoType,
                  })
                }
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm"
              >
                <option value="">เลือกประเภท (ถ้ามี)</option>
                {SKILL_DEMO_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {videoPreviewUrl && (
              <div className="mt-3">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  ดูตัวอย่าง
                </label>
                <div className="rounded-xl overflow-hidden bg-slate-900 aspect-video border border-slate-200">
                  {videoPreviewUrl.includes("youtube.com") ||
                  videoPreviewUrl.includes("youtu.be") ? (
                    <iframe
                      src={(() => {
                        const m = videoPreviewUrl.match(
                          /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/,
                        );
                        return m
                          ? `https://www.youtube.com/embed/${m[1]}`
                          : videoPreviewUrl;
                      })()}
                      className="w-full h-full"
                      allowFullScreen
                      title="Video preview"
                    />
                  ) : videoPreviewUrl.includes("tiktok.com") ||
                    videoPreviewUrl.includes("instagram.com") ? (
                    <a
                      href={videoPreviewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center h-full text-white/90 hover:text-white text-sm"
                    >
                      เปิดดูบน TikTok / IG ในแท็บใหม่
                    </a>
                  ) : (
                    <video
                      src={videoPreviewUrl}
                      controls
                      className="w-full h-full object-contain"
                      playsInline
                    />
                  )}
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {form.videoLinks.map((url) => (
                    <span
                      key={url}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs cursor-pointer transition-colors ${
                        videoPreviewUrl === url
                          ? "bg-slate-800 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setVideoPreviewUrl(url)}
                        className="text-left truncate max-w-[180px]"
                      >
                        {url.length > 40 ? url.slice(0, 37) + "..." : url}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeVideoLink(url)}
                        className="text-red-500 hover:text-red-700 shrink-0"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {message && (
        <p
          className={`text-sm font-medium ${message.type === "success" ? "text-emerald-600" : "text-red-600"}`}
        >
          {message.text}
        </p>
      )}

      <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
        {step > 1 && (
          <button
            type="button"
            onClick={goBack}
            className="flex-1 py-3 rounded-2xl border border-slate-200 font-semibold text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-2"
          >
            <ChevronLeft size={18} /> ย้อนกลับ
          </button>
        )}
        {step < 3 ? (
          <button
            type="button"
            onClick={goNext}
            className="flex-1 py-3.5 rounded-2xl bg-slate-900 text-white font-bold hover:bg-slate-800 flex items-center justify-center gap-1"
          >
            ถัดไป <ChevronRight size={18} />
          </button>
        ) : (
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-3.5 bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl font-bold hover:shadow-lg transition-all disabled:opacity-70"
          >
            {loading ? "กำลังส่งใบสมัคร..." : "ส่งใบสมัครพาร์ทเนอร์"}
          </button>
        )}
      </div>
      <p className="text-[10px] text-center text-slate-400 leading-relaxed">
        การส่งแบบฟอร์มหมายความว่าคุณยอมรับให้ AQOND
        ใช้ข้อมูลเพื่อติดต่อและพิจารณาคัดเลือกตามนโยบายความเป็นส่วนตัว
      </p>
    </form>
  );
};

const UserRegistrationForm = ({
  onSuccess,
  referralCode,
}: {
  onSuccess: () => void;
  referralCode?: string | null;
}) => {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [form, setForm] = useState({
    name: "",
    interestService: "",
    contact: "",
    location: "",
  });

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
      setMessage({
        type: "success",
        text: "จองสิทธิ์สำเร็จ! คุณจะได้รับส่วนลด 50% เมื่อใช้งานครั้งแรก",
      });
      setTimeout(onSuccess, 1500);
    } else {
      setMessage({
        type: "error",
        text: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง",
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          ชื่อ-นามสกุล
        </label>
        <input
          type="text"
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-accent focus:border-transparent"
          placeholder="ชื่อของคุณ"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          บริการที่สนใจ
        </label>
        <input
          type="text"
          required
          value={form.interestService}
          onChange={(e) =>
            setForm({ ...form, interestService: e.target.value })
          }
          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-accent focus:border-transparent"
          placeholder="เช่น ล้างแอร์, แม่บ้าน, เชฟ"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          อีเมล หรือ เบอร์โทร
        </label>
        <input
          type="text"
          required
          value={form.contact}
          onChange={(e) => setForm({ ...form, contact: e.target.value })}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-accent focus:border-transparent"
          placeholder="อีเมล หรือ 08X-XXX-XXXX"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          พื้นที่ (ถ้ามี)
        </label>
        <input
          type="text"
          value={form.location}
          onChange={(e) => setForm({ ...form, location: e.target.value })}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-accent focus:border-transparent"
          placeholder="เช่น กรุงเทพ, สมุทรปราการ"
        />
      </div>
      {message && (
        <p
          className={`text-sm font-medium ${message.type === "success" ? "text-emerald-600" : "text-red-600"}`}
        >
          {message.text}
        </p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-4 bg-accent text-slate-950 rounded-2xl font-bold hover:shadow-xl transition-all disabled:opacity-70"
      >
        {loading ? "กำลังส่ง..." : "จองสิทธิ์เลย"}
      </button>
    </form>
  );
};

const APP_REGISTER_URL =
  import.meta.env.VITE_APP_URL || "https://app.aqond.com";

export default function App() {
  const go = useGrandOpeningCountdown();
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [showProviderSuccess, setShowProviderSuccess] = useState(false);
  const [providerApplyMeta, setProviderApplyMeta] = useState<{
    id: string;
    tier: "standard" | "platinum";
  } | null>(null);
  const [audiencePreAppOpen, setAudiencePreAppOpen] = useState(false);
  const [audiencePreAppIntent, setAudiencePreAppIntent] = useState<
    "provider" | "user"
  >("provider");
  const [showUserModal, setShowUserModal] = useState(false);
  const [showApplyChoiceModal, setShowApplyChoiceModal] = useState(false);
  const [refCode, setRefCode] = useState<string | null>(null);
  const [manualRefCode, setManualRefCode] = useState("");
  const [refCodeValid, setRefCodeValid] = useState<boolean | null>(null);
  const [refCodeValidating, setRefCodeValidating] = useState(false);
  const [leaderboard, setLeaderboard] = useState<
    Array<{ fullName: string; referralCount: number; earnedThisWeek: number }>
  >([]);
  const [baGrandPodium, setBaGrandPodium] = useState<
    Array<{ rank: number; fullName: string; qualifyingUsers: number }>
  >([]);
  const [locationHash, setLocationHash] = useState(() =>
    typeof window !== "undefined" ? window.location.hash : "",
  );

  useEffect(() => {
    const onHashChange = () => setLocationHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const path = window.location.pathname || "";
    const search = window.location.search || "";
    const pathMatch = path.match(/^\/ref\/([A-Za-z0-9]+)$/);
    const searchMatch = search && new URLSearchParams(search).get("ref");
    const code = pathMatch?.[1] || searchMatch || null;
    if (code) {
      const normalized = String(code).trim().toUpperCase();
      setRefCode(normalized);
      try {
        localStorage.setItem("referral_code", normalized);
      } catch (_) {}

      // Try open native app (deep link). Fallback to web app registration.
      // - If app is installed: OS should switch to app quickly.
      // - If not installed: stay on this landing and then we forward to web app.
      try {
        const deep = `aqond://ref/${encodeURIComponent(normalized)}`;
        // Use a short delay so the browser has time to persist localStorage first.
        window.setTimeout(() => {
          try {
            window.location.href = deep;
          } catch (_) {}
        }, 30);
        window.setTimeout(() => {
          try {
            const base = APP_REGISTER_URL.replace(/\/$/, "");
            window.location.href = `${base}/#/ref/${encodeURIComponent(normalized)}`;
          } catch (_) {}
        }, 900);
      } catch (_) {}
    }
  }, []);

  const effectiveRefCode =
    refCode ||
    (refCodeValid ? manualRefCode.trim().toUpperCase() : null) ||
    null;

  const validateRefCode = async () => {
    const code = manualRefCode.trim().toUpperCase();
    if (!code || code.length < 4) {
      setRefCodeValid(null);
      return;
    }
    setRefCodeValidating(true);
    setRefCodeValid(null);
    try {
      const base = getBackendBaseUrl();
      const res = await fetch(
        `${base}/api/referral/validate/${encodeURIComponent(code)}`,
      );
      const data = await res.json();
      setRefCodeValid(!!data.valid);
      if (data.valid) {
        try {
          localStorage.setItem("referral_code", code);
        } catch (_) {}
      }
    } catch {
      setRefCodeValid(false);
    } finally {
      setRefCodeValidating(false);
    }
  };

  useEffect(() => {
    const base = getBackendBaseUrl();
    fetch(`${base}/api/referral/leaderboard?limit=5`)
      .then((r) => r.json())
      .then((d) => setLeaderboard(d.leaderboard || []))
      .catch(() => {});
    fetch(`${base}/api/referral/brand-adviser/leaderboard?limit=3&board=grand`)
      .then((r) => r.json())
      .then((d) => {
        const list = d.podium?.length ? d.podium : d.leaderboard || [];
        setBaGrandPodium(
          list
            .slice(0, 3)
            .map(
              (e: {
                rank: number;
                fullName: string;
                qualifyingUsers: number;
              }) => ({
                rank: e.rank,
                fullName: e.fullName,
                qualifyingUsers: e.qualifyingUsers,
              }),
            ),
        );
      })
      .catch(() => {});
  }, []);

  const isPrivacyRoute =
    typeof window !== "undefined" && window.location.pathname === "/privacy";
  if (isPrivacyRoute) {
    return <PrivacyPolicy />;
  }

  const isTermsRoute =
    typeof window !== "undefined" && window.location.pathname === "/terms";
  if (isTermsRoute) {
    return <TermsOfService />;
  }

  const isAdminRoute = locationHash === "#/admin";
  if (isAdminRoute) {
    return (
      <AdminDashboard
        onLogout={() => {
          window.location.hash = "";
          window.location.reload();
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1E293B] overflow-x-hidden">
      <NotificationBanner />
      {/* Header with Logo & AQOND */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-100">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <a href="#" className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="AQOND"
              className="h-10 w-10 object-contain"
            />
            <span className="text-xl font-bold text-slate-900 tracking-tight">
              AQOND
            </span>
          </a>
          <nav className="hidden md:flex items-center gap-6 text-slate-600 font-medium">
            <a
              href={`${APP_REGISTER_URL.replace(/\/$/, "")}/#/register`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-emerald-700 hover:text-emerald-800 transition-colors"
            >
              สมัครแอป
            </a>
            <a
              href="#discover"
              className="hover:text-slate-900 transition-colors"
            >
              บริการ
            </a>
            <a
              href="#referral"
              className="hover:text-slate-900 transition-colors"
            >
              แนะนำเพื่อน
            </a>
            <a
              href="#brand-adviser"
              className="hover:text-slate-900 transition-colors"
            >
              Brand Adviser
            </a>
            <a
              href="#interested"
              className="hover:text-slate-900 transition-colors"
            >
              สนใจ
            </a>
            <a href="#about" className="hover:text-slate-900 transition-colors">
              เกี่ยวกับเรา
            </a>
            <a
              href="/privacy"
              className="hover:text-slate-900 transition-colors"
            >
              Privacy Policy
            </a>
          </nav>
        </div>
      </header>

      {/* Hero — Grand Opening + ภาพมือถือ (หลัง Header) */}
      <section className="relative border-b border-slate-200/80 bg-gradient-to-b from-slate-50 via-white to-slate-50/90 pt-8 pb-16 lg:pt-12 lg:pb-24 px-4 sm:px-6">
        <div className="container mx-auto max-w-7xl">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
            <div className="z-10 min-w-0">
              <GrandOpeningHero
                go={go}
                appRegisterUrl={APP_REGISTER_URL}
                onOpenProvider={() => {
                  setShowProviderSuccess(false);
                  setShowProviderModal(true);
                }}
                onOpenUser={() => setShowUserModal(true)}
              />
            </div>
            <div className="relative h-[min(520px,70vh)] lg:h-[600px] min-h-[380px]">
              <motion.div
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.35, duration: 0.9 }}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-[min(100%,288px)] md:w-72"
              >
                <div className="relative p-4 bg-slate-950 rounded-[3rem] shadow-[0_0_50px_rgba(0,0,0,0.2)] border-[8px] border-slate-800">
                  <div className="bg-white rounded-[2rem] h-[420px] lg:h-[450px] overflow-hidden flex flex-col items-center justify-center p-6 text-center">
                    <div className="flex items-center gap-2 mb-4">
                      <img
                        src="/logo.png"
                        alt="AQOND"
                        className="w-12 h-12 object-contain"
                      />
                      <span className="font-black text-xl text-slate-900">
                        AQOND
                      </span>
                    </div>
                    <div className="space-y-3 w-full">
                      <div className="h-4 bg-slate-100 rounded-full w-3/4 mx-auto" />
                      <div className="h-4 bg-slate-100 rounded-full w-1/2 mx-auto" />
                      <div className="mt-8 p-4 bg-blue-50 rounded-2xl border border-blue-100">
                        <p className="text-[10px] text-blue-600 font-bold uppercase tracking-widest">
                          Matched Found!
                        </p>
                        <p className="text-xs font-bold mt-1">
                          ช่างแอร์กำลังเดินทางไปหาคุณ
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
              <motion.img
                initial={{ x: 100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.6, duration: 0.9 }}
                src="https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?auto=format&fit=crop&w=600&q=80"
                className="absolute right-0 top-8 w-40 md:w-56 h-auto rounded-3xl shadow-2xl z-30 border-4 border-white hidden sm:block"
                alt=""
              />
              <motion.div
                initial={{ x: -120, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.85, duration: 1, ease: "easeOut" }}
                className="absolute left-0 bottom-16 z-40 bg-white p-3 rounded-2xl shadow-2xl flex items-center gap-4 max-w-[220px]"
              >
                <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0">
                  <img
                    src="https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=200&q=80"
                    className="w-full h-full object-cover"
                    alt=""
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate">Rider ID: AQ-402</p>
                  <p className="text-[10px] text-emerald-600 font-bold">
                    ● กำลังไปรับงาน
                  </p>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* AQOND Recruit Banner — โปรไฟล์สมบูรณ์ น่าเชื่อถือ (จาก grokVideo/download (9).mp4) */}
      <section
        id="recruit"
        className="relative overflow-hidden bg-gradient-to-br from-sky-100 via-blue-50 to-white"
      >
        <div className="relative w-full h-[520px] sm:h-[560px] md:h-[600px] lg:h-[640px]">
          <img
            src="/aqond-recruit.png"
            alt="AQOND โปรไฟล์สมบูรณ์ น่าเชื่อถือ — รับสมัคร Talent และผู้จ้างงาน"
            className="absolute inset-0 w-full h-full object-contain object-center"
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1920&q=80";
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-900/15 to-transparent md:bg-gradient-to-r md:from-slate-950/75 md:via-slate-900/25 md:to-transparent pointer-events-none" />
          <div className="absolute inset-0 flex flex-col justify-end md:justify-center px-6 md:px-12 lg:px-20 pb-8 md:pb-0 max-w-2xl">
            <div className="hidden md:flex items-center gap-2 mb-2">
              <img
                src="/logo.png"
                alt="AQOND"
                className="h-8 w-8 object-contain"
              />
              <span className="font-bold text-emerald-400 text-lg">AQOND</span>
            </div>
            <p className="text-emerald-400/90 text-sm font-medium mb-1">
              รับสมัคร Talent และผู้จ้างงาน
            </p>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-2">
              ร่วมทีม AQOND
            </h2>
            <p className="text-slate-200 text-lg md:text-xl mb-6">
              สร้างรายได้ง่ายๆ ด้วยตัวคุณเอง
            </p>
            {go.isLive ? (
              <button
                onClick={() => setShowApplyChoiceModal(true)}
                className="inline-flex items-center justify-center w-fit px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl shadow-lg shadow-emerald-500/30 transition-all hover:scale-[1.02]"
              >
                สมัครตอนนี้
              </button>
            ) : (
              <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-start">
                <a
                  href={`${APP_REGISTER_URL.replace(/\/$/, "")}/#/register`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl shadow-lg shadow-emerald-500/30 transition-all"
                >
                  สมัครสมาชิกแอป
                </a>
                <button
                  type="button"
                  onClick={() =>
                    document
                      .getElementById("landing-early-reg")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                  className="inline-flex items-center justify-center px-6 py-4 border border-white/30 text-white font-semibold rounded-2xl hover:bg-white/10 transition-all text-sm"
                >
                  หรือรับแจ้งเตือนเมื่อเปิด (ไม่บังคับ)
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      <AudienceHub
        grandOpeningLive={go.isLive}
        onOpenProvider={() => {
          setShowProviderSuccess(false);
          setShowProviderModal(true);
        }}
        onOpenUser={() => setShowUserModal(true)}
        onScrollReferral={() =>
          document
            .getElementById("referral")
            ?.scrollIntoView({ behavior: "smooth" })
        }
        onScrollToEarlyReg={() =>
          document
            .getElementById("landing-early-reg")
            ?.scrollIntoView({ behavior: "smooth", block: "start" })
        }
        appRegisterUrl={APP_REGISTER_URL}
        onRequestPreAppLead={(kind) => {
          setAudiencePreAppIntent(kind);
          setAudiencePreAppOpen(true);
        }}
      />

      <AudiencePreAppModal
        open={audiencePreAppOpen}
        onClose={() => setAudiencePreAppOpen(false)}
        intent={audiencePreAppIntent}
        appRegisterUrl={APP_REGISTER_URL}
        referralCode={effectiveRefCode}
      />

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
            <h2 className="text-3xl md:text-5xl font-bold text-slate-900 mb-4 tracking-tight">
              เพื่อนได้งาน คุณได้ตังค์
            </h2>
            <p className="text-slate-600 max-w-xl mx-auto text-lg mb-2">
              Brand Adviser Grand Prize — แข่งขัน Top 1 สะสม user
              ที่จัดซื้อบริการจนจบแคมเปญ
            </p>
            <p className="text-slate-500 max-w-lg mx-auto text-sm">
              รางวัล BMW / Mercedes / PCX + เงินสด · แยกจากโบนัสเงินคืน 1.5% (7
              วัน)
            </p>
          </motion.div>
          {baGrandPodium.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="max-w-lg mx-auto mb-8 rounded-2xl bg-white/90 border border-amber-200/60 p-4 shadow-lg"
            >
              <p className="text-xs font-bold text-amber-800 mb-3 text-center uppercase tracking-wide">
                Live Podium — Grand Race
              </p>
              <div className="space-y-2">
                {baGrandPodium.map((e) => (
                  <div
                    key={e.rank}
                    className="flex justify-between items-center text-sm py-1.5 px-2 rounded-lg bg-amber-50/80"
                  >
                    <span className="font-bold text-amber-900">
                      #{e.rank} {e.fullName}
                    </span>
                    <span className="tabular-nums text-emerald-700 font-semibold">
                      {e.qualifyingUsers.toLocaleString("th-TH")} user
                    </span>
                  </div>
                ))}
              </div>
              <a
                href={`${APP_REGISTER_URL.replace(/\/$/, "")}/#/referral`}
                className="mt-3 block text-center text-sm font-semibold text-emerald-700 hover:underline"
              >
                ดูอันดับและกราฟเติบโตในแอป →
              </a>
            </motion.div>
          )}
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
                    <>
                      <CheckCircle2 size={20} /> ถูกต้อง
                    </>
                  ) : refCodeValid === false ? (
                    <span className="text-red-600">ไม่พบ</span>
                  ) : (
                    "ตรวจสอบ"
                  )}
                </button>
              </div>
              {(effectiveRefCode || refCodeValid) && (
                <p className="mt-2 text-sm text-emerald-600 font-medium flex items-center gap-1">
                  <CheckCircle2 size={14} /> รหัส {effectiveRefCode}{" "}
                  จะถูกใช้เมื่อสมัครสมาชิก
                </p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
              <div>
                <p className="text-slate-600 text-sm mb-2">
                  แชร์ลิงก์ให้เพื่อนสมัคร
                </p>
                <p className="text-2xl font-bold text-amber-700">
                  รับ 1.5% ทุกบิลที่เพื่อนทำงาน
                </p>
              </div>
              <a
                href={`${APP_REGISTER_URL}/#/register${effectiveRefCode ? `?ref=${effectiveRefCode}` : ""}`}
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
                    <div
                      key={i}
                      className="flex justify-between items-center text-sm py-2 px-3 rounded-xl hover:bg-slate-50 transition-colors"
                    >
                      <span
                        className={`font-bold ${i < 3 ? "text-amber-700" : "text-slate-600"}`}
                      >
                        <span className="inline-flex w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs items-center justify-center mr-2">
                          {i + 1}
                        </span>
                        {e.fullName}
                      </span>
                      <span className="text-slate-500 font-medium">
                        ฿{e.earnedThisWeek.toLocaleString()} • {e.referralCount}{" "}
                        คน
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </section>

      <BrandAdviserApplicationSection />

      {/* 2. Featured Talent of the Month — Wow 1 */}
      <section className="py-20 px-6 bg-gradient-to-b from-white to-slate-50">
        <div className="container mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <span className="inline-block px-4 py-2 bg-accent/20 text-slate-800 rounded-full text-sm font-bold mb-4">
              Wow 1: Talent Showcase
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              Featured Talent of the Month
            </h2>
            <p className="text-slate-600 max-w-xl mx-auto">
              ผู้เชี่ยวชาญที่เราคัดสรร—ดูคลิปงานจริงก่อนจ้าง
            </p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="max-w-2xl mx-auto rounded-3xl overflow-hidden bg-white/80 backdrop-blur-xl border border-slate-200/60 shadow-2xl"
          >
            <div className="aspect-video bg-slate-900 relative">
              <img
                src="https://images.unsplash.com/photo-1581578731548-c64695cc6958?auto=format&fit=crop&w=800&q=80"
                alt="Featured work clip"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <div className="w-20 h-20 rounded-full bg-white/90 flex items-center justify-center shadow-xl cursor-pointer hover:scale-110 transition-transform">
                  <Play className="w-10 h-10 text-slate-900 ml-1" />
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/90 to-transparent">
                <p className="text-accent font-bold text-sm">
                  ช่างแอร์มือโปร • มากกว่า 500 งาน
                </p>
                <p className="text-white font-semibold text-lg">
                  ล้างแอร์สะอาด ไม่เติมน้ำยาหลอก
                </p>
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
              <p className="text-slate-500 text-sm mt-4 text-center">
                เลื่อนเมาส์มาวางที่มือถือเพื่อดูคลิป
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* AQOND Peace of Mind — Wow 3: Insurance & Trust */}
      <section
        className="py-24 px-6 relative overflow-hidden"
        style={{
          background:
            "linear-gradient(180deg, #0f172a 0%, #0c1222 50%, #0a0f1a 100%)",
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
                title: "Smart Escrow",
                content:
                  "ระบบพักเงินที่ปลอดภัยที่สุด เงินจะถึงมือผู้เชี่ยวชาญเมื่อคุณพึงพอใจเท่านั้น",
                tooltip: {
                  title: "Escrow",
                  detail: "เงินถูกพักไว้ ฿2,500",
                  status: "รอตรวจงาน",
                },
                color: "emerald" as const,
              },
              {
                step: 2,
                Icon: Video,
                title: "Video Evidence",
                content:
                  "ตรวจสอบผลงานผ่านคลิป 'Completion Story' ก่อนจบงาน มั่นใจว่างานเนี๊ยบตรงปก",
                tooltip: {
                  title: "Completion Story",
                  detail: "ช่างส่งคลิปงานเสร็จ",
                  status: "รอคุณยืนยัน",
                },
                color: "gold" as const,
              },
              {
                step: 3,
                Icon: Award,
                title: "Platinum Insurance",
                content:
                  "มีปัญหา? เราแก้ไขให้! ด้วยระบบประกันงานที่กล้าดูแลคุณจนถึงที่สุด",
                tooltip: {
                  title: "เคลมประกัน",
                  detail: "กด Claim ได้ทันที",
                  status: "เราดูแลให้",
                },
                color: "gold" as const,
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
            <p className="text-slate-500 text-sm">
              ระบบ Escrow & ประกันงานผ่านมาตรฐานความปลอดภัย
            </p>
          </motion.div>
        </div>
      </section>

      {/* 3. Quality You Can See — Wow 2 + How We Vet */}
      <section className="bg-slate-900 py-24 px-6 overflow-hidden">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <span className="inline-block px-4 py-2 bg-accent/30 text-white rounded-full text-sm font-bold mb-4">
              Wow 2: Tangible Service
            </span>
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
              Quality You Can See
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto italic">
              &quot;ตั้งแต่ซ่อมท่อน้ำ ยันไปเดทริมแม่น้ำเจ้าพระยา
              เราคัดสรรสิ่งที่ดีที่สุดให้คุณ&quot;
            </p>
          </div>

          {/* Video snippet cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-20">
            {[
              {
                img: "https://images.unsplash.com/photo-1581578731548-c64695cc6958?auto=format&fit=crop&w=500&q=80",
                label: "ช่างแอร์",
                sub: "ล้างแอร์จริง ไม่เติมน้ำยาหลอก",
              },
              {
                img: "https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=500&q=80",
                label: "Chef Cooking",
                sub: "อาหารระดับมิชลินที่บ้านคุณ",
              },
              {
                img: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=500&q=80",
                label: "แม่บ้าน",
                sub: "สะอาดกริ๊บ ทุกมุมบ้าน",
              },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="group rounded-2xl overflow-hidden bg-white/5 backdrop-blur-sm border border-slate-600/40 hover:border-accent/40 transition-all"
              >
                <div className="aspect-video relative">
                  <img
                    src={item.img}
                    alt={item.label}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
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
            <h3 className="text-2xl md:text-3xl font-bold text-white mb-8">
              How We Vet
            </h3>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  icon: FileSearch,
                  title: "Background Check",
                  sub: "ตรวจสอบประวัติ 100%",
                },
                {
                  icon: ClipboardCheck,
                  title: "Skill Test",
                  sub: "ทดสอบฝีมือจริง",
                },
                {
                  icon: Video,
                  title: "Video Verification",
                  sub: "คลิปสาธิตงานจริง",
                },
              ].map((item, i) => {
                const Icon = item.icon;
                return (
                  <div
                    key={i}
                    className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-slate-600/40"
                  >
                    <div className="inline-flex p-4 rounded-xl bg-accent/20 mb-4">
                      <Icon className="w-8 h-8 text-white" />
                    </div>
                    <h4 className="text-white font-bold text-lg mb-1">
                      {item.title}
                    </h4>
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
              <Sparkles
                className="absolute top-5 right-5 opacity-20"
                size={100}
              />
              <h3 className="text-3xl font-black mb-4">AQOND PLATINUM</h3>
              <p className="text-blue-100 text-lg mb-8">
                สัมผัสประสบการณ์ที่เหนือกว่า <br />
                ความใส่ใจที่เรามอบให้มากกว่าแค่บริการ
              </p>
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
            <span className="inline-block px-4 py-2 bg-accent/30 text-white rounded-full text-sm font-bold mb-4">
              Wow 3: Guarantee System
            </span>
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">
              Platinum Insurance Shield
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              ความมั่นใจที่เรามอบให้ทุกการจอง
            </p>
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
                  <h3 className="text-2xl md:text-4xl font-black text-white mb-3">
                    Every Job is Insured.
                  </h3>
                  <p className="text-slate-300 text-lg md:text-xl leading-relaxed font-semibold">
                    100% Satisfaction or We Fix It.
                  </p>
                </div>
              </div>
              <div className="text-center md:text-right">
                <p className="text-cyan-400 font-bold text-lg md:text-xl">
                  ทุกงานรับประกัน
                </p>
                <p className="text-white/90 font-medium">
                  พึงพอใจ 100% หรือเราจัดการให้
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* 4. สนใจ — แท็บใหม่ */}
      <section
        id="interested"
        className="py-24 px-6 bg-gradient-to-b from-slate-50 to-white"
      >
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
            <h2 className="text-3xl md:text-5xl font-bold text-slate-900 mb-4">
              พร้อมเริ่มต้นแล้วหรือยัง?
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto">
              ไม่ว่าจะเป็นผู้ให้บริการหรือผู้รับบริการ — AQOND
              พร้อมเชื่อมคุณกับโอกาสที่ดีที่สุด
            </p>
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
                <h3 className="text-xl font-bold text-slate-900">
                  เป็นผู้เชี่ยวชาญ
                </h3>
              </div>
              <p className="text-slate-600 mb-6">
                สมัครเป็นพาร์ทเนอร์ Platinum สร้างรายได้จากทักษะของคุณ
              </p>
              {go.isLive ? (
                <button
                  onClick={() => {
                    setShowProviderSuccess(false);
                    setShowProviderModal(true);
                  }}
                  className="w-full py-4 bg-slate-950 text-white rounded-2xl font-bold hover:shadow-xl transition-all flex items-center justify-center gap-2"
                >
                  <Sparkles size={20} /> สมัครเป็นพาร์ทเนอร์
                </button>
              ) : (
                <div className="space-y-2">
                  <a
                    href={`${APP_REGISTER_URL.replace(/\/$/, "")}/#/register`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-4 bg-slate-950 text-white rounded-2xl font-bold hover:shadow-xl transition-all flex items-center justify-center gap-2"
                  >
                    สมัครสมาชิกแอป (Talent / Provider)
                  </a>
                  <button
                    type="button"
                    onClick={() =>
                      document
                        .getElementById("landing-early-reg")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" })
                    }
                    className="w-full py-3 text-sm text-slate-600 border border-slate-200 rounded-2xl hover:bg-slate-50"
                  >
                    รับแจ้งเตือนเมื่อเปิด — ฟอร์ม Hero (ไม่บังคับ)
                  </button>
                </div>
              )}
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
              <p className="text-slate-600 mb-6">
                จองสิทธิ์รับส่วนลด 50% เมื่อใช้งานครั้งแรก
              </p>
              {go.isLive ? (
                <button
                  onClick={() => setShowUserModal(true)}
                  className="w-full py-4 bg-accent text-slate-950 rounded-2xl font-bold hover:shadow-xl transition-all flex items-center justify-center gap-2"
                >
                  <Star size={20} /> จองสิทธิ์รับส่วนลด 50%
                </button>
              ) : (
                <div className="space-y-2">
                  <a
                    href={`${APP_REGISTER_URL.replace(/\/$/, "")}/#/register`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-4 bg-accent text-slate-950 rounded-2xl font-bold hover:shadow-xl transition-all flex items-center justify-center gap-2"
                  >
                    สมัครสมาชิกแอป (ผู้ใช้งาน)
                  </a>
                  <button
                    type="button"
                    onClick={() =>
                      document
                        .getElementById("landing-early-reg")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" })
                    }
                    className="w-full py-3 text-sm text-slate-600 border border-slate-200 rounded-2xl hover:bg-slate-50"
                  >
                    รับแจ้งเตือน / โปรก่อนเปิด — ฟอร์ม Hero (ไม่บังคับ)
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </section>

      {/* 5. SERVICES TAB — แท็บบริการ (อาชีพทั้งหมด) */}
      <section
        id="services"
        className="relative py-24 px-6 overflow-hidden bg-gradient-to-b from-slate-50 to-white"
      >
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
            <h2 className="text-3xl md:text-5xl font-bold text-slate-900 mb-4">
              อาชีพที่เราคัดสรร
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto">
              ตั้งแต่ซ่อมท่อน้ำ ยันไปเดทริมแม่น้ำเจ้าพระยา
              เราคัดสรรผู้เชี่ยวชาญระดับพรีเมียมให้คุณ
            </p>
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
                    <div
                      className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${service.gradient} mb-3 group-hover:scale-110 transition-transform`}
                    >
                      <Icon className="w-6 h-6 text-white" strokeWidth={2} />
                    </div>
                    <h4 className="font-bold text-slate-900 text-sm md:text-base mb-0.5 tracking-tight">
                      {service.title}
                    </h4>
                    <p className="text-slate-500 text-xs md:text-sm leading-snug">
                      {service.sub}
                    </p>
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
              มากกว่าแค่บริการ คือ{" "}
              <span className="text-accent">การจัดการไลฟ์สไตล์</span>
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
              <span className="inline-block text-accent font-semibold tracking-widest text-sm uppercase mb-4">
                The Vision
              </span>
              <h3 className="text-3xl md:text-4xl font-bold text-white mb-6">
                วิสัยทัศน์ที่เหนือกว่า
              </h3>
              <p className="text-slate-300 text-lg md:text-xl leading-relaxed">
                เราไม่ใช่แอปหาช่าง—เราเป็น{" "}
                <span className="text-accent font-semibold">
                  ผู้ยกระดับมาตรฐานชีวิต
                </span>
              </p>
              <p className="text-slate-400 text-lg leading-relaxed mt-6">
                AQOND เกิดขึ้นเพื่อทลายกำแพงความเสี่ยงในงานบริการ
                เราเชื่อว่าทุกคนคู่ควรกับบริการที่เป๊ะ ตรงเวลา
                และมีคุณภาพระดับสูงสุด โดยไม่ต้องลุ้นหรือเสี่ยงดวงอีกต่อไป
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
                <span className="inline-block text-accent font-semibold tracking-widest text-sm uppercase">
                  The Golden Balance
                </span>
                <h3 className="text-3xl md:text-4xl font-bold text-white">
                  ความสมดุลแห่งคุณภาพ
                </h3>
                <p className="text-slate-300 leading-relaxed">
                  เราคัดกรองผู้เชี่ยวชาญอย่างเข้มงวดด้วย{" "}
                  <span className="text-accent">การตรวจสอบประวัติ 100%</span>{" "}
                  การทดสอบฝีมือจริง และระบบให้คะแนนที่โปร่งใส
                  เพื่อให้ได้ความสมดุลระหว่าง
                </p>
                <ul className="space-y-2 text-slate-400">
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-accent" />{" "}
                    ราคาที่สมเหตุสมผล
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-accent" />{" "}
                    คุณภาพระดับพรีเมียม
                  </li>
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
              <h3 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Why AQOND?
              </h3>
              <p className="text-slate-400 text-lg">ทำไมต้องเป็นเรา?</p>
            </motion.div>
            <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
              {[
                {
                  icon: ShieldCheck,
                  title: "Curated Professionals",
                  sub: "ผู้เชี่ยวชาญที่เราคัดมาแล้ว",
                  desc: "ไม่ใช่ใครก็ได้ แต่ต้องเป็นคนที่เราคัดสรรและตรวจสอบแล้วเท่านั้น",
                },
                {
                  icon: CreditCard,
                  title: "Transparent & Secure",
                  sub: "ราคาชัดเจน ชำระปลอดภัย",
                  desc: "ราคากลางชัดเจน จ่ายเงินผ่านระบบที่ปลอดภัย มีการคุ้มครองผู้ใช้",
                },
                {
                  icon: Phone,
                  title: "Platinum Support",
                  sub: "ทีมงานดูแลตลอด 24 ชม.",
                  desc: "ทีมงานดูแลช่วยเหลือตลอด 24 ชั่วโมง พร้อมอยู่เคียงคุณทุกเมื่อ",
                },
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
                    <h4 className="text-xl font-bold text-white mb-1">
                      {item.title}
                    </h4>
                    <p className="text-accent font-semibold text-sm mb-3">
                      {item.sub}
                    </p>
                    <p className="text-slate-400 text-sm leading-relaxed">
                      {item.desc}
                    </p>
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
                <span className="text-4xl font-bold text-accent text-cyan-400">
                  <AnimatedCounter target={100} suffix="%" />
                </span>
                <div className="text-left">
                  <p className="text-white font-semibold ">
                    ผู้เชี่ยวชาญผ่านการตรวจสอบ
                  </p>
                  <p className="text-slate-400 text-sm">ทุกคนผ่านการคัดกรอง</p>
                </div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                className="flex items-center justify-center gap-4 p-6 rounded-2xl bg-white/5 border border-slate-600/50"
              >
                <span className="text-4xl font-bold text-accent text-cyan-400">
                  <AnimatedCounter target={24} suffix="/7" />
                </span>
                <div className="text-left">
                  <p className="text-white font-semibold">บริการดูแลลูกค้า</p>
                  <p className="text-slate-400 text-sm">
                    พร้อมช่วยเหลือตลอด 24 ชม.
                  </p>
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
              <span className="inline-block text-accent font-semibold tracking-widest text-sm uppercase mb-4">
                Our Story
              </span>
              <h3 className="text-3xl md:text-4xl font-bold text-white mb-8">
                เรื่องราวของเรา
              </h3>
              <p className="text-slate-300 text-lg leading-relaxed mb-6">
                จากปัญหาที่เคยเจอ—ช่างทิ้งงาน บริการที่ไม่ได้มาตรฐาน
                ความไม่แน่นอนในทุกการจอง—เราเริ่มต้นสร้าง Ecosystem
                ที่ดีที่สุดสำหรับทั้งสองฝั่ง
              </p>
              <div className="grid md:grid-cols-2 gap-6 text-left">
                <div className="p-6 rounded-2xl bg-white/5 border border-slate-600/40">
                  <h4 className="text-accent font-bold text-lg mb-2">
                    ผู้ให้บริการ (Providers)
                  </h4>
                  <p className="text-slate-400 text-sm">
                    รายได้ที่มั่นคง โอกาสงานที่ผ่านการคัดกรอง ระบบที่โปร่งใส
                  </p>
                </div>
                <div className="p-6 rounded-2xl bg-white/5 border border-slate-600/40">
                  <h4 className="text-accent font-bold text-lg mb-2">
                    ผู้รับบริการ (Users)
                  </h4>
                  <p className="text-slate-400 text-sm">
                    ประสบการณ์ที่ประทับใจ บริการที่ตรงเวลา คุณภาพที่รับประกันได้
                  </p>
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
              <span className="inline-block text-accent font-semibold tracking-widest text-sm uppercase mb-4">
                Meet the Team
              </span>
              <h3 className="text-3xl md:text-4xl font-bold text-white mb-4">
                ทีมงานเบื้องหลัง
              </h3>
              <p className="text-slate-400 max-w-xl mx-auto">
                คนจริงๆ ที่คอยขับเคลื่อนระบบนี้ให้คุณทุกวัน
              </p>
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
                <p
                  className="text-accent font-semibold text-sm"
                  style={{ fontFamily: "'Cinzel', serif" }}
                >
                  AQOND
                </p>
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
                    src="/CEO.jpg"
                    alt="CEO - AQOND"
                    className="w-full h-full object-cover object-top"
                  />
                </div>
                <h4 className="text-white font-bold text-lg">CEO</h4>
                <p
                  className="text-accent font-semibold text-sm"
                  style={{ fontFamily: "'Cinzel', serif" }}
                >
                  AQOND
                </p>
                <p className="text-slate-400 text-sm mt-1">ประธานบริษัท</p>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />

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
              setProviderApplyMeta(null);
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className={`rounded-3xl shadow-2xl w-full max-h-[90vh] overflow-y-auto ${
                showProviderSuccess
                  ? "max-w-md bg-transparent"
                  : "max-w-2xl bg-white"
              }`}
            >
              {!showProviderSuccess && (
                <div className="p-6">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="text-amber-500" size={28} />
                      <div>
                        <h3 className="text-xl font-bold text-slate-900">
                          สมัครเป็นพาร์ทเนอร์ VIP
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          แบบฟอร์มมาตรฐาน 3 ขั้นตอน — เลือกสมัครทั่วไปหรือ
                          Platinum (Platinum ต้องมีวิดีโอ 1 คลิป)
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setShowProviderModal(false);
                        setShowProviderSuccess(false);
                        setProviderApplyMeta(null);
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
                    onApplicationCreated={(p) => setProviderApplyMeta(p)}
                    referralCode={effectiveRefCode}
                  />
                </div>
              )}
              {showProviderSuccess && (
                <ProviderRegistrationSuccess
                  applicationId={providerApplyMeta?.id}
                  applicationTier={providerApplyMeta?.tier ?? "standard"}
                  onBack={() => {
                    setShowProviderModal(false);
                    setShowProviderSuccess(false);
                    setProviderApplyMeta(null);
                  }}
                />
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Apply Choice Modal - เลือกประเภทการสมัคร */}
      <AnimatePresence>
        {showApplyChoiceModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowApplyChoiceModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-slate-900">สมัครเป็น</h3>
                <button
                  onClick={() => setShowApplyChoiceModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <p className="text-slate-600 text-sm mb-6">
                เลือกประเภทที่ต้องการสมัคร
              </p>
              <div className="grid grid-cols-1 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowApplyChoiceModal(false);
                    setShowProviderSuccess(false);
                    setShowUserModal(true);
                  }}
                  className="flex items-center gap-4 p-4 rounded-2xl border-2 border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/50 transition-all text-left group"
                >
                  <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center group-hover:bg-emerald-200 transition-colors">
                    <Briefcase className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">
                      ผู้ใช้งาน / ผู้จ้างงาน
                    </p>
                    <p className="text-sm text-slate-500">
                      จองงาน หาผู้เชี่ยวชาญ รับส่วนลด 50%
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowApplyChoiceModal(false);
                    setShowProviderSuccess(false);
                    setShowProviderModal(true);
                  }}
                  className="flex items-center gap-4 p-4 rounded-2xl border-2 border-slate-200 hover:border-amber-500 hover:bg-amber-50/50 transition-all text-left group"
                >
                  <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center group-hover:bg-amber-200 transition-colors">
                    <UserCircle className="w-6 h-6 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">
                      ผู้รับงาน / Talents
                    </p>
                    <p className="text-sm text-slate-500">
                      สมัครเป็นพาร์ทเนอร์ สร้างรายได้จากทักษะ
                    </p>
                  </div>
                </button>
              </div>
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
                    <h3 className="text-xl font-bold text-slate-900">
                      จองสิทธิ์รับส่วนลด 50%
                    </h3>
                  </div>
                  <button
                    onClick={() => setShowUserModal(false)}
                    className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
                <UserRegistrationForm
                  onSuccess={() => setShowUserModal(false)}
                  referralCode={effectiveRefCode}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
