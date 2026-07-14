import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  EyeOff,
  ImagePlus,
  Plus,
  Send,
  Trash2,
  Upload,
  WalletCards,
  XCircle,
} from "lucide-react";
import {
  createCourseLesson,
  createCourseSection,
  createStudioCourse,
  createStudioCourseQuestion,
  deleteCourseLesson,
  deleteStudioCourseQuestion,
  getCourseStudioWizard,
  getInstructorEarnings,
  type InstructorCourseEarnings,
  listStudioCourses,
  submitStudioCourse,
  unlistStudioCourse,
  updateInstructorProfile,
  updateStudioCourse,
  uploadCourseImage,
  uploadCourseVideo,
  type CourseQualityChecklist,
  type CourseQuizQuestion,
  type CourseRevenueProjection,
  type CourseStudioWizard,
  type MarketplaceCourse,
} from "../services/courseMarketplaceService";
import { useNotification } from "../context/NotificationContext";
import CourseFlowHeader from "../components/courseMarketplace/CourseFlowHeader";
import CourseMarketplaceCard from "../components/courseMarketplace/CourseMarketplaceCard";

const WIZARD_STEPS = [
  { id: 1, label: "ข้อมูลคอร์ส", short: "ข้อมูล" },
  { id: 2, label: "บทเรียน", short: "บทเรียน" },
  { id: 3, label: "ราคา", short: "ราคา" },
  { id: 4, label: "Preview", short: "Preview" },
  { id: 5, label: "ส่งตรวจ", short: "ส่งตรวจ" },
] as const;

function WizardStepProgress({
  step,
  onStep,
}: {
  step: number;
  onStep: (id: (typeof WIZARD_STEPS)[number]["id"]) => void;
}) {
  const current = WIZARD_STEPS.find((s) => s.id === step);
  return (
    <div className="course-studio-step-progress space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-slate-800">
          ขั้นที่ {step}/5 · {current?.label}
        </p>
        <p className="text-xs text-slate-500 shrink-0">{Math.round((step / 5) * 100)}%</p>
      </div>
      <div className="flex gap-1.5" role="tablist" aria-label="ขั้นตอน wizard">
        {WIZARD_STEPS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={step === s.id}
            aria-label={`${s.id}. ${s.label}`}
            onClick={() => onStep(s.id)}
            className={`course-studio-step-seg ${s.id < step ? "is-done" : ""} ${s.id === step ? "is-active" : ""}`}
          />
        ))}
      </div>
      <div className="grid grid-cols-5 gap-1 md:hidden">
        {WIZARD_STEPS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onStep(s.id)}
            className={`rounded-lg py-1.5 text-[10px] leading-tight font-semibold text-center ${
              step === s.id ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            {s.short}
          </button>
        ))}
      </div>
      <div className="hidden md:flex gap-2 overflow-x-auto pb-0.5">
        {WIZARD_STEPS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onStep(s.id)}
            className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap font-semibold ${
              step === s.id ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            {s.id}. {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function WizardActionBar({
  step,
  saving,
  onBack,
  onSave,
  onNext,
}: {
  step: number;
  saving: boolean;
  onBack: () => void;
  onSave: () => void;
  onNext: () => void;
}) {
  return (
    <div className="course-studio-wizard-bar">
      <div className="max-w-3xl mx-auto grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={step === 1 || saving}
          className="inline-flex items-center justify-center gap-1 px-3 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm disabled:opacity-40"
        >
          <ChevronLeft size={16} /> ก่อนหน้า
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="px-3 py-2.5 rounded-xl bg-slate-200 text-slate-800 font-bold text-sm disabled:opacity-60"
        >
          {saving ? "..." : "บันทึก"}
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={step === 5 || saving}
          className="inline-flex items-center justify-center gap-1 px-3 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-sm disabled:opacity-40"
        >
          ถัดไป <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

const initialForm = {
  title: "",
  subtitle: "",
  description: "",
  category: "business",
  level: "beginner",
  language: "th",
  duration: 60,
  priceThb: 499,
  originalPriceThb: 1290,
  imageUrl: "",
  promoVideoUrl: "",
  learningOutcomesText: "",
  requirementsText: "",
  instructorHeadline: "",
  instructorBio: "",
  sequentialUnlock: false,
};

function linesToList(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function listToLines(items?: string[]) {
  return (items || []).join("\n");
}

function ChecklistPanel({ checklist }: { checklist: CourseQualityChecklist | null }) {
  if (!checklist) return null;
  return (
    <div className="rounded-2xl border border-slate-700 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-100">Quality Checklist</h3>
        <span className={`text-sm font-bold ${checklist.ready ? "text-emerald-300" : "text-amber-300"}`}>
          {checklist.score}%
        </span>
      </div>
      <div className="space-y-2">
        {checklist.items.map((item) => (
          <div key={item.id} className="flex items-start gap-2 text-sm">
            {item.ok ? (
              <CheckCircle2 size={16} className="text-emerald-300 shrink-0 mt-0.5" />
            ) : (
              <XCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
            )}
            <span className={item.ok ? "text-slate-300" : "text-slate-400"}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CourseStudio() {
  const { notify } = useNotification();
  const [courses, setCourses] = useState<MarketplaceCourse[]>([]);
  const [selected, setSelected] = useState<MarketplaceCourse | null>(null);
  const [wizard, setWizard] = useState<CourseStudioWizard | null>(null);
  const [form, setForm] = useState(initialForm);
  const [step, setStep] = useState(1);
  const [sectionTitle, setSectionTitle] = useState("บทนำ");
  const [previewLessonTitle, setPreviewLessonTitle] = useState("บทเรียนตัวอย่าง");
  const [previewLessonVideoUrl, setPreviewLessonVideoUrl] = useState("");
  const [paidLessonTitle, setPaidLessonTitle] = useState("บทเรียนหลัก");
  const [paidLessonVideoUrl, setPaidLessonVideoUrl] = useState("");
  const [earnings, setEarnings] = useState<InstructorCourseEarnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingThumb, setUploadingThumb] = useState(false);
  const [uploadingPromo, setUploadingPromo] = useState(false);
  const [quizQuestionText, setQuizQuestionText] = useState("");
  const [quizOptionA, setQuizOptionA] = useState("");
  const [quizOptionB, setQuizOptionB] = useState("");
  const [quizOptionC, setQuizOptionC] = useState("");
  const [quizOptionD, setQuizOptionD] = useState("");
  const [quizCorrect, setQuizCorrect] = useState("A");
  const [questions, setQuestions] = useState<CourseQuizQuestion[]>([]);

  const isPublished = selected?.status === "published";
  const isEditable = selected && !isPublished;

  const refreshList = useCallback(async () => {
    const [studio, earn] = await Promise.all([
      listStudioCourses(),
      getInstructorEarnings().catch(() => null),
    ]);
    setCourses(studio);
    setEarnings(earn);
    return studio;
  }, []);

  const loadWizard = useCallback(async (courseId: string) => {
    const data = await getCourseStudioWizard(courseId);
    setWizard(data);
    setSelected(data.course);
    setQuestions(data.questions || []);
    setForm({
      title: data.course.title || "",
      subtitle: data.course.subtitle || "",
      description: data.course.description || "",
      category: data.course.category || "business",
      level: data.course.level || "beginner",
      language: data.course.language || "th",
      duration: Number(data.course.duration || data.checklist?.stats?.duration || 60),
      priceThb: Number(data.course.priceThb || 0),
      originalPriceThb: Number(data.course.originalPriceThb || 0),
      imageUrl: data.course.imageUrl || "",
      promoVideoUrl: data.course.promoVideoUrl || "",
      learningOutcomesText: listToLines(data.course.learningOutcomes),
      requirementsText: listToLines(data.course.requirements),
      instructorHeadline: data.instructorProfile?.headline || "",
      instructorBio: data.instructorProfile?.bio || "",
      sequentialUnlock: !!data.course.sequentialUnlock,
    });
    return data;
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        await refreshList();
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [refreshList]);

  useEffect(() => {
    if (!selected) return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step, selected?.id]);

  const previewCourse = useMemo(
    () => ({
      ...selected,
      title: form.title,
      subtitle: form.subtitle,
      description: form.description,
      imageUrl: form.imageUrl,
      priceThb: form.priceThb,
      originalPriceThb: form.originalPriceThb,
      level: form.level,
    }),
    [selected, form],
  );

  const handleCreate = async () => {
    const draftTitle =
      form.title.trim() ||
      `คอร์สใหม่ ${new Date().toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}`;
    try {
      setSaving(true);
      const course = await createStudioCourse({
        title: draftTitle,
        subtitle: form.subtitle,
        description: form.description,
        category: form.category,
        level: form.level,
        language: form.language,
        duration: form.duration,
        priceThb: form.priceThb,
        originalPriceThb: form.originalPriceThb,
        imageUrl: form.imageUrl,
        promoVideoUrl: form.promoVideoUrl,
        learningOutcomes: linesToList(form.learningOutcomesText),
        requirements: linesToList(form.requirementsText),
      });
      await refreshList();
      await loadWizard(course.id);
      setStep(1);
      notify("สร้าง draft คอร์สแล้ว เริ่ม wizard ได้เลย", "success");
    } catch (e: any) {
      const msg =
        e?.response?.data?.error ||
        (e?.response?.status === 403
          ? "ต้องเป็น Verified Provider หรือผ่าน KYC ก่อนขายคอร์ส"
          : "สร้างคอร์สไม่สำเร็จ");
      notify(msg, e?.response?.status === 403 ? "warning" : "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSelectCourse = async (course: MarketplaceCourse) => {
    try {
      setSaving(true);
      await loadWizard(course.id);
      setStep(1);
    } catch {
      notify("โหลดคอร์สไม่สำเร็จ", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!selected) return;
    try {
      setSaving(true);
      await updateInstructorProfile({
        headline: form.instructorHeadline,
        bio: form.instructorBio,
      });
      await updateStudioCourse(selected.id, {
        title: form.title,
        subtitle: form.subtitle,
        description: form.description,
        category: form.category,
        level: form.level,
        language: form.language,
        duration: form.duration,
        priceThb: form.priceThb,
        originalPriceThb: form.originalPriceThb,
        imageUrl: form.imageUrl,
        promoVideoUrl: form.promoVideoUrl,
        learningOutcomes: linesToList(form.learningOutcomesText),
        requirements: linesToList(form.requirementsText),
        sequentialUnlock: form.sequentialUnlock,
      });
      await refreshList();
      await loadWizard(selected.id);
      notify("บันทึก draft แล้ว", "success");
    } catch {
      notify("บันทึกไม่สำเร็จ", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleUnlist = async () => {
    if (!selected || selected.status !== "published") return;
    if (!window.confirm("ถอดคอร์สจากการขายชั่วคราว? ผู้ซื้อเดิมยังเรียนได้")) return;
    try {
      setSaving(true);
      const course = await unlistStudioCourse(selected.id);
      setSelected(course);
      await refreshList();
      await loadWizard(course.id);
      notify("ถอดจากขายแล้ว — แก้ไขบทเรียนได้อีกครั้ง", "success");
    } catch {
      notify("ถอดจากขายไม่สำเร็จ", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLesson = async (lessonId: string) => {
    if (!selected) return;
    try {
      setSaving(true);
      await deleteCourseLesson(selected.id, lessonId);
      await loadWizard(selected.id);
      notify("ลบบทเรียนแล้ว", "success");
    } catch {
      notify("ลบบทเรียนไม่สำเร็จ — ถอดจากขายก่อนถ้าคอร์ส published", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleAddQuizQuestion = async () => {
    if (!selected) return;
    const text = quizQuestionText.trim();
    const options = [
      { id: "A", text: quizOptionA.trim() },
      { id: "B", text: quizOptionB.trim() },
      { id: "C", text: quizOptionC.trim() },
      { id: "D", text: quizOptionD.trim() },
    ].filter((o) => o.text);
    if (!text || options.length < 2) {
      notify("กรอกคำถามและตัวเลือกอย่างน้อย 2 ข้อ", "warning");
      return;
    }
    if (!options.some((o) => o.id === quizCorrect)) {
      notify("เลือกคำตอบที่ถูกให้ตรงกับตัวเลือกที่มี", "warning");
      return;
    }
    try {
      setSaving(true);
      const q = await createStudioCourseQuestion(selected.id, {
        questionText: text,
        options,
        correctOptionId: quizCorrect,
      });
      setQuestions((prev) => [...prev, q]);
      setQuizQuestionText("");
      setQuizOptionA("");
      setQuizOptionB("");
      setQuizOptionC("");
      setQuizOptionD("");
      await loadWizard(selected.id);
      notify("เพิ่มคำถาม quiz แล้ว", "success");
    } catch {
      notify("เพิ่มคำถามไม่สำเร็จ", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (!selected) return;
    try {
      setSaving(true);
      await deleteStudioCourseQuestion(selected.id, questionId);
      setQuestions((prev) => prev.filter((q) => q.id !== questionId));
      await loadWizard(selected.id);
      notify("ลบคำถามแล้ว", "success");
    } catch {
      notify("ลบคำถามไม่สำเร็จ", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleAddCurriculum = async () => {
    if (!selected) return;
    try {
      setSaving(true);
      await handleSaveDraft();
      const section = await createCourseSection(selected.id, sectionTitle, 1);
      if (previewLessonTitle.trim()) {
        await createCourseLesson(selected.id, {
          sectionId: section?.id,
          title: previewLessonTitle,
          stepType: "video",
          videoUrl: previewLessonVideoUrl,
          durationMin: 10,
          isPreview: true,
        });
      }
      if (paidLessonTitle.trim()) {
        await createCourseLesson(selected.id, {
          sectionId: section?.id,
          title: paidLessonTitle,
          stepType: "video",
          videoUrl: paidLessonVideoUrl,
          durationMin: 15,
          isPreview: false,
        });
      }
      await loadWizard(selected.id);
      notify("เพิ่ม section และบทเรียนแล้ว", "success");
    } catch {
      notify("เพิ่มบทเรียนไม่สำเร็จ", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleThumbnailUpload = async (file?: File | null) => {
    if (!file || !selected) return;
    try {
      setUploadingThumb(true);
      const url = await uploadCourseImage(file);
      setForm((f) => ({ ...f, imageUrl: url }));
      await updateStudioCourse(selected.id, { imageUrl: url });
      notify("อัปโหลด Thumbnail แล้ว", "success");
    } catch {
      notify("อัปโหลด Thumbnail ไม่สำเร็จ", "error");
    } finally {
      setUploadingThumb(false);
    }
  };

  const handlePromoUpload = async (file?: File | null) => {
    if (!file || !selected) return;
    try {
      setUploadingPromo(true);
      const url = await uploadCourseVideo(file);
      setForm((f) => ({ ...f, promoVideoUrl: url }));
      await updateStudioCourse(selected.id, { promoVideoUrl: url });
      notify("อัปโหลด Promo video แล้ว", "success");
    } catch {
      notify("อัปโหลดวิดีโอไม่สำเร็จ ลองใช้ YouTube URL แทน", "warning");
    } finally {
      setUploadingPromo(false);
    }
  };

  const handleSubmit = async () => {
    if (!selected) return;
    try {
      setSaving(true);
      await handleSaveDraft();
      await submitStudioCourse(selected.id);
      await refreshList();
      await loadWizard(selected.id);
      notify("ส่งคอร์สให้ admin review แล้ว", "success");
    } catch (e: any) {
      const checklist = e?.response?.data?.checklist as CourseQualityChecklist | undefined;
      if (checklist) setWizard((prev) => (prev ? { ...prev, checklist } : prev));
      notify(
        checklist ? "ยังไม่ครบ checklist ก่อนส่ง review" : "ส่ง review ไม่สำเร็จ",
        "warning",
      );
      setStep(5);
    } finally {
      setSaving(false);
    }
  };

  const goNext = async () => {
    if (selected && step <= 3) await handleSaveDraft();
    setStep((s) => Math.min(5, s + 1));
    if (selected && step >= 3) {
      try {
        await loadWizard(selected.id);
      } catch {
        /* ignore refresh errors */
      }
    }
  };

  const projections: CourseRevenueProjection[] = wizard?.projections || [];
  const editing = !!selected;

  return (
    <div
      className={`aqond-trust-theme course-flow-theme course-studio-page min-h-screen pb-24 space-y-4 md:space-y-6 ${
        editing ? "course-studio-editing" : ""
      }`}
    >
      <CourseFlowHeader title="Course Studio" backTo="/courses" backLabel="ตลาดคอร์ส" />

      {editing ? (
        <section className="luxury-card rounded-2xl p-3 md:hidden space-y-2">
          <div className="flex items-center gap-2">
            <label htmlFor="course-studio-switcher" className="text-xs font-semibold text-slate-500 shrink-0">
              คอร์ส
            </label>
            <select
              id="course-studio-switcher"
              value={selected.id}
              onChange={(e) => {
                const course = courses.find((c) => c.id === e.target.value);
                if (course) handleSelectCourse(course);
              }}
              className="course-studio-field flex-1 min-w-0 py-2 text-sm"
            >
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title} ({course.status})
                </option>
              ))}
            </select>
            <Link
              to="/course-studio/sales"
              className="shrink-0 p-2 rounded-xl bg-emerald-50 text-emerald-700"
              aria-label="Sales Dashboard"
            >
              <BarChart3 size={18} />
            </Link>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500 px-0.5">
            <span>{courses.length} คอร์ส · ฿{Number(earnings?.summary?.instructor_net || 0).toLocaleString()} รายได้</span>
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving}
              className="inline-flex items-center gap-1 text-emerald-700 font-bold disabled:opacity-60"
            >
              <Plus size={14} /> สร้างใหม่
            </button>
          </div>
        </section>
      ) : null}

      <section
        className={`course-flow-hero rounded-2xl md:rounded-[32px] p-4 md:p-6 bg-gradient-to-br from-indigo-600 via-slate-900 to-emerald-700 text-white ${
          editing ? "hidden md:block" : ""
        }`}
      >
        <div className="flex items-center gap-3 md:gap-4">
          <div className="p-2 md:p-3 rounded-xl md:rounded-2xl bg-white/15 shrink-0">
            <BookOpen size={editing ? 24 : 32} />
          </div>
          <div className="min-w-0">
            <p className="text-xs md:text-sm opacity-80">Course Studio Wizard</p>
            <h1 className="text-xl md:text-3xl font-black leading-tight">สร้างและขายคอร์สของคุณ</h1>
            {!editing ? (
              <p className="text-xs md:text-sm opacity-90 mt-1 hidden sm:block">
                ขั้นตอนครบ: ข้อมูล → บทเรียน → ราคา → Preview → ส่งตรวจ
              </p>
            ) : null}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-4 md:mt-5 text-center text-[11px] md:text-xs">
          <div className="rounded-xl md:rounded-2xl bg-white/12 p-2 md:p-3">
            <p className="text-base md:text-lg font-bold">{courses.length}</p>
            <p>คอร์สของคุณ</p>
          </div>
          <div className="rounded-xl md:rounded-2xl bg-white/12 p-2 md:p-3">
            <p className="text-base md:text-lg font-bold">฿{Number(earnings?.summary?.instructor_net || 0).toLocaleString()}</p>
            <p>รายได้ผู้สอน</p>
          </div>
          <Link
            to="/profile?tab=wallet"
            className="rounded-xl md:rounded-2xl bg-white/12 p-2 md:p-3 block hover:bg-white/20 transition-colors"
          >
            <p className="text-base md:text-lg font-bold">฿{Number(earnings?.wallet?.withdrawable || 0).toLocaleString()}</p>
            <p>ถอนได้</p>
          </Link>
        </div>
        <Link
          to="/course-studio/sales"
          className="mt-3 md:mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl md:rounded-2xl bg-white/15 text-white font-bold text-sm"
        >
          <BarChart3 size={17} /> Sales Dashboard
        </Link>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className={`luxury-card rounded-2xl md:rounded-3xl p-4 ${editing ? "hidden lg:block" : ""}`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-slate-100">คอร์สของฉัน</h2>
            <button
              onClick={handleCreate}
              disabled={saving}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-60"
            >
              <Plus size={16} /> สร้าง
            </button>
          </div>
          {loading ? <div className="h-32 animate-pulse bg-slate-200 rounded-2xl" /> : null}
          {!loading && courses.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/60 p-5 text-center space-y-3">
              <BookOpen className="mx-auto text-emerald-600" size={28} />
              <p className="text-sm font-semibold text-slate-700">ยังไม่มีคอร์ส draft</p>
              <p className="text-xs text-slate-500">กด &quot;+ สร้าง&quot; เพื่อเริ่ม wizard — ตั้งชื่อคอร์สได้ในขั้นตอนที่ 1</p>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-60"
              >
                <Plus size={16} /> สร้างคอร์สแรก
              </button>
            </div>
          ) : null}
          <div className="space-y-2">
            {courses.map((course) => (
              <button
                key={course.id}
                onClick={() => handleSelectCourse(course)}
                className={`w-full text-left p-3 rounded-2xl border ${selected?.id === course.id ? "border-emerald-400 bg-emerald-500/10" : "border-slate-700 bg-slate-800/50"}`}
              >
                <p className="font-semibold text-slate-100">{course.title}</p>
                <p className="text-xs text-slate-400">{course.status} · ฿{Number(course.priceThb || 0).toLocaleString()}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="luxury-card rounded-2xl md:rounded-3xl p-4 space-y-4">
          {!selected ? (
            <div className="text-center py-8 md:py-10 text-slate-400 space-y-3">
              <Circle className="mx-auto mb-1" />
              <p className="text-sm px-2">เลือกคอร์สจากรายการ หรือกด &quot;+ สร้าง&quot; เพื่อเริ่ม wizard</p>
              {courses.length === 0 ? (
                <button
                  onClick={handleCreate}
                  disabled={saving}
                  className="inline-flex items-center gap-1 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-60"
                >
                  <Plus size={16} /> เริ่มสร้างคอร์ส
                </button>
              ) : null}
            </div>
          ) : (
            <>
              {isPublished ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-amber-900 inline-flex items-center gap-1.5">
                      <EyeOff size={16} /> คอร์สกำลังขายอยู่ (published)
                    </p>
                    <p className="text-xs text-amber-800 mt-0.5">ถอดจากขายก่อนแก้บทเรียน — ผู้ซื้อเดิมยังเรียนได้</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleUnlist}
                    disabled={saving}
                    className="shrink-0 px-4 py-2 rounded-xl bg-amber-600 text-white text-sm font-bold disabled:opacity-60"
                  >
                    ถอดจากขาย
                  </button>
                </div>
              ) : null}

              <WizardStepProgress step={step} onStep={setStep} />

              {step === 1 ? (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="cs-title" className="course-studio-field-label">ชื่อคอร์ส</label>
                    <input id="cs-title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="ชื่อที่ดึงดูดผู้เรียน" className="course-studio-field" />
                  </div>
                  <div>
                    <label htmlFor="cs-subtitle" className="course-studio-field-label">Subtitle</label>
                    <input id="cs-subtitle" value={form.subtitle} onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))} placeholder="ประโยคขายง่าย 1 บรรทัด" className="course-studio-field" />
                  </div>
                  <div>
                    <label htmlFor="cs-desc" className="course-studio-field-label">รายละเอียดคอร์ส</label>
                    <textarea id="cs-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="อธิบายว่าคอร์สนี้ช่วยอะไร" className="course-studio-field min-h-[5.5rem]" />
                  </div>
                  <div>
                    <label htmlFor="cs-outcomes" className="course-studio-field-label">สิ่งที่ผู้เรียนจะได้</label>
                    <textarea id="cs-outcomes" value={form.learningOutcomesText} onChange={(e) => setForm((f) => ({ ...f, learningOutcomesText: e.target.value }))} placeholder="1 บรรทัดต่อ 1 ข้อ" className="course-studio-field min-h-[5.5rem]" />
                  </div>
                  <div>
                    <label htmlFor="cs-req" className="course-studio-field-label">ข้อกำหนดเบื้องต้น</label>
                    <textarea id="cs-req" value={form.requirementsText} onChange={(e) => setForm((f) => ({ ...f, requirementsText: e.target.value }))} placeholder="1 บรรทัดต่อ 1 ข้อ" className="course-studio-field min-h-[4.5rem]" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="cs-cat" className="course-studio-field-label">หมวดหมู่</label>
                      <input id="cs-cat" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="business" className="course-studio-field" />
                    </div>
                    <div>
                      <label htmlFor="cs-level" className="course-studio-field-label">ระดับ</label>
                      <select id="cs-level" value={form.level} onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))} className="course-studio-field">
                        <option value="beginner">Beginner</option>
                        <option value="intermediate">Intermediate</option>
                        <option value="advanced">Advanced</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="cs-headline" className="course-studio-field-label">Headline ผู้สอน</label>
                    <input id="cs-headline" value={form.instructorHeadline} onChange={(e) => setForm((f) => ({ ...f, instructorHeadline: e.target.value }))} placeholder="เช่น ผู้เชี่ยวชาญด้าน..." className="course-studio-field" />
                  </div>
                  <div>
                    <label htmlFor="cs-bio" className="course-studio-field-label">Bio ผู้สอน</label>
                    <textarea id="cs-bio" value={form.instructorBio} onChange={(e) => setForm((f) => ({ ...f, instructorBio: e.target.value }))} placeholder="ช่วยให้คนอยากซื้อมากขึ้น" className="course-studio-field min-h-[4.5rem]" />
                  </div>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 p-3 space-y-2">
                    <p className="text-sm font-semibold text-slate-800 inline-flex items-center gap-2"><ImagePlus size={16} /> Thumbnail</p>
                    {form.imageUrl ? <img src={form.imageUrl} alt="thumbnail" className="w-full max-h-40 object-cover rounded-xl" /> : null}
                    <input value={form.imageUrl} onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))} placeholder="Thumbnail URL" className="course-studio-field" />
                    <label className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-100 text-slate-800 text-sm font-semibold cursor-pointer">
                      <Upload size={15} /> {uploadingThumb ? "กำลังอัปโหลด..." : "อัปโหลด Thumbnail"}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => handleThumbnailUpload(e.target.files?.[0])} />
                    </label>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-3 space-y-2">
                    <p className="text-sm font-semibold text-slate-800">Promo video</p>
                    <input value={form.promoVideoUrl} onChange={(e) => setForm((f) => ({ ...f, promoVideoUrl: e.target.value }))} placeholder="YouTube หรือ video URL" className="course-studio-field" />
                    <label className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-100 text-slate-800 text-sm font-semibold cursor-pointer">
                      <Upload size={15} /> {uploadingPromo ? "กำลังอัปโหลด..." : "อัปโหลด Promo video"}
                      <input type="file" accept="video/*" className="hidden" onChange={(e) => handlePromoUpload(e.target.files?.[0])} />
                    </label>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-3 space-y-3">
                    <p className="text-sm font-semibold text-slate-800">เพิ่ม section + บทเรียน</p>
                    <input value={sectionTitle} onChange={(e) => setSectionTitle(e.target.value)} placeholder="ชื่อ section" className="course-studio-field" />
                    <input value={previewLessonTitle} onChange={(e) => setPreviewLessonTitle(e.target.value)} placeholder="Preview lesson" className="course-studio-field" />
                    <input value={previewLessonVideoUrl} onChange={(e) => setPreviewLessonVideoUrl(e.target.value)} placeholder="Preview video URL" className="course-studio-field" />
                    <input value={paidLessonTitle} onChange={(e) => setPaidLessonTitle(e.target.value)} placeholder="Paid lesson" className="course-studio-field" />
                    <input value={paidLessonVideoUrl} onChange={(e) => setPaidLessonVideoUrl(e.target.value)} placeholder="Paid video URL" className="course-studio-field" />
                    <button onClick={handleAddCurriculum} disabled={saving || !isEditable} className="w-full px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-bold disabled:opacity-60">
                      เพิ่ม section + บทเรียน
                    </button>
                    {!isEditable ? (
                      <p className="text-xs text-amber-700">ถอดจากขายก่อนจึงจะเพิ่ม/แก้บทเรียนได้</p>
                    ) : null}
                  </div>
                  {(wizard?.course.lessons || []).length ? (
                    <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3 space-y-2">
                      <p className="text-sm font-semibold text-slate-800 mb-1">บทเรียนที่มีอยู่ ({wizard?.course.lessons?.length || 0})</p>
                      {(wizard?.course.lessons || []).map((lesson) => (
                        <div key={lesson.id} className="flex items-start gap-2 text-sm text-slate-600">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-800">
                              {lesson.isPreview ? "Preview · " : ""}{lesson.title}
                              <span className="text-slate-500 font-normal"> ({lesson.durationMin || 0} นาที · {lesson.stepType || "video"})</span>
                            </p>
                          </div>
                          {isEditable ? (
                            <button
                              type="button"
                              onClick={() => handleDeleteLesson(lesson.id)}
                              disabled={saving}
                              className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                              aria-label="ลบบทเรียน"
                            >
                              <Trash2 size={16} />
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-3 space-y-3">
                    <p className="text-sm font-semibold text-slate-800">Quiz (course_questions)</p>
                    <input value={quizQuestionText} onChange={(e) => setQuizQuestionText(e.target.value)} placeholder="คำถาม" className="course-studio-field" disabled={!isEditable} />
                    <div className="grid grid-cols-2 gap-2">
                      <input value={quizOptionA} onChange={(e) => setQuizOptionA(e.target.value)} placeholder="ตัวเลือก A" className="course-studio-field" disabled={!isEditable} />
                      <input value={quizOptionB} onChange={(e) => setQuizOptionB(e.target.value)} placeholder="ตัวเลือก B" className="course-studio-field" disabled={!isEditable} />
                      <input value={quizOptionC} onChange={(e) => setQuizOptionC(e.target.value)} placeholder="ตัวเลือก C" className="course-studio-field" disabled={!isEditable} />
                      <input value={quizOptionD} onChange={(e) => setQuizOptionD(e.target.value)} placeholder="ตัวเลือก D" className="course-studio-field" disabled={!isEditable} />
                    </div>
                    <select value={quizCorrect} onChange={(e) => setQuizCorrect(e.target.value)} className="course-studio-field" disabled={!isEditable}>
                      <option value="A">คำตอบถูก: A</option>
                      <option value="B">คำตอบถูก: B</option>
                      <option value="C">คำตอบถูก: C</option>
                      <option value="D">คำตอบถูก: D</option>
                    </select>
                    <button type="button" onClick={handleAddQuizQuestion} disabled={saving || !isEditable} className="w-full px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-sm disabled:opacity-60">
                      เพิ่มคำถาม Quiz
                    </button>
                    {questions.length ? (
                      <div className="space-y-2 pt-1">
                        {questions.map((q) => (
                          <div key={q.id} className="flex items-start gap-2 rounded-xl bg-white border border-slate-200 p-2 text-sm">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-slate-800">{q.questionText}</p>
                              <p className="text-xs text-slate-500">คำตอบ: {q.correctOptionId}</p>
                            </div>
                            {isEditable ? (
                              <button type="button" onClick={() => handleDeleteQuestion(q.id)} disabled={saving} className="p-1 text-rose-600">
                                <Trash2 size={15} />
                              </button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {step === 3 ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="cs-price" className="course-studio-field-label">ราคาขาย (฿)</label>
                      <input id="cs-price" type="number" value={form.priceThb} onChange={(e) => setForm((f) => ({ ...f, priceThb: Number(e.target.value) }))} className="course-studio-field" />
                    </div>
                    <div>
                      <label htmlFor="cs-anchor" className="course-studio-field-label">ราคาเต็ม (anchor)</label>
                      <input id="cs-anchor" type="number" value={form.originalPriceThb} onChange={(e) => setForm((f) => ({ ...f, originalPriceThb: Number(e.target.value) }))} className="course-studio-field" />
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor="cs-duration" className="course-studio-field-label">ระยะเวลารวม (นาที)</label>
                      <input id="cs-duration" type="number" value={form.duration} onChange={(e) => setForm((f) => ({ ...f, duration: Number(e.target.value) }))} className="course-studio-field" />
                    </div>
                    <label className="sm:col-span-2 flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.sequentialUnlock}
                        onChange={(e) => setForm((f) => ({ ...f, sequentialUnlock: e.target.checked }))}
                        className="rounded border-slate-300"
                      />
                      เรียนตามลำดับ — ต้องจบบทก่อนหน้าก่อนไปบทถัดไป
                    </label>
                  </div>
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
                    <p className="font-bold text-emerald-800">Revenue Preview</p>
                    <p className="text-sm text-emerald-700">
                      ต่อการขาย 1 คอร์ส คุณจะได้ประมาณ ฿{Number(wizard?.quote?.instructorNet || 0).toLocaleString()} (หลัง platform fee)
                    </p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {projections.map((row) => (
                        <div key={row.units} className="rounded-xl bg-slate-950/40 p-3 text-center">
                          <p className="text-xs text-slate-400">ขาย {row.units} คน</p>
                          <p className="text-lg font-black text-emerald-300">฿{Number(row.instructorNet).toLocaleString()}</p>
                          <p className="text-[11px] text-slate-500">net</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {step === 4 ? (
                <div className="space-y-4">
                  <div className="max-w-sm mx-auto">
                    <p className="text-xs text-emerald-300 uppercase tracking-wide mb-2 px-1">Marketplace card preview</p>
                    <CourseMarketplaceCard course={previewCourse as MarketplaceCourse} compact />
                  </div>
                  <div className="rounded-2xl bg-slate-900/70 p-4 text-sm text-slate-300 space-y-2">
                    <p className="font-semibold text-slate-100">Preview หน้า Detail</p>
                    <p>{form.subtitle || form.description || "ยังไม่มี subtitle"}</p>
                    <div className="space-y-1">
                      {linesToList(form.learningOutcomesText).map((o) => (
                        <p key={o} className="inline-flex items-start gap-2"><CheckCircle2 size={14} className="text-emerald-300 mt-0.5" /> {o}</p>
                      ))}
                    </div>
                    <Link to={`/courses/${selected.id}`} className="inline-flex mt-2 px-4 py-2 rounded-xl bg-slate-800 text-slate-100 font-bold">
                      เปิดหน้า detail จริง
                    </Link>
                  </div>
                </div>
              ) : null}

              {step === 5 ? (
                <div className="space-y-4 pb-2">
                  <ChecklistPanel checklist={wizard?.checklist || null} />
                  <button
                    onClick={handleSubmit}
                    disabled={saving || !wizard?.checklist?.ready}
                    className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-blue-600 text-white font-black disabled:opacity-50"
                  >
                    <Send size={18} /> {wizard?.checklist?.ready ? "ส่งให้ admin review" : "ยังไม่ครบ checklist"}
                  </button>
                  {!wizard?.checklist?.ready ? (
                    <p className="text-sm text-amber-600">เติม thumbnail, preview lesson, paid lesson, outcomes, bio และราคาให้ครบก่อนส่ง</p>
                  ) : null}
                </div>
              ) : null}

              <div className="hidden md:block pt-2 border-t border-slate-200">
                <WizardActionBar
                  step={step}
                  saving={saving}
                  onBack={() => setStep((s) => Math.max(1, s - 1))}
                  onSave={handleSaveDraft}
                  onNext={goNext}
                />
              </div>
            </>
          )}
        </div>
      </section>

      {editing ? (
        <div className="md:hidden">
          <WizardActionBar
            step={step}
            saving={saving}
            onBack={() => setStep((s) => Math.max(1, s - 1))}
            onSave={handleSaveDraft}
            onNext={goNext}
          />
        </div>
      ) : null}
    </div>
  );
}
