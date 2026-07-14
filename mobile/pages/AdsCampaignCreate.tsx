import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Upload,
  Wallet,
  TrendingUp,
  PlayCircle,
  CircleDot,
  Store,
  UserCircle,
  MapPin,
  Sparkles,
  Rocket,
  Crown,
  Check,
  Calendar,
  Info,
} from "lucide-react";
import { useNotification } from "../context/NotificationContext";
import { useAuth } from "../context/AuthContext";
import { AdsDestinationPreview } from "../components/AdsDestinationPreview";
import {
  parseAdsDestination,
  normalizeAdsDestinationInput,
} from "../lib/adsDestinationPreview";
import {
  ADS_OBJECTIVES,
  ADS_PACKAGES_UI,
  marketplaceAdsService,
  type AdsObjective,
} from "../services/marketplaceAdsService";

const STEPS = [
  { id: "goal", label: "เป้าหมาย" },
  { id: "creative", label: "โฆษณา" },
  { id: "audience", label: "กลุ่มเป้า" },
  { id: "budget", label: "งบประมาณ" },
  { id: "review", label: "ยืนยัน" },
] as const;

const OBJECTIVE_ICONS: Record<AdsObjective, React.ElementType> = {
  TRAFFIC: TrendingUp,
  VIDEO_VIEWS: PlayCircle,
  STORY_VIEWS: CircleDot,
  MARKETPLACE_LEADS: Store,
  PROFILE_VISITS: UserCircle,
};

const OBJECTIVE_COLORS: Record<AdsObjective, string> = {
  TRAFFIC: "from-emerald-500 to-teal-600",
  VIDEO_VIEWS: "from-violet-500 to-purple-600",
  STORY_VIEWS: "from-pink-500 to-rose-600",
  MARKETPLACE_LEADS: "from-amber-500 to-orange-600",
  PROFILE_VISITS: "from-blue-500 to-indigo-600",
};

const PACKAGE_ICONS = [Sparkles, Rocket, Crown];

const inputClass =
  "w-full px-4 py-3.5 rounded-2xl bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 text-[15px] shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500";

export const AdsCampaignCreate: React.FC = () => {
  const navigate = useNavigate();
  const { notify } = useNotification();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [objective, setObjective] = useState<AdsObjective>("TRAFFIC");
  const [title, setTitle] = useState("");
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("/profile");
  const [packageKey, setPackageKey] = useState("starter");
  const [province, setProvince] = useState("");
  const [reachEstimate, setReachEstimate] = useState<{
    estimatedWeeklyReach: number;
    addressableUsers: number;
  } | null>(null);
  const [scheduledStartAt, setScheduledStartAt] = useState("");
  const [scheduledEndAt, setScheduledEndAt] = useState("");
  const [creativeUrl, setCreativeUrl] = useState("");
  const [contentKind, setContentKind] = useState("IMAGE");
  const [creativeMeta, setCreativeMeta] = useState<{
    processingStatus?: string;
    renderPreflightStatus?: string;
    processingReason?: string | null;
    renderPreflightReason?: string | null;
  }>({});
  const [betaAutoModerate, setBetaAutoModerate] = useState(false);

  useEffect(() => {
    marketplaceAdsService
      .getPackages()
      .then((r) => setBetaAutoModerate(!!r.rollout?.betaAutoModerate))
      .catch(() => setBetaAutoModerate(false));
  }, []);

  useEffect(() => {
    const provinces = province
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const surfaces =
      objective === "VIDEO_VIEWS"
        ? ["VIDEO_FEED"]
        : objective === "MARKETPLACE_LEADS"
          ? ["MARKETPLACE"]
          : ["VIDEO_FEED", "MARKETPLACE"];
    marketplaceAdsService
      .estimateAudience(provinces, surfaces)
      .then((r) => setReachEstimate({ estimatedWeeklyReach: r.estimatedWeeklyReach, addressableUsers: r.addressableUsers }))
      .catch(() => setReachEstimate(null));
  }, [province, objective]);

  const selectedPkg = ADS_PACKAGES_UI.find((p) => p.key === packageKey) || ADS_PACKAGES_UI[0];
  const selectedObjective = ADS_OBJECTIVES.find((o) => o.value === objective);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await marketplaceAdsService.uploadCreative(file);
      setCreativeUrl(res.playbackUrl || res.imageUrl || res.url);
      setContentKind(res.contentKind || "IMAGE");
      setCreativeMeta({
        processingStatus: res.processingStatus,
        renderPreflightStatus: res.renderPreflightStatus,
        processingReason: res.processingReason,
        renderPreflightReason: res.renderPreflightReason,
      });
      notify("อัปโหลดรูป/วิดีโอสำเร็จ", "success");
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string; error?: string } } };
      const msg =
        ax.response?.data?.message ||
        ax.response?.data?.error ||
        (err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ");
      notify(msg, "error");
    }
    setUploading(false);
  };

  const canProceed = (): boolean => {
    if (step === 1) return !!(title.trim() && headline.trim() && creativeUrl.trim());
    return true;
  };

  const goNext = () => {
    if (!canProceed()) {
      notify(
        step === 1 && !creativeUrl.trim()
          ? "กรุณาอัปโหลดรูป/วิดีโอ และกรอกชื่อแคมเปญกับหัวข้อโฆษณา"
          : "กรุณากรอกชื่อแคมเปญและหัวข้อโฆษณา",
        "error",
      );
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const submit = async () => {
    if (!title.trim() || !headline.trim()) {
      notify("กรุณากรอกชื่อและหัวข้อโฆษณา", "error");
      return;
    }
    if (!creativeUrl.trim()) {
      notify("กรุณาอัปโหลดรูปหรือวิดีโอก่อนยิงแคมเปญ", "error");
      setStep(1);
      return;
    }
    setSubmitting(true);
    try {
      const budgetMicro = String(selectedPkg.budgetThb * 1_000_000);
      const res = await marketplaceAdsService.createCampaign({
        title: title.trim(),
        headline: headline.trim(),
        body: body.trim(),
        objective,
        package: packageKey,
        budgetMicro,
        destinationUrl: normalizeAdsDestinationInput(destinationUrl.trim() || "/profile"),
        targetingRules: province ? { geographyIso: province } : {},
        scheduledStartAt: scheduledStartAt || null,
        scheduledEndAt: scheduledEndAt || null,
        contentKind,
        playbackUrl: contentKind === "TALENT_VIDEO" ? creativeUrl : undefined,
        imageUrl: contentKind !== "TALENT_VIDEO" ? creativeUrl : undefined,
        thumbnailUrl: creativeUrl || undefined,
        processingStatus: creativeMeta.processingStatus,
        renderPreflightStatus: creativeMeta.renderPreflightStatus,
        metadata: {
          qualityScore: 60,
          processingStatus: creativeMeta.processingStatus,
          renderPreflightStatus: creativeMeta.renderPreflightStatus,
          processingReason: creativeMeta.processingReason,
          renderPreflightReason: creativeMeta.renderPreflightReason,
        },
      });
      notify(res.message || "สร้างแคมเปญสำเร็จ — รออนุมัติก่อนแสดงโฆษณา", "success");
      navigate("/settings/ads-marketplace");
    } catch (err: unknown) {
      const e = err as {
        response?: {
          status?: number;
          data?: { error?: string; message?: string; balance?: number; required?: number };
        };
      };
      if (e.response?.status === 402) {
        notify(`ยอดในกระเป๋าไม่พอ (ต้องการ ${e.response.data?.required} บาท)`, "error");
      } else if (e.response?.status === 507) {
        notify(
          e.response.data?.message ||
            "พื้นที่ดิสก์เซิร์ฟเวอร์เต็ม — ลองใช้รูป JPG ขนาดเล็ก หรือเคลียร์พื้นที่",
          "error",
        );
      } else {
        notify(
          e.response?.data?.message || e.response?.data?.error || "สร้างแคมเปญไม่สำเร็จ",
          "error",
        );
      }
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-emerald-50/30 text-slate-900">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-slate-100 px-4 pt-4 pb-3 max-w-lg mx-auto">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-slate-500 text-sm font-medium mb-3 hover:text-slate-800"
        >
          <ChevronLeft size={18} /> ยกเลิก
        </button>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">สร้างแคมเปญโฆษณา</h1>
        <p className="text-sm text-slate-500 mt-0.5">ยิง Ads บน Video Feed, Story และ Marketplace</p>
        {betaAutoModerate && (
          <p className="text-xs text-emerald-700 mt-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-100">
            Beta: Creative อนุมัติอัตโนมัติ — ไม่ต้องรอ Ads Admin
          </p>
        )}

        {/* Step indicator */}
        <div className="flex items-center gap-1 mt-4 overflow-x-auto pb-1">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center shrink-0">
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                  i === step
                    ? "bg-emerald-600 text-white shadow-sm"
                    : i < step
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-400"
                }`}
              >
                {i < step ? <Check size={12} /> : <span>{i + 1}</span>}
                <span className="hidden xs:inline sm:inline">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-3 h-0.5 mx-0.5 ${i < step ? "bg-emerald-300" : "bg-slate-200"}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 py-5 max-w-lg mx-auto pb-44">
        {/* Step 0: Goal */}
        {step === 0 && (
          <div>
            <h2 className="text-lg font-bold text-slate-900 mb-1">เลือกเป้าหมาย</h2>
            <p className="text-sm text-slate-500 mb-4">อยากให้คนเห็นโฆษณาแล้วทำอะไร?</p>
            <div className="space-y-3">
              {ADS_OBJECTIVES.map((o) => {
                const Icon = OBJECTIVE_ICONS[o.value];
                const selected = objective === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setObjective(o.value)}
                    className={`w-full text-left p-4 rounded-2xl border-2 transition-all shadow-sm ${
                      selected
                        ? "border-emerald-500 bg-emerald-50/80 ring-2 ring-emerald-500/20"
                        : "border-slate-100 bg-white hover:border-slate-200"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-12 h-12 rounded-xl bg-gradient-to-br ${OBJECTIVE_COLORS[o.value]} flex items-center justify-center shrink-0 shadow-md`}
                      >
                        <Icon size={22} className="text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-900 text-[15px]">{o.label}</p>
                        <p className="text-slate-500 text-sm mt-0.5 leading-snug">{o.desc}</p>
                        <p className="text-xs text-emerald-700 mt-1">แสดงที่: {o.surfaces}</p>
                      </div>
                      {selected && (
                        <div className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center shrink-0">
                          <Check size={14} className="text-white" />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 1: Creative */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 mb-1">เนื้อหาโฆษณา</h2>
              <p className="text-sm text-slate-500">เขียนข้อความและอัปโหลดรูป/วิดีโอที่จะแสดง</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">ชื่อแคมเปญ *</label>
              <input className={inputClass} placeholder="เช่น โปรโมตบริการช่างประปา" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">หัวข้อโฆษณา *</label>
              <input className={inputClass} placeholder="ข้อความสั้นๆ ที่ดึงดูดสายตา" value={headline} onChange={(e) => setHeadline(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">คำอธิบายเพิ่มเติม</label>
              <textarea
                className={`${inputClass} min-h-[88px] resize-none`}
                placeholder="รายละเอียดบริการ โปรโมชัน หรือจุดเด่น"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">ปลายทางเมื่อกดโฆษณา</label>
              <input
                className={inputClass}
                placeholder="/profile · /talents/{id} · /job-board/{jobId}"
                value={destinationUrl}
                onChange={(e) => setDestinationUrl(e.target.value)}
              />
              <AdsDestinationPreview
                destinationUrl={destinationUrl}
                headline={headline}
                userId={user?.id}
                userDisplayName={user?.name || user?.display_name}
                userAvatarUrl={user?.avatar_url || user?.profile_image}
                onSelectPreset={setDestinationUrl}
              />
            </div>

            <label className="block cursor-pointer">
              <div className={`rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
                creativeUrl ? "border-emerald-300 bg-emerald-50/50" : "border-slate-200 bg-white hover:border-emerald-300"
              }`}>
                {creativeUrl ? (
                  <div className="space-y-2">
                    {contentKind !== "TALENT_VIDEO" ? (
                      <img src={creativeUrl} alt="creative" className="mx-auto max-h-32 rounded-xl object-cover" />
                    ) : (
                      <div className="w-16 h-16 mx-auto rounded-xl bg-violet-100 flex items-center justify-center">
                        <PlayCircle className="text-violet-600" size={32} />
                      </div>
                    )}
                    <p className="text-sm font-semibold text-emerald-700">อัปโหลดสำเร็จ</p>
                    <p className="text-xs text-slate-500">แตะเพื่อเปลี่ยนไฟล์</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center">
                      {uploading ? (
                        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Upload className="text-slate-400" size={24} />
                      )}
                    </div>
                    <p className="font-semibold text-slate-800">{uploading ? "กำลังอัปโหลด..." : "อัปโหลดรูปหรือวิดีโอ"}</p>
                    <p className="text-xs text-slate-500">PNG, JPG หรือ MP4 · แนะนำแนวตั้ง 9:16</p>
                  </div>
                )}
              </div>
              <input type="file" accept="image/*,video/*" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
          </div>
        )}

        {/* Step 2: Audience */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 mb-1">กลุ่มเป้าหมาย</h2>
              <p className="text-sm text-slate-500">เลือกพื้นที่หรือปล่อยว่างเพื่อให้ระบบเลือกให้อัตโนมัติ</p>
            </div>

            <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100 flex gap-3">
              <Info className="text-blue-600 shrink-0 mt-0.5" size={18} />
              <p className="text-sm text-blue-800 leading-relaxed">
                AQOND ใช้ข้อมูลความสนใจจากการดูคลิปและโปรไฟล์เพื่อแสดงโฆษณาให้คนที่น่าจะสนใจมากที่สุด
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                <MapPin size={14} className="inline mr-1 text-emerald-600" />
                พื้นที่เป้าหมาย (ไม่บังคับ)
              </label>
              <input
                className={inputClass}
                placeholder="เช่น กรุงเทพ, เชียงใหม่, ภูเก็ต"
                value={province}
                onChange={(e) => setProvince(e.target.value)}
              />
            </div>

            {reachEstimate && (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
                <p className="text-sm font-semibold text-emerald-900">ประมาณการผู้มีโอกาสเห็นโฆษณา</p>
                <p className="text-2xl font-bold text-emerald-800 mt-1">
                  ~{reachEstimate.estimatedWeeklyReach.toLocaleString()} คน/สัปดาห์
                </p>
                <p className="text-xs text-emerald-700 mt-1">
                  จากผู้ใช้ AQOND ที่ตรงพื้นที่ ~{reachEstimate.addressableUsers.toLocaleString()} คน
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Budget */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 mb-1">งบประมาณ & ตารางเวลา</h2>
              <p className="text-sm text-slate-500">
                เงินเข้า Escrow — จ่ายเฉพาะเมื่อมีลูกค้าจอง/สั่งซื้อจริง ครั้งละ 0.05 บาท (ไม่คิดคลิกเปล่า)
              </p>
            </div>

            <div className="space-y-3">
              {ADS_PACKAGES_UI.map((p, idx) => {
                const PkgIcon = PACKAGE_ICONS[idx] || Sparkles;
                const selected = packageKey === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setPackageKey(p.key)}
                    className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                      selected
                        ? "border-emerald-500 bg-emerald-50 shadow-md ring-2 ring-emerald-500/15"
                        : "border-slate-100 bg-white shadow-sm hover:border-slate-200"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          selected ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500"
                        }`}>
                          <PkgIcon size={20} />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{p.label}</p>
                          <p className="text-sm text-slate-500">{p.desc}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-emerald-700">{p.budgetThb.toLocaleString()}</p>
                        <p className="text-xs text-slate-400">บาท</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 gap-3 pt-2">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  <Calendar size={14} className="inline mr-1" /> เริ่มแสดง (ไม่บังคับ)
                </label>
                <input type="datetime-local" className={inputClass} value={scheduledStartAt} onChange={(e) => setScheduledStartAt(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">สิ้นสุด (ไม่บังคับ)</label>
                <input type="datetime-local" className={inputClass} value={scheduledEndAt} onChange={(e) => setScheduledEndAt(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Review */}
        {step === 4 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 mb-1">ตรวจสอบก่อนยิง</h2>
              <p className="text-sm text-slate-500">ยืนยันรายละเอียดแล้วกดปุ่มด้านล่าง</p>
            </div>

            <div className="rounded-2xl bg-white border border-slate-100 shadow-lg overflow-hidden">
              {creativeUrl && contentKind !== "TALENT_VIDEO" && (
                <div className="h-36 bg-slate-100">
                  <img src={creativeUrl} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    {selectedObjective?.label}
                  </span>
                  <span className="text-xs text-slate-400">แคมเปญใหม่</span>
                </div>
                <h3 className="text-lg font-bold text-slate-900">{headline || "—"}</h3>
                {body && <p className="text-sm text-slate-600">{body}</p>}
                <div className="pt-3 border-t border-slate-100 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">ชื่อแคมเปญ</span>
                    <span className="font-medium text-slate-800">{title}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">งบประมาณ</span>
                    <span className="font-bold text-emerald-700">{selectedPkg.budgetThb.toLocaleString()} บาท</span>
                  </div>
                  {province && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">พื้นที่</span>
                      <span className="font-medium">{province}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-500 shrink-0">ปลายทาง</span>
                    <span className="font-medium text-slate-800 text-right font-mono text-xs break-all">
                      {parseAdsDestination(destinationUrl).routePath}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <AdsDestinationPreview
              destinationUrl={destinationUrl}
              headline={headline}
              userId={user?.id}
              userDisplayName={user?.name || user?.display_name}
              userAvatarUrl={user?.avatar_url || user?.profile_image}
              compact
            />

            <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-100">
              <Wallet className="text-amber-600 shrink-0 mt-0.5" size={20} />
              <div className="text-sm text-amber-900 leading-relaxed">
                <p className="font-semibold">หักจาก Wallet ทันที</p>
                <p className="mt-1 text-amber-800/90">
                  {betaAutoModerate
                    ? "Creative จะอนุมัติอัตโนมัติ (Beta) — แสดงใน Feed ได้ทันทีเมื่อสื่อพร้อม"
                    : "โฆษณาจะรอการอนุมัติจากทีมงานก่อนแสดงใน Video Feed, Story และ Marketplace"}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer CTA — อยู่เหนือ bottom nav (h-16) */}
      <div className="fixed bottom-16 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-100 px-4 py-4 max-w-lg mx-auto shadow-[0_-4px_20px_rgba(0,0,0,0.06)] md:bottom-0">
        <div className="flex gap-3">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="px-5 py-3.5 rounded-2xl bg-slate-100 text-slate-700 font-semibold text-[15px] hover:bg-slate-200"
            >
              ย้อนกลับ
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={goNext}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-emerald-600 text-white font-bold text-[15px] shadow-lg shadow-emerald-600/25 hover:bg-emerald-700 active:scale-[0.98] transition-transform"
            >
              ถัดไป <ChevronRight size={18} />
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={submit}
              className="flex-1 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-[15px] shadow-lg shadow-emerald-600/30 disabled:opacity-60 active:scale-[0.98] transition-transform"
            >
              {submitting ? "กำลังสร้าง..." : `ยิง Ads · ${selectedPkg.budgetThb.toLocaleString()} บาท`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdsCampaignCreate;
