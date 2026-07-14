import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useSearchParams, useLocation, Link } from "react-router-dom";
import { MockApi } from "../services/mockApi";
import { api, getBackendBase } from "../services/api";
import {
  MapPin,
  DollarSign,
  Calendar,
  Tag,
  User,
  Sparkles,
  CheckCircle,
  Clock,
  Loader2,
  CheckCircle2,
  Wallet,
} from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import { useNotification } from "../context/NotificationContext";
import { useAuth } from "../context/AuthContext";
import { useMobileAppConfig } from "../context/MobileAppConfigContext";
import { UserProfile, JobLocation, Job } from "../types";
import EmployerMap from "../components/EmployerMap";
import { calcMatchJobTalentBreakdown } from "../constants/matchJobFeeStructure";
import {
  reverseGeocodeOSM,
  formatThaiAddress,
  ThaiAddress,
} from "../context/reverseGeocodeOSM";
import {
  fetchFeeEstimates,
  type FeeEstimatesResponse,
  estimateMatchTalentBreakdown,
} from "../services/feeEstimatesService";
import {
  DEFAULT_HIRING_ORDER_NEWBIE,
  DEFAULT_HIRING_ORDER_SENIOR,
  EMPLOYMENT_TYPE_OPTIONS,
  THAI_PROVINCES,
  getBlueprintBySurfaceAndCategory,
  getEmploymentTypeLabel,
  getRoutingMatrixBySurface,
  suggestRoutingByKeywords,
} from "../constants/workTaxonomy";

const DEFAULT_INSURANCE_PERCENT = 10;

export const CreateJob: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { t } = useLanguage();
  const { notify } = useNotification();
  const { user } = useAuth();
  const { config } = useMobileAppConfig();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [insurance, setInsurance] = useState(true);
  const [insuranceRatePercent, setInsuranceRatePercent] = useState(DEFAULT_INSURANCE_PERCENT);
  const [feeEstimates, setFeeEstimates] = useState<FeeEstimatesResponse | null>(null);

  // AI Matching State
  const [scanning, setScanning] = useState(false);
  const [matchedProviders, setMatchedProviders] = useState<
    { user: UserProfile; score: number; distance: number }[]
  >([]);
  const [scanComplete, setScanComplete] = useState(false);
  const providerId = searchParams.get("providerId");
  const providerName = searchParams.get("providerName");
  const fromPartyVibe = (location.state as { fromPartyVibe?: boolean })?.fromPartyVibe;
  const [jobAddress, setJobAddress] = useState<JobLocation | null>(null);
  const [backendHealthy, setBackendHealthy] = useState(true);
  const rebookAppliedRef = useRef(false);

  // Default datetime = พรุ่งนี้ 09:00 (งานโพสต์ใหม่จะไม่ expired โดยเด็ดขาด)
  const getDefaultDatetime = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d.toISOString().slice(0, 16); // format for datetime-local
  };

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: providerId ? "Dating" : "Cleaning",
    price: "",
    datetime: getDefaultDatetime(),
    duration_hours: 2, // Default duration
    /** เพิ่มจาก dropdown — บันทึกลงรายละเอียดงานตอนส่ง */
    partyCompanionSkill: "" as "" | "Sommelier",
    employment_type: "one_time",
    province: "กรุงเทพมหานคร",
  });
  const matchBlueprint = getBlueprintBySurfaceAndCategory(
    "match_job",
    formData.category,
  );
  const matchRoutingMatrix = getRoutingMatrixBySurface("match_job").slice(0, 6);
  const routingSuggestion = useMemo(
    () =>
      suggestRoutingByKeywords(
        [formData.title, formData.description, formData.category].join(" "),
        {
          verticalWeightOverrides: config.remote.routingWeightOverrides || null,
        },
      ),
    [
      formData.title,
      formData.description,
      formData.category,
      config.remote.routingWeightOverrides,
    ],
  );

  useEffect(() => {
    void fetchFeeEstimates().then(setFeeEstimates).catch(() => {});
  }, []);

  useEffect(() => {
    const state = location.state as { fromTechnicalSpecialist?: boolean; fromCleaningSpecialist?: boolean; fromPartyVibe?: boolean } | null;
    const fromSpecialist = state?.fromTechnicalSpecialist || state?.fromCleaningSpecialist;
    // Party Vibe + Quick Match ใช้ providerId แต่หัวข้อ/รายละเอียดมาจาก vibe — ให้ effect ด้านล่างจัดการ
    if (providerId && providerName && !fromSpecialist && !state?.fromPartyVibe) {
      setFormData((prev) => ({
        ...prev,
        title: `${t("create.direct_hire")} ${providerName}`,
        description: `Hi ${providerName}, I would like to hire you for...`,
      }));
    }
  }, [providerId, providerName, t, location.state]);

  /** สั่งอีกครั้ง — จากประวัติงาน (My Jobs) */
  useEffect(() => {
    if (rebookAppliedRef.current) return;
    const reb = (location.state as { rebookFromJob?: Job } | null)?.rebookFromJob;
    if (!reb?.id) return;
    rebookAppliedRef.current = true;
    setFormData((prev) => ({
      ...prev,
      title: reb.title || prev.title,
      description: reb.description || prev.description,
      category: reb.category || prev.category,
      price: reb.price != null ? String(reb.price) : prev.price,
      datetime: getDefaultDatetime(),
      duration_hours:
        reb.duration_hours != null ? Number(reb.duration_hours) : prev.duration_hours,
      partyCompanionSkill: "",
    }));
    if (
      reb.location &&
      typeof reb.location.lat === "number" &&
      typeof reb.location.lng === "number"
    ) {
      setJobAddress({
        lat: reb.location.lat,
        lng: reb.location.lng,
        fullAddress: reb.location.fullAddress || "",
        district: reb.location.district,
        area: reb.location.area,
        province: reb.location.province,
      });
    }
    navigate(`${location.pathname}${location.search || ""}`, {
      replace: true,
      state: {},
    });
  }, [location.state, location.pathname, location.search, navigate]);

  // ดึงอัตราประกันจาก Admin (insurance_rate_by_category / insurance_settings)
  useEffect(() => {
    const cat = (formData.category || "").trim();
    const url = cat ? `/settings/insurance-rate?category=${encodeURIComponent(cat)}` : "/settings/insurance-rate";
    api.get<{ insurance_rate_percent?: number }>(url)
      .then((r) => setInsuranceRatePercent(r.data?.insurance_rate_percent ?? DEFAULT_INSURANCE_PERCENT))
      .catch(() => setInsuranceRatePercent(DEFAULT_INSURANCE_PERCENT));
  }, [formData.category]);

  // Pre-fill from Technical Specialist Selector (location.state)
  useEffect(() => {
    const state = location.state as {
      fromTechnicalSpecialist?: boolean;
      category?: string;
      title?: string;
      description?: string;
      problemTags?: string[];
      requiredTools?: string[];
      diagnosticPrice?: string;
    } | null;
    if (state?.fromTechnicalSpecialist && state?.category) {
      let desc = state.description || "";
      if (state.requiredTools?.length) {
        desc += (desc ? "\n\n" : "") + "สิ่งที่เตรียมไว้: " + state.requiredTools.join(", ");
      }
      if (state.diagnosticPrice) {
        desc += (desc ? "\n" : "") + state.diagnosticPrice;
      }
      setFormData((prev) => ({
        ...prev,
        category: state.category || prev.category,
        title: state.title || prev.title,
        description: desc || prev.description,
      }));
    }
  }, [location.state]);

  // Pre-fill from Cleaning Specialist Selector (location.state)
  useEffect(() => {
    const state = location.state as {
      fromCleaningSpecialist?: boolean;
      category?: string;
      title?: string;
      description?: string;
      taskTags?: string[];
      scopeType?: string;
      requiredSupplies?: string;
      estimatedPrice?: string;
      estimatedHours?: number;
    } | null;
    if (state?.fromCleaningSpecialist && state?.category) {
      let desc = state.description || "";
      if (state.requiredSupplies) {
        desc += (desc ? "\n" : "") + `อุปกรณ์: ${state.requiredSupplies}`;
      }
      if (state.estimatedPrice) {
        desc += (desc ? "\n" : "") + `ราคาโดยประมาณ: ${state.estimatedPrice}`;
      }
      setFormData((prev) => ({
        ...prev,
        category: state.category || prev.category,
        title: state.title || prev.title,
        description: desc || prev.description,
      }));
    }
  }, [location.state]);

  // Pre-fill from Party Vibe Picker (location.state.vibe)
  useEffect(() => {
    const state = location.state as { fromPartyVibe?: boolean; fromTechnicalSpecialist?: boolean; fromCleaningSpecialist?: boolean; vibe?: { category: string; title: string; description: string } } | null;
    if (state?.fromTechnicalSpecialist || state?.fromCleaningSpecialist) return; // Specialist takes precedence
    const vibe = state?.fromPartyVibe ? state?.vibe : null;
    if (vibe?.category && vibe?.title) {
      const wantsSomm =
        typeof vibe.description === "string" && /sommelier/i.test(vibe.description);
      setFormData((prev) => ({
        ...prev,
        category: vibe.category,
        title: vibe.title,
        description: vibe.description || prev.description,
        partyCompanionSkill: wantsSomm ? "Sommelier" : "",
      }));
    }
  }, [location.state]);

  // Pre-fill category & title from Home service cards (/create-job?category=Driver etc.)
  useEffect(() => {
    const state = location.state as { fromPartyVibe?: boolean; fromTechnicalSpecialist?: boolean; fromCleaningSpecialist?: boolean } | null;
    const hasSpecialist = state?.fromTechnicalSpecialist || state?.fromCleaningSpecialist;
    if (state?.fromPartyVibe || hasSpecialist) return; // Vibe/Specialist take precedence
    const cat = searchParams.get("category");
    if (cat) {
      const titles: Record<string, string> = {
        Driver: t("home.svc_driver_title"),
        Cleaning: t("home.svc_cleaning_title"),
        Plumbing: t("home.svc_technical_title"),
        Party_Guest: t("home.svc_party_title"),
      };
      setFormData((prev) => ({
        ...prev,
        category: cat,
        title: titles[cat] || prev.title || "",
      }));
    }
  }, [searchParams.get("category"), t, location.state]);

  // Run AI Scan when category changes
  useEffect(() => {
    if (!providerId && formData.category) {
      const runScan = async () => {
        setScanning(true);
        setScanComplete(false);
        try {
          // Mock location (in real app get from GPS)
          const jobDataForScan = {
            category: formData.category,
            location: { lat: 13.7563, lng: 100.5018 },
            /** Driver: ค่าเริ่มเป็นคลาสรถสี่ล้อ — สอดคล้อง matchingHardRules (ไม่จับมอเตอร์ไซค์มาแทนรถเก๋ง) */
            ...(formData.category === "Driver" ? { transport_vehicle: "standard" as const } : {}),
            /** ช่วงเวลางาน — ให้ backend กรองผู้ให้บริการที่ชน slot (datetime + duration_hours) */
            ...(formData.datetime
              ? {
                  job_datetime: formData.datetime,
                  duration_hours: Number(formData.duration_hours) || 2,
                }
              : {}),
          };
          const results = await MockApi.findSmartMatches(jobDataForScan);
          setMatchedProviders(results);
          setScanComplete(true);
        } catch (e) {
          console.error(e);
        } finally {
          setScanning(false);
        }
      };

      // Debounce
      const timer = setTimeout(runScan, 1000);
      return () => clearTimeout(timer);
    }
  }, [formData.category, providerId]);

  const categories = [
    // Home Services
    "Cleaning",
    "AC_Cleaning",
    "Plumbing",
    "Electrician",
    "Moving",
    "Gardening",
    "Painting",
    "Pest_Control",
    "Appliance_Repair",
    "Interior_Design",
    // Lifestyle
    "Dating",
    "Shopping_Buddy",
    "Party_Guest",
    "Model",
    "Consultant",
    "Fortune_Telling",
    "Queue_Service",
    "Private_Chef",
    // Health
    "Beauty",
    "Massage",
    "Physiotherapy",
    "Personal_Trainer",
    "Pet_Care",
    "Caregiving",
    // Tech & Biz
    "IT_Support",
    "Web_Dev",
    "Graphic_Design",
    "Photography",
    "Videography",
    "Translation",
    "Accounting",
    "Legal",
    // Logistics
    "Driver",
    "Messenger",
    "Tutoring",
    "General",
  ];

  const COMPANION_SKILL_CATEGORIES = ["Party_Guest", "Dating", "Private_Chef"] as const;

  useEffect(() => {
    setFormData((prev) => {
      const ok = COMPANION_SKILL_CATEGORIES.includes(
        prev.category as (typeof COMPANION_SKILL_CATEGORIES)[number],
      );
      if (ok || !prev.partyCompanionSkill) return prev;
      return { ...prev, partyCompanionSkill: "" };
    });
  }, [formData.category]);

  // เพิ่ม useEffect สำหรับตรวจสอบ backend health:
  useEffect(() => {
    const checkBackendHealth = async () => {
      try {
        // ใช้ getBackendBase() เดียวกับ axios — หน้า HTTPS (เช่น app.aqond.com) จะไม่ยิง http:// IP ที่ถูกบล็อก (Mixed Content)
        const apiUrl = getBackendBase();
        const res = await fetch(`${apiUrl}/api/health`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });
        if (!res.ok) throw new Error(`health ${res.status}`);
        setBackendHealthy(true);
      } catch (error) {
        console.warn("Backend is not reachable");
        setBackendHealthy(false);
      }
    };

    checkBackendHealth();
  }, []);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const jobFee = Number(formData.price) || 500;
  const paymentMarkupPercent = feeEstimates?.fee_rates?.payment_markup_percent ?? 5;
  const paymentMarkupRate = paymentMarkupPercent / 100;
  const insuranceAmount = insurance ? Math.round(jobFee * (insuranceRatePercent / 100)) : 0;
  const baseAmount = jobFee + insuranceAmount;
  const serviceFee = Math.round(baseAmount * paymentMarkupRate * 100) / 100;
  const totalPayment = Math.round(baseAmount * (1 + paymentMarkupRate) * 100) / 100;

  const handleContinueToReview = async (e: React.FormEvent) => {
    e.preventDefault();
    const userId = user?.id || localStorage.getItem("meerak_user_id");
    if (!userId) {
      notify("กรุณาเข้าสู่ระบบก่อนสร้างงาน", "error");
      navigate("/login");
      return;
    }
    const requiredFields = ["title", "description", "category", "price"];
    for (const field of requiredFields) {
      if (!formData[field as keyof typeof formData]) {
        notify(`กรุณากรอกข้อมูล: ${field}`, "error");
        return;
      }
    }
    if (!jobAddress) {
      notify("กรุณาปักหมุดสถานที่ทำงาน", "error");
      return;
    }
    if (providerId) {
      try {
        const ok = await MockApi.checkAvailability(providerId, formData.datetime, Number(formData.duration_hours));
        if (!ok) {
          notify("Provider is busy at this time. Please select another slot.", "error");
          return;
        }
      } catch (_) {}
    }
    setStep(2);
  };

  const handleConfirmDeposit = async () => {
    setLoading(true);
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const userId = user?.id || localStorage.getItem("meerak_user_id");
      if (!userId) {
        notify("กรุณาเข้าสู่ระบบก่อนสร้างงาน", "error");
        navigate("/login");
        setLoading(false);
        return;
      }
      const requiredFields = ["title", "description", "category", "price"];
      for (const field of requiredFields) {
        if (!formData[field as keyof typeof formData]) {
          notify(`กรุณากรอกข้อมูล: ${field}`, "error");
          setLoading(false);
          return;
        }
      }
      if (!jobAddress) {
        notify("กรุณาปักหมุดสถานที่ทำงาน", "error");
        setLoading(false);
        return;
      }
      if (providerId) {
        try {
          const isAvailable = await MockApi.checkAvailability(
            providerId,
            formData.datetime,
            Number(formData.duration_hours),
          );
          if (!isAvailable) {
            notify("Provider is busy at this time. Please select another slot.", "error");
            setLoading(false);
            return;
          }
        } catch (_) {}
      }

      // 4. Format location data
      const locationData = {
        lat: jobAddress.lat,
        lng: jobAddress.lng,
        address: formatThaiAddress(jobAddress),
        fullAddress: formatThaiAddress(jobAddress) || jobAddress.fullAddress,
        // เพิ่มข้อมูลตำแหน่งแบบละเอียดถ้ามี
        province: jobAddress.province,
        district: jobAddress.district,
        subdistrict: (jobAddress as any).subdistrict,
        postal_code: (jobAddress as any).postalCode,
      };

      // 5. Prepare job data — ตรวจสอบ datetime ต้องเป็นอนาคต (งานโพสต์ใหม่ไม่ expired)
      let jobDatetime = new Date(formData.datetime);
      const now = new Date();
      const minFuture = new Date(now.getTime() + 30 * 60 * 1000); // อย่างน้อย 30 นาที ข้างหน้า
      if (isNaN(jobDatetime.getTime()) || jobDatetime <= minFuture) {
        jobDatetime = new Date(now.getTime() + 24 * 60 * 60 * 1000); // พรุ่งนี้
        jobDatetime.setHours(9, 0, 0, 0);
      }
      const descTrim = (formData.description || "").trim();
      const appendSomm = t("create.companion_skill_append_sommelier");
      const alreadyHasSomm =
        /sommelier/i.test(descTrim) || descTrim.includes("ความรู้เรื่องไวน์");
      const descriptionFinal =
        formData.partyCompanionSkill === "Sommelier" && !alreadyHasSomm
          ? `${descTrim}${appendSomm}`
          : formData.description;
      const descriptionWithProfile = [
        descriptionFinal.trim(),
        "",
        "Hiring Profile",
        `- จังหวัดงาน: ${formData.province || "ไม่ระบุ"}`,
        `- ลักษณะการจ้างงาน: ${getEmploymentTypeLabel(formData.employment_type)}`,
        "- ช่องทางลงงาน: Match Job",
      ]
        .join("\n")
        .trim();

      const jobPayload = {
        title: formData.title,
        description: descriptionWithProfile,
        category: formData.category,
        price: jobFee,
        duration_hours: Number(formData.duration_hours) || 2,
        datetime: jobDatetime.toISOString(),
        assigned_to: providerId || null, // ใช้ null แทน undefined
        location: locationData,
        // เพิ่มข้อมูลผู้สร้างงาน
        created_by: userId,
        // เพิ่ม field ที่จำเป็นอื่นๆ
        status: "open",
        tips_amount: 0,
        // เพิ่ม metadata สำหรับ tracking
        _submitted_at: new Date().toISOString(),
        _source: "web_app",
        _employment_type: formData.employment_type,
        _target_province: formData.province,
      };

      // 6. Create Job
      console.log("Submitting job:", jobPayload);

      const createdJob = await MockApi.createJob(jobPayload);

      console.log("Job created successfully:", createdJob);

      // 7. Show success message based on where job was saved
      let successMessage = t("create.success");

      if ((createdJob as any)._source === "firebase_fallback") {
        successMessage = "งานถูกสร้างสำเร็จ (บันทึกลงระบบสำรอง)";
        notify(successMessage, "warning");
      } else if ((createdJob as any)._source === "localstorage") {
        successMessage = "งานถูกสร้างสำเร็จ (บันทึกชั่วคราวในเบราว์เซอร์)";
        notify(successMessage, "warning");
      } else {
        notify(successMessage, "success");
      }

      // 8. Show success (step 3) or redirect
      if (createdJob.id && !createdJob.id.startsWith("temp_")) {
        try {
          sessionStorage.setItem("meerak_justCreatedJob", JSON.stringify(createdJob));
        } catch (_) {}
        setStep(3);
      } else {
        navigate("/jobs", {
          state: {
            showTempJobsNotice: true,
            tempJobId: createdJob.id,
          },
        });
      }
    } catch (error: any) {
      console.error("Job creation error:", error);

      // ดึงข้อความจาก backend ถ้ามี
      const backendError = error?.response?.data?.error;
      const errMsg = backendError || error.message;

      // Handle specific error cases
      if (error.message?.includes("Not logged in") || errMsg?.includes("เข้าสู่ระบบ")) {
        notify(errMsg || "กรุณาเข้าสู่ระบบก่อนสร้างงาน", "error");
        navigate("/login");
      } else if (error.message?.includes("Provider is not available")) {
        notify("ผู้ให้บริการไม่ว่างในช่วงเวลานี้", "error");
      } else if (error.message?.includes("Missing required field") || errMsg?.includes("Missing required")) {
        notify(errMsg || error.message, "error");
      } else if (errMsg?.includes("ไม่พบผู้ใช้")) {
        notify(errMsg, "error");
        navigate("/login");
      } else {
        notify(errMsg || "โพสต์งานไม่สำเร็จ กรุณาลองใหม่", "error");

        // Try to save to localStorage as last resort
        try {
          const tempJob = {
            ...formData,
            location: {
              lat: jobAddress?.lat,
              lng: jobAddress?.lng,
              address: jobAddress ? formatThaiAddress(jobAddress) : "",
            },
            id: `temp_${Date.now()}`,
            created_at: new Date().toISOString(),
            status: "draft",
          };

          const tempJobs = JSON.parse(
            localStorage.getItem("temp_jobs_drafts") || "[]",
          );
          tempJobs.push(tempJob);
          localStorage.setItem("temp_jobs_drafts", JSON.stringify(tempJobs));

          notify("งานถูกบันทึกเป็นฉบับร่างในเบราว์เซอร์", "info");
          navigate("/jobs", { state: { hasDrafts: true } });
        } catch (saveError) {
          console.error("Failed to save draft:", saveError);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Success
  if (step === 3) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 text-center py-12">
        <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-emerald-100 mb-6">
          <CheckCircle2 size={56} className="text-emerald-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">{t("booking.success_title")}</h2>
        <p className="text-gray-600">{t("booking.success_subtitle")}</p>
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-100 text-amber-800 font-medium mt-4">
          {t("booking.status_waiting")}
        </div>
        <div className="confetti-container relative py-8">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="confetti-piece"
              style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 2}s`,
                background: ["#e63946", "#0077b6", "#ffb703", "#f72585", "#10b981"][i % 5],
              }}
            />
          ))}
        </div>
        <Link
          to="/my-jobs"
          className="inline-block w-full max-w-md mx-auto py-4 rounded-2xl font-bold text-lg text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg"
        >
          {t("booking.go_to_my_jobs")}
        </Link>
      </div>
    );
  }

  // Step 2: Review & Payout
  if (step === 2) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-6">{t("booking.employer_summary")}</h2>
          <div className="space-y-3 mb-6">
            <div className="flex justify-between text-gray-600">
              <span>{t("booking.job_fee")}</span>
              <span className="font-mono">{jobFee} ฿</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>
                {t("booking.service_fee")} ({paymentMarkupPercent}%)
              </span>
              <span className="font-mono">+{serviceFee} ฿</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>
                {t("booking.insurance")} ({insuranceRatePercent}%){" "}
                <button type="button" onClick={() => setInsurance(!insurance)} className="text-emerald-600 font-medium">
                  {insurance ? t("booking.insurance_yes") : t("booking.insurance_no")}
                </button>
              </span>
              <span className="font-mono">{insuranceAmount} ฿</span>
            </div>
            <hr className="border-gray-200" />
            <div className="flex justify-between font-bold text-gray-900 text-lg">
              <span>{t("booking.total_payment")}</span>
              <span className="font-mono number-gold">{totalPayment} ฿</span>
            </div>
            {(formData.category === "Party_Guest" || fromPartyVibe) && (
              <details className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <summary className="text-sm font-medium text-slate-700 cursor-pointer hover:underline">
                  Breakdown — Talent ได้รับ (หลังหัก Sourcing + Commission)
                </summary>
                {(() => {
                  const tb = feeEstimates?.fee_rates
                    ? estimateMatchTalentBreakdown(jobFee, "none", feeEstimates.fee_rates)
                    : calcMatchJobTalentBreakdown(jobFee, undefined);
                  const srcPct = Number(
                    "sourcingPct" in tb ? tb.sourcingPct : 8,
                  );
                  const comPct = Number(
                    "commissionPct" in tb ? tb.commissionPct : 24,
                  );
                  return (
                    <div className="mt-3 space-y-1.5 text-sm text-slate-600">
                      <div className="flex justify-between">
                        <span>ค่าจ้าง (jobFee)</span>
                        <span className="font-mono">฿{jobFee.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>
                          Sourcing ({srcPct}%){" "}
                          <span className="text-slate-400">— ตัวอย่าง tier Non-VIP</span>
                        </span>
                        <span className="font-mono">-฿{tb.sourcingFee.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>
                          Commission ({comPct}%){" "}
                          <span className="text-slate-400">— ตัวอย่าง tier Non-VIP</span>
                        </span>
                        <span className="font-mono">-฿{tb.commission.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Tax (3%)</span>
                        <span className="font-mono">-฿{tb.taxService.toLocaleString()}</span>
                      </div>
                      <hr className="border-slate-200 my-1" />
                      <div className="flex justify-between font-semibold text-emerald-700">
                        <span>Talent ได้รับสุทธิ</span>
                        <span className="font-mono">฿{tb.talentNet.toLocaleString()}</span>
                      </div>
                      {feeEstimates?.help?.th ? (
                        <p className="text-[11px] text-slate-500 pt-1">{feeEstimates.help.th}</p>
                      ) : null}
                    </div>
                  );
                })()}
              </details>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex-1 py-3 rounded-xl border-2 border-gray-300 text-gray-700 font-semibold hover:bg-gray-50"
            >
              {t("booking.back")}
            </button>
            <button
              type="button"
              onClick={handleConfirmDeposit}
              disabled={loading}
              className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {loading ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  {t("booking.processing")}
                </>
              ) : (
                <>
                  <Wallet size={20} />
                  {t("booking.confirm_deposit")}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 1: Form — slide-in from bottom when coming from Party Vibe Picker
  return (
    <div
      className={`aqond-trust-theme max-w-2xl mx-auto space-y-6 ${fromPartyVibe ? "create-job-slide-up" : ""}`}
    >
      {/* AI Scan Result Banner */}
      {!providerId && (scanning || scanComplete) && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-6 animate-in fade-in slide-in-from-top-4">
          <div className="flex items-center mb-3">
            <div
              className={`p-2 rounded-lg mr-3 ${
                scanning
                  ? "bg-indigo-200 animate-pulse"
                  : "bg-indigo-200 text-indigo-700"
              }`}
            >
              <Sparkles size={24} />
            </div>
            <div>
              <h3 className="font-bold text-indigo-900">
                {t("create.ai_match")}
              </h3>
              <p className="text-sm text-indigo-700">
                {scanning
                  ? t("create.ai_desc")
                  : t("create.ai_found").replace(
                      "{count}",
                      matchedProviders.length.toString(),
                    )}
              </p>
              {/* แสดง warning ถ้า backend ไม่พร้อม */}
              {!backendHealthy && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-yellow-700 text-sm">
                    ⚠️ ระบบหลักกำลังมีปัญหา งานอาจถูกบันทึกลงระบบสำรอง
                  </p>
                </div>
              )}
            </div>
          </div>

          {scanComplete && matchedProviders.length > 0 && (
            <div className="flex -space-x-2 overflow-hidden mb-2 ml-2">
              {matchedProviders.slice(0, 5).map((m, i) => (
                <img
                  key={i}
                  src={m.user.avatar_url}
                  alt={m.user.name}
                  className="inline-block h-10 w-10 rounded-full ring-2 ring-white object-cover"
                  title={`${m.user.name} - ${m.distance.toFixed(1)}km`}
                />
              ))}
              <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 ring-2 ring-white">
                + ✅ พบผู้ให้บริการที่เหมาะสม {matchedProviders.length} คน
                ในรัศมี {matchedProviders[0]?.distance?.toFixed(1) || "5"} กม.
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            {t("create.title")}
          </h1>
          <p className="text-gray-500 mt-1">{t("create.subtitle")}</p>
          {providerName && (
            <div className="mt-4 bg-emerald-50 text-emerald-800 px-4 py-2 rounded-lg flex items-center text-sm font-medium border border-emerald-100">
              <User size={16} className="mr-2" />
              Assigning to: {providerName}
            </div>
          )}
        </div>

        <form onSubmit={handleContinueToReview} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("create.job_title")}
            </label>
            <input
              type="text"
              name="title"
              required
              placeholder="e.g., Dinner date at Siam Paragon"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500 transition-shadow"
              value={formData.title}
              onChange={handleChange}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <span className="flex items-center">
                  <Tag size={16} className="mr-1" /> {t("create.category")}
                </span>
              </label>
              <select
                name="category"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500 bg-white"
                value={formData.category}
                onChange={handleChange}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {t(`cat.${c}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <span className="flex items-center">
                  <DollarSign size={16} className="mr-1" /> {t("create.budget")}
                </span>
              </label>
              <input
                type="number"
                name="price"
                required
                placeholder="1500"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
                value={formData.price}
                onChange={handleChange}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                จังหวัดงาน
              </label>
              <select
                name="province"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500 bg-white"
                value={formData.province}
                onChange={handleChange}
              >
                {THAI_PROVINCES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ลักษณะการจ้างงาน
              </label>
              <select
                name="employment_type"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500 bg-white"
                value={formData.employment_type}
                onChange={handleChange}
              >
                {EMPLOYMENT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-3">
            <p className="text-xs font-bold text-emerald-900 uppercase tracking-wide">
              Match Job Guide
            </p>
            <div className="flex flex-wrap gap-2">
              {(matchBlueprint?.sampleHiringExamples || []).length > 0 ? (
                matchBlueprint?.sampleHiringExamples.map((sample) => (
                  <span
                    key={sample}
                    className="px-2.5 py-1 rounded-lg bg-white border border-emerald-200 text-xs text-emerald-900"
                  >
                    {sample}
                  </span>
                ))
              ) : (
                <span className="text-xs text-emerald-800">
                  ระบบจะใช้ flow มาตรฐานสำหรับงานหน้างานและงานด่วน
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-semibold text-emerald-900 mb-1">
                  ลำดับจ้างงาน (มือใหม่)
                </p>
                <ol className="text-xs text-emerald-900/90 list-decimal list-inside space-y-0.5">
                  {DEFAULT_HIRING_ORDER_NEWBIE.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              </div>
              <div>
                <p className="text-xs font-semibold text-emerald-900 mb-1">
                  ลำดับจ้างงาน (Senior)
                </p>
                <ol className="text-xs text-emerald-900/90 list-decimal list-inside space-y-0.5">
                  {DEFAULT_HIRING_ORDER_SENIOR.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              </div>
            </div>
            <div className="pt-1">
              <p className="text-xs font-semibold text-emerald-900 mb-1.5">
                Routing Matrix (Match Job)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {matchRoutingMatrix.map((item) => (
                  <span
                    key={item.profession}
                    className="rounded-md border border-emerald-200 bg-white px-2 py-0.5 text-[11px] text-emerald-900"
                  >
                    {item.profession}
                  </span>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate("/work-routing-matrix")}
              className="text-xs text-emerald-800 underline"
            >
              เปิด Routing Matrix แบบค้นหา
            </button>
          </div>
          {routingSuggestion && routingSuggestion.surface !== "match_job" && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs uppercase tracking-wide font-semibold text-amber-700">
                Auto Route แนะนำ
              </p>
              <p className="text-sm text-amber-900 mt-1">
                งานนี้อาจเหมาะกับ <b>{routingSuggestion.surface}</b> มากกว่า
                ({(routingSuggestion.confidence * 100).toFixed(0)}%)
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => navigate("/create-job-advance")}
                  className="px-3 py-1.5 rounded-lg border border-amber-300 bg-white text-amber-900 text-xs"
                >
                  ไป Job Board Form
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/video-feed")}
                  className="px-3 py-1.5 rounded-lg border border-amber-300 bg-white text-amber-900 text-xs"
                >
                  ไป Video Feed
                </button>
              </div>
            </div>
          )}

          {COMPANION_SKILL_CATEGORIES.includes(
            formData.category as (typeof COMPANION_SKILL_CATEGORIES)[number],
          ) && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("create.companion_skill")}
              </label>
              <select
                name="partyCompanionSkill"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500 bg-white"
                value={formData.partyCompanionSkill}
                onChange={handleChange}
              >
                <option value="">{t("create.companion_skill_none")}</option>
                <option value="Sommelier">{t("create.companion_skill_sommelier")}</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">{t("create.companion_skill_hint")}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <span className="flex items-center">
                  <Calendar size={16} className="mr-1" /> {t("create.date")}
                </span>
              </label>
              <input
                type="datetime-local"
                name="datetime"
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
                value={formData.datetime}
                onChange={handleChange}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <span className="flex items-center">
                  <Clock size={16} className="mr-1" /> Duration (Hours)
                </span>
              </label>
              <input
                type="number"
                name="duration_hours"
                required
                min="1"
                max="24"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
                value={formData.duration_hours}
                onChange={handleChange}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("create.desc")}
            </label>
            <textarea
              name="description"
              rows={4}
              required
              placeholder="Provide details about the task..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
              value={formData.description}
              onChange={handleChange}
            />
          </div>

          <div className="p-4 bg-emerald-50 rounded-lg flex items-start border border-emerald-100">
            <MapPin
              className="text-emerald-600 mt-1 mr-3 flex-shrink-0"
              size={20}
            />
            <div>
              <h4 className="text-sm font-medium text-emerald-900">
                {t("create.loc")}
              </h4>
              <p className="text-sm text-emerald-700 mt-1">
                {t("create.loc_desc")}
              </p>
              <EmployerMap
                height="300px"
                showControls={false}
                enablePick={true}
                onPickLocation={async (location) => {
                  if (!location || location.lat == null || location.lng == null) {
                    setJobAddress(null);
                    return;
                  }
                  setJobAddress({
                    lat: location.lat,
                    lng: location.lng,
                    fullAddress: "กำลังดึงที่อยู่...",
                  });

                  try {
                    const address = await reverseGeocodeOSM(
                      location.lat,
                      location.lng,
                    );
                    if (address?.province) {
                      setFormData((prev) => ({
                        ...prev,
                        province: String(address.province),
                      }));
                    }
                    setJobAddress((prev) => ({
                      ...prev,
                      ...address,
                      fullAddress:
                        formatThaiAddress(address) || address.fullAddress,
                    }));
                  } catch {
                    setJobAddress({
                      lat: location.lat,
                      lng: location.lng,
                      fullAddress: "ไม่สามารถดึงที่อยู่ได้",
                    });
                  }
                }}
              />

              {jobAddress && (
                <div className="mt-3 text-sm text-gray-700">
                  📍 <strong>สถานที่ทำงาน:</strong>
                  {jobAddress.fullAddress || formatThaiAddress(jobAddress)}
                </div>
              )}
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-colors flex items-center justify-center"
          >
            {t("booking.continue_to_review")}
            {scanComplete && (
              <span className="ml-2 bg-white/20 px-2 py-0.5 rounded-full text-xs">
                AI Optimized
              </span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
