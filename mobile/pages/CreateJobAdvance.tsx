import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { useMobileAppConfig } from "../context/MobileAppConfigContext";
import { resolveJobBoardCopy } from "../utils/jobBoardCopy";
import {
  FileText,
  Target,
  DollarSign,
  ChevronRight,
  ChevronLeft,
  Check,
  Bookmark,
  BookOpen,
} from "lucide-react";
import { createAdvanceJob, getAdvanceJobTemplates, saveAdvanceJobTemplate, JobServiceError } from "../services/jobService";
import {
  EMPLOYMENT_TYPE_OPTIONS,
  JOBBOARD_CATEGORY_GROUPS,
  JOBBOARD_MAIN_CATEGORIES,
  THAI_PROVINCES,
  getEmploymentTypeLabel,
  getJobboardCategoryLabel,
  getJobboardGroupLabel,
  suggestRoutingByKeywords,
} from "../constants/workTaxonomy";

const STEPS = [
  { id: 1, label: "รายละเอียดงาน", icon: FileText },
  { id: 2, label: "ขอบเขตงาน", icon: Target },
  { id: 3, label: "งบประมาณ", icon: DollarSign },
];

export const CreateJobAdvance: React.FC = () => {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const { notify } = useNotification();
  const { config } = useMobileAppConfig();
  const jobBoardCopy = resolveJobBoardCopy(config.remote);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    title: "",
    category: JOBBOARD_MAIN_CATEGORIES[0],
    description: "",
    scope: "",
    budget_min: "",
    budget_max: "",
    duration_days: "7",
    province: "กรุงเทพมหานคร",
    employment_type: "project",
  });
  const [submitting, setSubmitting] = useState(false);
  const [postSuccess, setPostSuccess] = useState<{ jobId: string } | null>(null);
  const navTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; category: string; description: string; scope: string; min_budget: number; max_budget: number; duration_days: number }>>([]);
  const [savingTemplate, setSavingTemplate] = useState(false);

  useEffect(() => {
    if (token) getAdvanceJobTemplates(token).then(setTemplates);
  }, [token]);

  useEffect(() => {
    return () => {
      if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
    };
  }, []);

  const applyTemplate = (t: { category: string; description: string; scope: string; min_budget: number; max_budget: number; duration_days: number }) => {
    setForm((prev) => ({
      ...prev,
      title: prev.title || "",
      category: t.category,
      description: t.description,
      scope: t.scope,
      budget_min: String(t.min_budget || ""),
      budget_max: String(t.max_budget || ""),
      duration_days: String(t.duration_days || 7),
    }));
  };

  const update = (key: string, value: string | number) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const canNext1 =
    form.title.trim().length > 0 &&
    form.description.trim().length > 0;
  const canNext2 = form.scope.trim().length > 0;
  const minB = Number(form.budget_min) || 0;
  const maxB = Number(form.budget_max) || 0;
  const canNext3 = minB > 0 && maxB >= minB && Number(form.duration_days) > 0;
  const routingSuggestion = useMemo(
    () =>
      suggestRoutingByKeywords(
        [form.title, form.description, form.scope, form.category].join(" "),
        {
          verticalWeightOverrides: config.remote.routingWeightOverrides || null,
        },
      ),
    [
      form.title,
      form.description,
      form.scope,
      form.category,
      config.remote.routingWeightOverrides,
    ],
  );

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSubmit = async () => {
    if (!user || !canNext1 || !canNext2 || !canNext3) return;
    setSubmitting(true);
    try {
      const scopeWithHiringProfile = [
        "Hiring Profile",
        `- จังหวัดเป้าหมาย: ${form.province || "ไม่ระบุ"}`,
        `- ลักษณะการจ้างงาน: ${getEmploymentTypeLabel(form.employment_type)}`,
        "- ช่องทางลงงาน: Job Board",
        "",
        form.scope.trim(),
      ]
        .join("\n")
        .trim();
      const job = await createAdvanceJob(
        {
          title: form.title.trim(),
          category: form.category,
          description: form.description.trim(),
          scope: scopeWithHiringProfile,
          min_budget: minB,
          max_budget: maxB,
          duration_days: Number(form.duration_days),
          target_province: form.province,
          employment_type: form.employment_type,
          work_surface: "jobboard",
          status: "open",
        },
        token,
        user.name || "ผู้จ้าง",
        user.id || user.phone || undefined
      );
      if (!job || !job.id) {
        setSubmitting(false);
        notify("โพสต์งานสำเร็จ แต่ไม่ได้รับข้อมูลงาน — ไปที่รายการงานของฉัน", "success");
        navigate("/my-advance-jobs");
        return;
      }
      notify("โพสต์งานสำเร็จ งานของคุณจะแสดงใน Job Board", "success");
      setPostSuccess({ jobId: String(job.id) });
      setSubmitting(false);
      const jobId = String(job.id);
      navTimeoutRef.current = setTimeout(() => {
        navTimeoutRef.current = null;
        navigate(`/job-board/${jobId}/manage`);
      }, 1200);
    } catch (e) {
      const message = e instanceof JobServiceError ? e.message : "โพสต์งานไม่สำเร็จ กรุณาลองใหม่";
      notify(message, "error");
      setSubmitting(false);
    }
  };

  if (postSuccess) {
    return (
      <div className="luxury-card rounded-2xl p-12 text-center space-y-6">
        <div className="w-20 h-20 mx-auto rounded-full bg-emerald-500/20 flex items-center justify-center">
          <Check size={40} className="text-emerald-400" />
        </div>
        <h2 className="text-xl font-bold text-slate-100">โพสต์งานสำเร็จ!</h2>
        <p className="text-slate-400">กำลังนำคุณไปหน้าจัดการงาน...</p>
        <div className="inline-block w-8 h-8 border-2 border-amber-400/50 border-t-amber-400 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="aqond-trust-theme space-y-8 pb-8">
      <h1 className="text-2xl font-bold text-slate-50">โพสต์งานแบบ Advance</h1>

      {/* Step indicator */}
      <div className="flex items-center justify-between gap-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const active = step === s.id;
          const done = step > s.id;
          return (
            <React.Fragment key={s.id}>
              <button
                type="button"
                onClick={() => setStep(s.id)}
                className={`flex items-center gap-2 px-4 py-3 rounded-2xl border transition-colors ${
                  active
                    ? "luxury-card border-gold/30 bg-white/5"
                    : done
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : "border-slate-600/50 text-slate-500"
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                    done ? "bg-emerald-500/30" : active ? "bg-gold/20" : "bg-slate-700/50"
                  }`}
                >
                  {done ? <Check size={16} className="text-emerald-400" /> : <Icon size={16} className={active ? "text-amber-300" : ""} />}
                </div>
                <span className="text-sm font-medium hidden sm:inline">{s.label}</span>
              </button>
              {i < STEPS.length - 1 && (
                <ChevronRight className="w-5 h-5 text-slate-500 flex-shrink-0" />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Step 1: รายละเอียดงาน */}
      {step === 1 && (
        <div className="luxury-card rounded-2xl p-6 sm:p-8 space-y-6">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <FileText size={20} className="text-amber-400" />
            รายละเอียดงาน
          </h2>
          {templates.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">สร้างจาก Template</label>
              <select
                onChange={(e) => {
                  const id = e.target.value;
                  if (id) {
                    const t = templates.find((x) => x.id === id);
                    if (t) applyTemplate(t);
                    e.target.value = "";
                  }
                }}
                className="w-full px-4 py-3 rounded-xl bg-charcoal-800 border border-slate-600 text-slate-100 focus:ring-2 focus:ring-gold/30 outline-none"
              >
                <option value="">— เลือก Template (ถ้าต้องการ) —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({getJobboardCategoryLabel(t.category)})
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">หัวข้องาน *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="เช่น ต้องการดีไซน์โลโก้บริษัท"
              className="w-full px-4 py-3 rounded-xl bg-charcoal-800 border border-slate-600 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-gold/30 focus:border-gold/50 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">หมวดหมู่</label>
            <select
              value={form.category}
              onChange={(e) => update("category", e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-charcoal-800 border border-slate-600 text-slate-100 focus:ring-2 focus:ring-gold/30 outline-none"
            >
              {JOBBOARD_CATEGORY_GROUPS.map((g) => (
                <optgroup key={g.group} label={getJobboardGroupLabel(g.group)}>
                  {g.categories.map((c) => (
                    <option key={c} value={c}>
                      {getJobboardCategoryLabel(c)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          {routingSuggestion && routingSuggestion.surface !== "jobboard" && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
              <p className="text-xs font-semibold text-amber-300 uppercase tracking-wide">
                Auto Route แนะนำ
              </p>
              <p className="text-sm text-slate-200 mt-1">
                คำค้นนี้เหมาะกับ <b>{routingSuggestion.surface}</b> มากกว่า
                Job Board ({(routingSuggestion.confidence * 100).toFixed(0)}%)
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => navigate("/create-job")}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 text-xs"
                >
                  ไปหน้า Match Job
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/video-feed")}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 text-xs"
                >
                  ไป Video Feed
                </button>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                จังหวัดเป้าหมาย
              </label>
              <select
                value={form.province}
                onChange={(e) => update("province", e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-charcoal-800 border border-slate-600 text-slate-100 focus:ring-2 focus:ring-gold/30 outline-none"
              >
                {THAI_PROVINCES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                ลักษณะการจ้างงาน
              </label>
              <select
                value={form.employment_type}
                onChange={(e) => update("employment_type", e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-charcoal-800 border border-slate-600 text-slate-100 focus:ring-2 focus:ring-gold/30 outline-none"
              >
                {EMPLOYMENT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <BookOpen size={20} className="text-blue-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-slate-100">ดูคู่มือจ้างงาน</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Routing Matrix, ตัวอย่างงาน และลำดับการจ้าง — เปิดเมื่อต้องการ
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate("/work-routing-matrix")}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 shrink-0"
            >
              เปิดคู่มือ
            </button>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">คำบรรยายงาน *</label>
            <textarea
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder={jobBoardCopy.createJobDescPlaceholder}
              rows={5}
              className="w-full px-4 py-3 rounded-xl bg-charcoal-800 border border-slate-600 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-gold/30 focus:border-gold/50 outline-none resize-none"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleNext}
              disabled={!canNext1}
              className="btn-gold-black px-6 py-2.5 rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              ถัดไป <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: ขอบเขต */}
      {step === 2 && (
        <div className="luxury-card rounded-2xl p-6 sm:p-8 space-y-6">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Target size={20} className="text-amber-400" />
            ขอบเขตงาน
          </h2>
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">ขอบเขตและสิ่งที่ต้องส่งมอบ *</label>
            <textarea
              value={form.scope}
              onChange={(e) => update("scope", e.target.value)}
              placeholder="ระบุรายการส่งมอบ จำนวนรีวิว ไฟล์ที่ต้องการ ฯลฯ"
              rows={6}
              className="w-full px-4 py-3 rounded-xl bg-charcoal-800 border border-slate-600 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-gold/30 focus:border-gold/50 outline-none resize-none"
            />
          </div>
          <div className="flex justify-between">
            <button
              type="button"
              onClick={handleBack}
              className="px-5 py-2.5 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-700/50 inline-flex items-center gap-2"
            >
              <ChevronLeft size={18} /> ย้อนกลับ
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={!canNext2}
              className="btn-gold-black px-6 py-2.5 rounded-xl font-medium disabled:opacity-50 inline-flex items-center gap-2"
            >
              ถัดไป <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: งบประมาณ */}
      {step === 3 && (
        <div className="luxury-card rounded-2xl p-6 sm:p-8 space-y-6">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <DollarSign size={20} className="text-amber-400" />
            งบประมาณและระยะเวลา
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">งบขั้นต่ำ (บาท) *</label>
              <input
                type="number"
                min={0}
                value={form.budget_min}
                onChange={(e) => update("budget_min", e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-charcoal-800 border border-slate-600 text-slate-100 focus:ring-2 focus:ring-gold/30 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">งบสูงสุด (บาท) *</label>
              <input
                type="number"
                min={0}
                value={form.budget_max}
                onChange={(e) => update("budget_max", e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-charcoal-800 border border-slate-600 text-slate-100 focus:ring-2 focus:ring-gold/30 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">ระยะเวลาทำงาน (วัน) *</label>
            <input
              type="number"
              min={1}
              value={form.duration_days}
              onChange={(e) => update("duration_days", e.target.value)}
              className="w-full sm:w-40 px-4 py-3 rounded-xl bg-charcoal-800 border border-slate-600 text-slate-100 focus:ring-2 focus:ring-gold/30 outline-none"
            />
          </div>
          <div className="flex flex-wrap justify-between gap-3 pt-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleBack}
                className="px-5 py-2.5 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-700/50 inline-flex items-center gap-2"
              >
                <ChevronLeft size={18} /> ย้อนกลับ
              </button>
              {canNext3 && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!token || !form.title.trim()) return;
                    setSavingTemplate(true);
                    try {
                      const t = await saveAdvanceJobTemplate(
                        {
                          name: form.title.trim(),
                          category: form.category,
                          description: form.description,
                          scope: form.scope,
                          min_budget: minB,
                          max_budget: maxB,
                          duration_days: Number(form.duration_days),
                        },
                        token
                      );
                      if (t) {
                        notify("บันทึก Template แล้ว ใช้ได้ในครั้งถัดไป", "success");
                        setTemplates((prev) => [...prev, { id: t.id, name: form.title, category: form.category, description: form.description, scope: form.scope, min_budget: minB, max_budget: maxB, duration_days: Number(form.duration_days) }]);
                      }
                    } catch (_) {
                      notify("บันทึก Template ไม่สำเร็จ", "error");
                    } finally {
                      setSavingTemplate(false);
                    }
                  }}
                  disabled={savingTemplate}
                  className="px-4 py-2.5 rounded-xl border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 inline-flex items-center gap-2"
                >
                  <Bookmark size={16} /> บันทึกเป็น Template
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canNext3 || submitting}
              className="btn-gold-black px-6 py-2.5 rounded-xl font-medium disabled:opacity-50 inline-flex items-center gap-2"
            >
              {submitting ? "กำลังโพสต์..." : "โพสต์งาน"} <Check size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
