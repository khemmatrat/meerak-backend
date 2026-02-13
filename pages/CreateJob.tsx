import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MockApi } from "../services/mockApi";
import {
  MapPin,
  DollarSign,
  Calendar,
  Tag,
  User,
  Sparkles,
  CheckCircle,
  Clock,
} from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import { useNotification } from "../context/NotificationContext";
import { useAuth } from "../context/AuthContext";
import { UserProfile, JobLocation } from "../types";
import EmployerMap from "../components/EmployerMap";
import {
  reverseGeocodeOSM,
  formatThaiAddress,
  ThaiAddress,
} from "../context/reverseGeocodeOSM";

export const CreateJob: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useLanguage();
  const { notify } = useNotification();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  // AI Matching State
  const [scanning, setScanning] = useState(false);
  const [matchedProviders, setMatchedProviders] = useState<
    { user: UserProfile; score: number; distance: number }[]
  >([]);
  const [scanComplete, setScanComplete] = useState(false);
  const providerId = searchParams.get("providerId");
  const providerName = searchParams.get("providerName");
  const [jobAddress, setJobAddress] = useState<JobLocation | null>(null);
  const [backendHealthy, setBackendHealthy] = useState(true);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: providerId ? "Dating" : "Cleaning",
    price: "",
    datetime: "",
    duration_hours: 2, // Default duration
  });

  useEffect(() => {
    if (providerId && providerName) {
      setFormData((prev) => ({
        ...prev,
        title: `${t("create.direct_hire")} ${providerName}`,
        description: `Hi ${providerName}, I would like to hire you for...`,
      }));
    }
  }, [providerId, providerName, t]);

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
  // เพิ่ม useEffect สำหรับตรวจสอบ backend health:
  useEffect(() => {
    const checkBackendHealth = async () => {
      try {
        // ตรวจสอบว่า backend พร้อมใช้งานหรือไม่
        const apiUrl = import.meta.env.REACT_APP_API_BASE_URL || import.meta.env.VITE_API_URL || "https://meerak-backend.onrender.com";
        await fetch(`${apiUrl}/api/health`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 0. ใช้ user.id จาก Auth ให้ตรงกับ MyJobs (ไม่ใช้แค่ localStorage)
      const userId = user?.id || localStorage.getItem("meerak_user_id");
      if (!userId) {
        notify("กรุณาเข้าสู่ระบบก่อนสร้างงาน", "error");
        navigate("/login");
        setLoading(false);
        return;
      }

      // 1. Validate required fields
      const requiredFields = ["title", "description", "category", "price"];
      for (const field of requiredFields) {
        if (!formData[field as keyof typeof formData]) {
          notify(`กรุณากรอกข้อมูล: ${field}`, "error");
          setLoading(false);
          return;
        }
      }

      // 2. Validate location
      if (!jobAddress) {
        notify("กรุณาปักหมุดสถานที่ทำงาน", "error");
        setLoading(false);
        return;
      }

      // 3. Check Availability if Direct Hire
      if (providerId) {
        try {
          const isAvailable = await MockApi.checkAvailability(
            providerId,
            formData.datetime,
            Number(formData.duration_hours),
          );

          if (!isAvailable) {
            notify(
              "Provider is busy at this time. Please select another slot.",
              "error",
            );
            setLoading(false);
            return;
          }
        } catch (error) {
          console.warn("Availability check failed:", error);
          // สามารถข้ามไปได้ถ้า check availability ล้มเหลว
        }
      }

      // 4. Format location data
      const locationData = {
        lat: jobAddress.lat,
        lng: jobAddress.lng,
        address: formatThaiAddress(jobAddress),
        // เพิ่มข้อมูลตำแหน่งแบบละเอียดถ้ามี
        province: jobAddress.province,
        district: jobAddress.district,
        subdistrict: jobAddress.subdistrict,
        postal_code: jobAddress.postalCode,
      };

      // 5. Prepare job data
      const jobPayload = {
        title: formData.title,
        description: formData.description,
        category: formData.category,
        price: Number(formData.price),
        duration_hours: Number(formData.duration_hours) || 2,
        datetime: new Date(formData.datetime).toISOString(),
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
      };

      // 6. Create Job
      console.log("Submitting job:", jobPayload);

      const createdJob = await MockApi.createJob(jobPayload);

      console.log("Job created successfully:", createdJob);

      // 7. Show success message based on where job was saved
      let successMessage = t("create.success");

      if (createdJob._source === "firebase_fallback") {
        successMessage = "งานถูกสร้างสำเร็จ (บันทึกลงระบบสำรอง)";
        notify(successMessage, "warning");
      } else if (createdJob._source === "localstorage") {
        successMessage = "งานถูกสร้างสำเร็จ (บันทึกชั่วคราวในเบราว์เซอร์)";
        notify(successMessage, "warning");
      } else {
        notify(successMessage, "success");
      }

      // 8. Redirect based on job source
      if (createdJob.id && !createdJob.id.startsWith("temp_")) {
        navigate(`/jobs/${createdJob.id}`);
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

      // Handle specific error cases
      if (error.message.includes("Not logged in")) {
        notify("กรุณาเข้าสู่ระบบก่อนสร้างงาน", "error");
        navigate("/login");
      } else if (error.message.includes("Provider is not available")) {
        notify("ผู้ให้บริการไม่ว่างในช่วงเวลานี้", "error");
      } else if (error.message.includes("Missing required field")) {
        notify(error.message, "error");
      } else {
        // Generic error
        notify("Failed to create job. Please try again.", "error");

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

  return (
    <div className="max-w-2xl mx-auto space-y-6">
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

        <form onSubmit={handleSubmit} className="space-y-6">
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
            disabled={loading}
            className="w-full py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-colors disabled:opacity-50 flex items-center justify-center"
          >
            {loading ? t("create.submitting") : t("create.submit")}
            {!loading && scanComplete && (
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
