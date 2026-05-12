/**
 * CleaningSpecialistSelector — The White Glove Experience
 * AQOND Premium: แม่บ้านมือโปร ผ่านการตรวจสอบประวัติอาชญากรรม 100%
 * - Certification Selector (Home Pro / Verified Pro / Premium Squad)
 * - Scope Assessment + Task Checklist + Estimated Price
 * - Verified Cleaning Stories + Direct Book
 * - Satisfaction Guarantee + Insurance assurance
 */
import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ShieldCheck,
  Sparkles,
  Star,
  ChevronRight,
  Play,
  Loader2,
  CheckCircle2,
  ClipboardList,
  Award,
  Shield,
} from "lucide-react";
import { videoService, type TalentVideo } from "../services/videoService";

const AQOND_GREEN = "#00A86B";
const PREMIUM_GOLD = "#D4AF37";

// Clean & Trust Certification tiers
const CERTIFICATION_TIERS = [
  {
    id: "home_pro",
    label: "AQOND Home Pro",
    sublabel: "แม่บ้านทั่วไป ผ่านการอบรมพื้นฐาน • เน้นราคาประหยัด",
    icon: Star,
    iconBg: "bg-sky-100",
    iconColor: "#0284C7",
    category: "Cleaning",
  },
  {
    id: "verified_pro",
    label: "Verified Pro",
    sublabel: "ตรวจสอบประวัติอาชญากรรม 100% • คะแนนรีวิวสูง",
    icon: Shield,
    iconBg: "bg-amber-100",
    iconColor: "#D4AF37",
    category: "Cleaning",
  },
  {
    id: "premium_squad",
    label: "Premium Cleaning Squad",
    sublabel: "ทีมเฉพาะทาง • ซักโซฟา/ผ้าม่าน • Deep Cleaning",
    icon: Sparkles,
    iconBg: "bg-violet-100",
    iconColor: "#7C3AED",
    category: "Cleaning",
  },
];

// Quick Scope Selector — พื้นที่ + เวลาโดยประมาณ + ราคา
const SCOPE_OPTIONS = [
  { id: "condo_1br", label: "คอนโด 1 ห้องนอน", hours: 2, priceMin: 600, priceMax: 1200 },
  { id: "condo_2br", label: "คอนโด 2 ห้องนอน", hours: 3, priceMin: 900, priceMax: 1500 },
  { id: "house_2fl", label: "บ้านเดี่ยว 2 ชั้น", hours: 4, priceMin: 1500, priceMax: 2500 },
  { id: "post_party", label: "หลังปาร์ตี้ (Deep Clean)", hours: 4, priceMin: 2000, priceMax: 3500 },
  { id: "office_small", label: "ออฟฟิศขนาดเล็ก", hours: 2, priceMin: 800, priceMax: 1500 },
];

// Task checklist — งานที่มักทำ (pre-fill description)
const TASK_CHECKLIST = [
  { id: "wash_dishes", label: "ล้างจาน" },
  { id: "change_bed", label: "เปลี่ยนผ้าปูที่นอน" },
  { id: "sweep", label: "กวาดพื้น" },
  { id: "mop", label: "ถูพื้น" },
  { id: "dust", label: "เช็ดฝุ่น" },
  { id: "bathroom", label: "ทำความสะอาดห้องน้ำ" },
  { id: "kitchen", label: "ทำความสะอาดครัว" },
  { id: "iron", label: "รีดผ้า" },
  { id: "laundry", label: "ซักผ้า" },
];

// Required Supplies
const SUPPLIES_OPTIONS = [
  { id: "have_supplies", label: "มีอุปกรณ์ทำความสะอาดให้" },
  { id: "talent_brings", label: "แม่บ้านต้องนำอุปกรณ์มาเอง" },
];

const ASSURANCE_MSG = "แม่บ้านมือโปร ผ่านการตรวจสอบประวัติอาชญากรรม 100%";
const INSURANCE_MSG = "AQOND ประกันความเสียหายระหว่างงาน 100% (เมื่อจองผ่านระบบ)";
const SATISFACTION_MSG = "ไม่สะอาด AQOND ยินดีส่งทีมซ้ำภายใน 24 ชม.";

export const CleaningSpecialistSelector: React.FC = () => {
  const navigate = useNavigate();
  const [selectedTier, setSelectedTier] = useState<string | null>("verified_pro");
  const [selectedScope, setSelectedScope] = useState<typeof SCOPE_OPTIONS[0] | null>(null);
  const [selectedTasks, setSelectedTasks] = useState<Record<string, boolean>>({});
  const [selectedSupply, setSelectedSupply] = useState<string | null>("have_supplies");
  const [cleaningVideos, setCleaningVideos] = useState<TalentVideo[]>([]);
  const [videosLoading, setVideosLoading] = useState(true);

  useEffect(() => {
    const loadVideos = async () => {
      setVideosLoading(true);
      try {
        const { videos } = await videoService.getFeed(15);
        setCleaningVideos(videos || []);
      } catch {
        setCleaningVideos([]);
      } finally {
        setVideosLoading(false);
      }
    };
    loadVideos();
  }, []);

  const handleTaskToggle = (id: string) => {
    setSelectedTasks((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const getTaskLabels = () =>
    TASK_CHECKLIST.filter((t) => selectedTasks[t.id]).map((t) => t.label);

  const proceedToCreateJob = () => {
    const tier = CERTIFICATION_TIERS.find((t) => t.id === selectedTier) || CERTIFICATION_TIERS[0];
    const taskLabels = getTaskLabels();
    const scopeLabel = selectedScope?.label || "";
    const taskDesc = taskLabels.length > 0 ? taskLabels.join(", ") : "";
    const supplyLabel = SUPPLIES_OPTIONS.find((s) => s.id === selectedSupply)?.label || "";

    let title = "ทำความสะอาด";
    if (selectedScope) title = `ทำความสะอาด — ${selectedScope.label}`;

    let description = "";
    if (scopeLabel) description += `พื้นที่: ${scopeLabel}\n`;
    if (taskDesc) description += `งานที่ต้องการ: ${taskDesc}\n`;
    if (supplyLabel) description += `อุปกรณ์: ${supplyLabel}\n`;
    if (selectedScope) {
      description += `\nเวลาโดยประมาณ: ${selectedScope.hours} ชม.\n`;
      description += `ราคาโดยประมาณ: ${selectedScope.priceMin}-${selectedScope.priceMax} บาท`;
    }

    navigate("/create-job", {
      state: {
        fromCleaningSpecialist: true,
        category: tier.category,
        title,
        description: description.trim() || "ต้องการบริการทำความสะอาด",
        taskTags: taskLabels,
        scopeType: scopeLabel,
        requiredSupplies: supplyLabel,
        estimatedPrice: selectedScope
          ? `${selectedScope.priceMin}-${selectedScope.priceMax} บาท`
          : null,
        estimatedHours: selectedScope?.hours,
      },
    });
  };

  const directBookTalent = (video: TalentVideo) => {
    const talentId = video.talent_id;
    if (!talentId) return;
    const name = video.talent_name || "แม่บ้านมือโปร";
    const taskLabels = getTaskLabels();
    const scopeLabel = selectedScope?.label || "";

    let desc = `ต้องการจอง ${name}`;
    if (scopeLabel) desc += `\nพื้นที่: ${scopeLabel}`;
    if (taskLabels.length) desc += `\nงาน: ${taskLabels.join(", ")}`;

    navigate(
      `/create-job?providerId=${encodeURIComponent(talentId)}&providerName=${encodeURIComponent(name)}&category=Cleaning`,
      {
        state: {
          providerId: talentId,
          providerName: name,
          fromCleaningSpecialist: true,
          category: "Cleaning",
          title: `จอง ${name}`,
          description: desc,
          taskTags: taskLabels,
        },
      }
    );
  };

  return (
    <div className="min-h-screen bg-white text-slate-800 pb-40">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200/80 shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link
            to="/"
            className="p-2 -ml-2 rounded-xl hover:bg-slate-100 transition-colors"
            aria-label="กลับ"
          >
            <ArrowLeft size={22} className="text-slate-600" />
          </Link>
          <h1 className="font-bold text-lg text-slate-800 flex-1">แม่บ้านมือโปร</h1>
        </div>
      </div>

      <div className="px-4 pt-6 space-y-8">
        {/* 1. Assurance Landing — Soft gradient */}
        <section
          className="-mx-4 -mt-2 px-4 pt-6 pb-6 rounded-b-3xl"
          style={{
            background: "linear-gradient(180deg, #E0F2FE 0%, #FFFFFF 100%)",
          }}
        >
          <div className="flex items-center gap-4 mb-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-md"
              style={{ backgroundColor: `${AQOND_GREEN}15` }}
            >
              <ShieldCheck size={30} style={{ color: AQOND_GREEN }} />
            </div>
            <div>
              <h2 className="font-bold text-lg text-slate-800 leading-tight">
                {ASSURANCE_MSG}
              </h2>
              <p className="text-slate-600 text-sm mt-1 font-light">{INSURANCE_MSG}</p>
            </div>
          </div>

          {/* Satisfaction Guarantee Banner */}
          <div
            className="mb-6 p-4 rounded-2xl flex items-center gap-3"
            style={{ backgroundColor: `${PREMIUM_GOLD}15`, border: `1px solid ${PREMIUM_GOLD}40` }}
          >
            <CheckCircle2 size={24} style={{ color: PREMIUM_GOLD }} className="shrink-0" />
            <p className="text-slate-800 font-medium text-sm">{SATISFACTION_MSG}</p>
          </div>

          {/* Certification Tier Cards */}
          <div className="grid grid-cols-1 gap-3">
            {CERTIFICATION_TIERS.map((tier) => {
              const Icon = tier.icon;
              const isSelected = selectedTier === tier.id;
              return (
                <button
                  key={tier.id}
                  type="button"
                  onClick={() => setSelectedTier(tier.id)}
                  className={`flex items-center gap-4 p-4 rounded-2xl text-left transition-all duration-200 border-2 ${
                    isSelected
                      ? "scale-[1.02] shadow-lg border-[#00A86B] bg-white"
                      : "scale-100 shadow-md border-transparent bg-white hover:scale-[1.01]"
                  }`}
                  style={{
                    boxShadow: isSelected
                      ? "0 10px 25px -5px rgba(0, 168, 107, 0.15)"
                      : "0 4px 6px -1px rgba(0,0,0,0.06)",
                  }}
                >
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 ${tier.iconBg}`}>
                    <Icon size={26} style={{ color: tier.iconColor }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800">{tier.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5 font-light">{tier.sublabel}</p>
                  </div>
                  <span
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase shrink-0"
                    style={{ backgroundColor: `${PREMIUM_GOLD}20`, color: "#B8860B" }}
                  >
                    <Award size={12} /> Trusted
                  </span>
                  {isSelected && <CheckCircle2 size={22} style={{ color: AQOND_GREEN }} />}
                </button>
              );
            })}
          </div>
        </section>

        {/* 2. Scope & Diagnostic */}
        <section>
          <h3 className="font-bold text-base text-slate-800 mb-2 flex items-center gap-2">
            <ClipboardList size={20} style={{ color: AQOND_GREEN }} />
            ขอบเขตงาน
          </h3>
          <p className="text-slate-500 text-sm mb-4 font-light">
            เลือกประเภทพื้นที่ ระบบจะประเมินเวลาและราคาให้
          </p>
          <div className="flex flex-wrap gap-2">
            {SCOPE_OPTIONS.map((opt) => {
              const isSelected = selectedScope?.id === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelectedScope(opt)}
                  className={`px-4 py-2.5 rounded-full text-sm font-medium transition-all ${
                    isSelected ? "text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                  style={isSelected ? { backgroundColor: AQOND_GREEN } : undefined}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Estimated Time & Price Card */}
          {selectedScope && (
            <div
              className="mt-4 p-5 rounded-2xl border border-slate-200 shadow-sm"
              style={{ backgroundColor: "#F0FDF4" }}
            >
              <p className="text-slate-600 font-medium text-sm">เวลาที่ต้องใช้เบื้องต้น</p>
              <p className="text-xl font-bold mt-0.5" style={{ color: AQOND_GREEN }}>
                ประมาณ {selectedScope.hours} ชม.
              </p>
              <p className="text-slate-600 font-medium text-sm mt-3">ราคามาตรฐาน (Base Price)</p>
              <p className="text-2xl font-bold mt-0.5" style={{ color: AQOND_GREEN }}>
                {selectedScope.priceMin.toLocaleString()} - {selectedScope.priceMax.toLocaleString()} ฿
              </p>
              <p className="text-slate-500 text-xs mt-2 font-light">
                เป็นค่าโดยประมาณ ราคาจริงอาจแตกต่างตามสภาพ
              </p>
            </div>
          )}

          {/* Task Checklist */}
          <div className="mt-6">
            <h4 className="font-bold text-sm text-slate-800 mb-3">งานที่ต้องการ (เลือกได้หลายรายการ)</h4>
            <div className="flex flex-wrap gap-2">
              {TASK_CHECKLIST.map((t) => (
                <label
                  key={t.id}
                  className={`flex items-center gap-2 px-3 py-2 rounded-full text-sm cursor-pointer transition-all ${
                    selectedTasks[t.id]
                      ? "text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                  style={selectedTasks[t.id] ? { backgroundColor: AQOND_GREEN } : undefined}
                >
                  <input
                    type="checkbox"
                    checked={!!selectedTasks[t.id]}
                    onChange={() => handleTaskToggle(t.id)}
                    className="sr-only"
                  />
                  {selectedTasks[t.id] && <CheckCircle2 size={16} />}
                  {t.label}
                </label>
              ))}
            </div>
          </div>

          {/* Required Supplies */}
          <div className="mt-6">
            <h4 className="font-bold text-sm text-slate-800 mb-3">อุปกรณ์ทำความสะอาด</h4>
            <div className="flex gap-2">
              {SUPPLIES_OPTIONS.map((opt) => {
                const isSelected = selectedSupply === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelectedSupply(opt.id)}
                    className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all border-2 ${
                      isSelected
                        ? "border-[#00A86B] text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                    style={isSelected ? { backgroundColor: AQOND_GREEN } : undefined}
                  >
                  {opt.label}
                </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* 3. Meet Your Match — Video Stories */}
        <section>
          <h3 className="font-bold text-base text-slate-800 mb-2 flex items-center gap-2">
            <Play size={20} style={{ color: AQOND_GREEN }} />
            คลิปผลงานแม่บ้านมือโปร
          </h3>
          <p className="text-slate-500 text-sm mb-4 font-light">
            ดูคลิปก่อนจ้าง กดปุ่มจองแม่บ้านคนนี้ได้ทันที
          </p>
          {videosLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={32} className="animate-spin" style={{ color: AQOND_GREEN }} />
            </div>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 no-scrollbar snap-x snap-mandatory">
              {cleaningVideos.length === 0 ? (
                <div className="w-full py-12 text-center text-slate-500 font-light">
                  ยังไม่มีคลิป ไปโพสต์งานเพื่อหาแม่บ้านได้เลย
                </div>
              ) : (
                cleaningVideos.slice(0, 10).map((v) => (
                  <div key={v.id} className="flex-shrink-0 w-[160px] snap-center">
                    <div className="aspect-[9/16] rounded-2xl overflow-hidden bg-slate-200 relative group shadow-md">
                      {v.thumbnail_url ? (
                        <img src={v.thumbnail_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-slate-300 flex items-center justify-center">
                          <Sparkles size={32} className="text-slate-500" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                        <p className="text-white text-sm font-medium truncate">
                          {v.talent_name || "แม่บ้านมือโปร"}
                        </p>
                        <p className="text-slate-200 text-xs line-clamp-2">{v.title || ""}</p>
                      </div>
                      <div className="absolute top-2 right-2">
                        <span
                          className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase"
                          style={{ backgroundColor: PREMIUM_GOLD, color: "#4A3721" }}
                        >
                          Verified
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Link
                        to={`/talents/${v.talent_id}`}
                        className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-medium text-center hover:bg-slate-200"
                      >
                        ดูโปรไฟล์
                      </Link>
                      <button
                        type="button"
                        onClick={() => directBookTalent(v)}
                        className="flex-1 py-2 rounded-xl text-white text-sm font-bold"
                        style={{ backgroundColor: AQOND_GREEN }}
                      >
                        จองแม่บ้านคนนี้
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </section>
      </div>

      {/* Bottom CTA — Glassmorphism + Gradient */}
      <div
        className="fixed bottom-0 left-0 right-0 p-4 z-30"
        style={{
          background: "rgba(255, 255, 255, 0.85)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderTop: "1px solid rgba(0, 0, 0, 0.06)",
        }}
      >
        <div className="max-w-xl mx-auto flex flex-col gap-3">
          <button
            type="button"
            onClick={proceedToCreateJob}
            className="w-full py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 text-white transition-transform active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, #0284C7 0%, #00A86B 100%)",
              boxShadow: "0 4px 14px rgba(0, 168, 107, 0.35)",
            }}
          >
            โพสต์งานทำความสะอาด
            <ChevronRight size={22} />
          </button>
          <Link
            to="/video-feed"
            className="text-center text-sm font-medium hover:underline"
            style={{ color: AQOND_GREEN }}
          >
            ดูคลิปฝีมือแม่บ้านทั้งหมด →
          </Link>
        </div>
      </div>
    </div>
  );
};
