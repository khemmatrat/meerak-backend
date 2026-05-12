/**
 * TechnicalSpecialistSelector — The Tech Master Verification
 * AQOND Premium Theme: White bg, Green primary, Gold verified accents
 */
import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ShieldCheck,
  Zap,
  Wrench,
  Home,
  ChevronRight,
  Play,
  Loader2,
  CheckCircle2,
  ClipboardList,
  Award,
} from "lucide-react";
import { videoService, type TalentVideo } from "../services/videoService";

const AQOND_GREEN = "#00A86B";
const PREMIUM_GOLD = "#D4AF37";

// Certified categories — with icon accent colors for visual pop
const CERTIFIED_CATEGORIES = [
  {
    id: "electric_plumbing",
    label: "ไฟฟ้า / ประปา",
    sublabel: "มีใบอนุญาตประกอบวิชาชีพ",
    icon: Zap,
    iconBg: "bg-amber-100",
    iconColor: "#F59E0B",
    category: "Electrician",
    fallbackCategory: "Plumbing",
  },
  {
    id: "ac_appliance",
    label: "แอร์ / เครื่องใช้ไฟฟ้า",
    sublabel: "ผ่านมาตรฐานกรมพัฒนาฝีมือแรงงาน",
    icon: Wrench,
    iconBg: "bg-sky-100",
    iconColor: "#0284C7",
    category: "AC_Cleaning",
    fallbackCategory: "Appliance_Repair",
  },
  {
    id: "renovation",
    label: "รีโนเวท / โครงสร้าง",
    sublabel: "ทีมวิศวกรดูแล",
    icon: Home,
    iconBg: "bg-orange-100",
    iconColor: "#EA580C",
    category: "Construction",
    fallbackCategory: "Painting",
  },
];

const DIAGNOSTIC_OPTIONS = [
  { id: "ac_not_cool", label: "แอร์ไม่เย็น / มีแต่ลม", category: "AC_Cleaning", priceMin: 800, priceMax: 2500 },
  { id: "power_out", label: "ไฟดับทั้งบ้าน / ปลั๊กไหม้", category: "Electrician", priceMin: 500, priceMax: 3000 },
  { id: "water_leak", label: "น้ำรั่ว / ปั๊มน้ำไม่ทำงาน", category: "Plumbing", priceMin: 600, priceMax: 2000 },
  { id: "ac_clean", label: "ล้างแอร์ / ทำความสะอาด", category: "AC_Cleaning", priceMin: 500, priceMax: 1500 },
  { id: "plug_fix", label: "ซ่อมปลั๊ก / สวิตช์", category: "Electrician", priceMin: 300, priceMax: 800 },
  { id: "pipe_leak", label: "ท่อรั่ว / อุดตัน", category: "Plumbing", priceMin: 500, priceMax: 2500 },
  { id: "paint_wall", label: "ทาสี / ปรับปรุงผนัง", category: "Painting", priceMin: 2000, priceMax: 8000 },
];

const REQUIRED_TOOLS = [
  { id: "ladder", label: "มีบันได" },
  { id: "spare_parts", label: "มีอะไหล่สำรอง (ถ้ามี)" },
  { id: "clear_access", label: "ทางเข้าถึงเครื่องโล่ง" },
];

const ASSURANCE_MSG = "AQOND ตรวจสอบใบเซอร์และประวัติอาชญากรรมช่างกลุ่มนี้แล้ว 100%";

export const TechnicalSpecialistSelector: React.FC = () => {
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedDiagnostic, setSelectedDiagnostic] = useState<typeof DIAGNOSTIC_OPTIONS[0] | null>(null);
  const [requiredToolsChecked, setRequiredToolsChecked] = useState<Record<string, boolean>>({});
  const [techVideos, setTechVideos] = useState<TalentVideo[]>([]);
  const [videosLoading, setVideosLoading] = useState(true);

  useEffect(() => {
    const loadVideos = async () => {
      setVideosLoading(true);
      try {
        const { videos } = await videoService.getFeed(15);
        setTechVideos(videos || []);
      } catch {
        setTechVideos([]);
      } finally {
        setVideosLoading(false);
      }
    };
    loadVideos();
  }, []);

  const handleToolToggle = (id: string) => {
    setRequiredToolsChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const proceedToCreateJob = () => {
    const cat = selectedDiagnostic?.category || selectedCategory || "Plumbing";
    const categoryConfig = CERTIFIED_CATEGORIES.find(
      (c) => c.category === cat || c.fallbackCategory === cat
    );
    const finalCategory = categoryConfig?.category || cat;

    const problemTags = selectedDiagnostic ? [selectedDiagnostic.label] : [];
    const requiredTools = REQUIRED_TOOLS.filter((t) => requiredToolsChecked[t.id]).map(
      (t) => t.label
    );

    navigate("/create-job", {
      state: {
        fromTechnicalSpecialist: true,
        category: finalCategory,
        problemTags,
        requiredTools,
        diagnosticPrice:
          selectedDiagnostic
            ? `ราคามาตรฐาน ${selectedDiagnostic.priceMin}-${selectedDiagnostic.priceMax} บาท`
            : null,
        title: selectedDiagnostic?.label || `บริการช่างเทคนิค`,
        description: selectedDiagnostic
          ? `อาการ: ${selectedDiagnostic.label}\nราคาโดยประมาณ: ${selectedDiagnostic.priceMin}-${selectedDiagnostic.priceMax} บาท`
          : "ต้องการบริการช่างเทคนิค",
      },
    });
  };

  const directBookTalent = (video: TalentVideo) => {
    const talentId = video.talent_id;
    if (!talentId) return;
    const name = video.talent_name || "ช่างมือโปร";
    const cat = selectedDiagnostic?.category || selectedCategory || "Plumbing";
    navigate(
      `/create-job?providerId=${encodeURIComponent(talentId)}&providerName=${encodeURIComponent(name)}&category=${encodeURIComponent(cat)}`,
      {
        state: {
          providerId: talentId,
          providerName: name,
          fromTechnicalSpecialist: true,
          category: cat,
          problemTags: selectedDiagnostic ? [selectedDiagnostic.label] : [],
          title: `จอง ${name} — ${selectedDiagnostic?.label || "บริการช่าง"}`,
          description: selectedDiagnostic
            ? `อาการ: ${selectedDiagnostic.label}\nราคาโดยประมาณ: ${selectedDiagnostic.priceMin}-${selectedDiagnostic.priceMax} บาท`
            : `ต้องการจอง ${name}`,
        },
      }
    );
  };

  return (
    <div className="min-h-screen bg-white text-slate-800 pb-36">
      {/* Header — matches App header */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200/80 shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link
            to="/"
            className="p-2 -ml-2 rounded-xl hover:bg-slate-100 transition-colors"
            aria-label="กลับ"
          >
            <ArrowLeft size={22} className="text-slate-600" />
          </Link>
          <h1 className="font-bold text-lg text-slate-800 flex-1">ช่างมือโปร</h1>
        </div>
      </div>

      <div className="px-4 pt-6 space-y-8">
        {/* 1. Assurance Landing — Soft gradient header */}
        <section
          className="-mx-4 -mt-2 px-4 pt-6 pb-8 rounded-b-3xl"
          style={{
            background: "linear-gradient(180deg, #E8F5E9 0%, #FFFFFF 100%)",
          }}
        >
          <div className="flex items-center gap-4 mb-6">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-md"
              style={{ backgroundColor: `${AQOND_GREEN}15` }}
            >
              <ShieldCheck size={30} style={{ color: AQOND_GREEN }} />
            </div>
            <div>
              <h2 className="font-bold text-lg text-slate-800 leading-tight">
                ช่างมือโปร ผ่านการตรวจสอบประวัติและใบเซอร์ 100%
              </h2>
              <p className="text-slate-500 text-sm mt-1 font-light">{ASSURANCE_MSG}</p>
            </div>
          </div>

          {/* Certified Category Cards — White with drop shadow + Verified badge */}
          <div className="grid grid-cols-1 gap-3">
            {CERTIFIED_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isSelected = selectedCategory === cat.category;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.category)}
                  className={`flex items-center gap-4 p-4 rounded-2xl text-left transition-all duration-200 ease-out border-2 ${
                    isSelected
                      ? "scale-[1.02] shadow-lg border-[#00A86B] bg-white"
                      : "scale-100 shadow-md border-transparent bg-white hover:scale-[1.01] hover:shadow-lg"
                  }`}
                  style={{
                    boxShadow: isSelected
                      ? "0 10px 25px -5px rgba(0, 168, 107, 0.15), 0 4px 6px -2px rgba(0,0,0,0.05)"
                      : "0 4px 6px -1px rgba(0,0,0,0.06), 0 2px 4px -2px rgba(0,0,0,0.04)",
                  }}
                >
                  <div
                    className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 ${cat.iconBg}`}
                  >
                    <Icon size={26} style={{ color: cat.iconColor }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800">{cat.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5 font-light">{cat.sublabel}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
                      style={{ backgroundColor: `${PREMIUM_GOLD}20`, color: "#B8860B" }}
                    >
                      <Award size={12} /> Verified
                    </span>
                    {isSelected && (
                      <CheckCircle2 size={22} style={{ color: AQOND_GREEN }} />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* 2. Diagnostic Assistant */}
        <section>
          <h3 className="font-bold text-base text-slate-800 mb-2 flex items-center gap-2">
            <ClipboardList size={20} style={{ color: AQOND_GREEN }} />
            วินิจฉัยอาการเบื้องต้น
          </h3>
          <p className="text-slate-500 text-sm mb-4 font-light">
            เลือกอาการ — ระบบจะแสดงราคามาตรฐานเพื่อความโปร่งใส
          </p>
          <div className="flex flex-wrap gap-2">
            {DIAGNOSTIC_OPTIONS.map((opt) => {
              const isSelected = selectedDiagnostic?.id === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelectedDiagnostic(opt)}
                  className={`px-4 py-2.5 rounded-full text-sm font-medium transition-all ${
                    isSelected
                      ? "text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                  style={
                    isSelected
                      ? { backgroundColor: AQOND_GREEN }
                      : undefined
                  }
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Price Transparency Card */}
          {selectedDiagnostic && (
            <div
              className="mt-4 p-5 rounded-2xl border border-slate-200 shadow-sm"
              style={{ backgroundColor: "#F0FDF4" }}
            >
              <p className="text-slate-600 font-medium text-sm">ราคามาตรฐาน (Base Price)</p>
              <p
                className="text-2xl font-bold mt-1"
                style={{ color: AQOND_GREEN }}
              >
                {selectedDiagnostic.priceMin.toLocaleString()} – {selectedDiagnostic.priceMax.toLocaleString()} ฿
              </p>
              <p className="text-slate-500 text-xs mt-2 font-light">
                เป็นค่าโดยประมาณ ราคาจริงอาจแตกต่างตามสภาพงาน
              </p>
            </div>
          )}
        </section>

        {/* 3. Required Tools Checklist */}
        <section>
          <h3 className="font-bold text-base text-slate-800 mb-2">สิ่งที่ช่างต้องการทราบ</h3>
          <p className="text-slate-500 text-sm mb-3 font-light">
            เพื่อให้ช่างเตรียมอุปกรณ์ได้เหมาะสม
          </p>
          <div className="space-y-2">
            {REQUIRED_TOOLS.map((tool) => (
              <label
                key={tool.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-200 shadow-sm cursor-pointer hover:border-slate-300 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={!!requiredToolsChecked[tool.id]}
                  onChange={() => handleToolToggle(tool.id)}
                  className="w-5 h-5 rounded border-slate-300 text-[#00A86B] focus:ring-[#00A86B]"
                />
                <span className="text-slate-700">{tool.label}</span>
              </label>
            ))}
          </div>
        </section>

        {/* 4. Pro Portfolio Preview — Video Stories */}
        <section>
          <h3 className="font-bold text-base text-slate-800 mb-2 flex items-center gap-2">
            <Play size={20} style={{ color: AQOND_GREEN }} />
            คลิปผลงานช่างมือโปร
          </h3>
          <p className="text-slate-500 text-sm mb-4 font-light">
            ดูคลิปผลงานก่อนจ้าง — กด "จองช่างคนนี้" ได้ทันที
          </p>
          {videosLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={32} className="animate-spin" style={{ color: AQOND_GREEN }} />
            </div>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 no-scrollbar snap-x snap-mandatory">
              {techVideos.length === 0 ? (
                <div className="w-full py-12 text-center text-slate-500 font-light">
                  ยังไม่มีคลิป — ไปโพสต์งานเพื่อหาช่างได้เลย
                </div>
              ) : (
                techVideos.slice(0, 10).map((v) => (
                  <div key={v.id} className="flex-shrink-0 w-[160px] snap-center">
                    <div className="aspect-[9/16] rounded-2xl overflow-hidden bg-slate-200 relative group shadow-md">
                      {v.thumbnail_url ? (
                        <img
                          src={v.thumbnail_url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-slate-300 flex items-center justify-center">
                          <Play size={32} className="text-slate-500" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                        <p className="text-white text-sm font-medium truncate">
                          {v.talent_name || "ช่างมือโปร"}
                        </p>
                        <p className="text-slate-200 text-xs line-clamp-2">{v.title || ""}</p>
                      </div>
                      <div className="absolute top-2 right-2">
                        <span
                          className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide"
                          style={{ backgroundColor: PREMIUM_GOLD, color: "#4A3721" }}
                        >
                          Verified
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Link
                        to={`/talents/${v.talent_id}`}
                        className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-medium text-center hover:bg-slate-200 transition-colors"
                      >
                        ดูโปรไฟล์
                      </Link>
                      <button
                        type="button"
                        onClick={() => directBookTalent(v)}
                        className="flex-1 py-2 rounded-xl text-white text-sm font-bold text-center transition-colors"
                        style={{ backgroundColor: AQOND_GREEN }}
                      >
                        จองช่างคนนี้
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </section>

        {/* Spacer for fixed bottom bar */}
        <div className="h-4" />
      </div>

      {/* Bottom CTA — Glassmorphism + Orange-Gold gradient button */}
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
              background: "linear-gradient(135deg, #F97316 0%, #D4AF37 100%)",
              boxShadow: "0 4px 14px rgba(249, 115, 22, 0.35)",
            }}
          >
            โพสต์งานช่าง
            <ChevronRight size={22} />
          </button>
          <Link
            to="/video-feed"
            className="text-center text-sm font-medium hover:underline"
            style={{ color: AQOND_GREEN }}
          >
            ดูคลิปฝีมือช่างทั้งหมด →
          </Link>
        </div>
      </div>
    </div>
  );
};
