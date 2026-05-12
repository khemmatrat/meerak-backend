/**
 * Training Center Admin — Command Center: Video/Content, Question Bank, Assignments
 * ปรับข้อสอบ เกณฑ์คะแนน เวลา และเนื้อหาคอร์ส (LMS)
 */
import React, { useState, useEffect } from "react";
import {
  getTrainingExamConfig,
  updateTrainingExamConfig,
  getLmsCourses,
  getLmsLessons,
  getLmsQuestions,
  updateLmsCourse,
  updateLmsLesson,
  createLmsLesson,
  deleteLmsLesson,
  reorderLmsLessons,
  createLmsQuestion,
  updateLmsQuestion,
  deleteLmsQuestion,
  duplicateLmsQuestion,
  bulkImportLmsQuestions,
  reorderLmsQuestions,
  getLmsAssignments,
  gradeLmsAssignment,
  getTrainingStats,
  exportLmsQuestionsCsv,
  duplicateLmsCourse,
  aiGenerateQuestions,
  ADMIN_API_BASE,
  type TrainingExamConfig,
  type LmsCourse,
  type LmsLesson,
  type LmsQuestion,
  type AssignmentSubmission,
} from "../services/adminApi";
import { useToast } from "../context/ToastContext";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  BookOpen,
  Loader2,
  Save,
  CheckCircle,
  Clock,
  Percent,
  ListOrdered,
  AlertCircle,
  Video,
  FileText,
  Plus,
  Trash2,
  Edit2,
  Copy,
  GripVertical,
  Upload,
  X,
  Eye,
  Download,
  Zap,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

type TabId = "overview" | "module1" | "module2" | "module3" | "assignments";

const LEARNER_PREVIEW_URL = (import.meta as any).env?.VITE_APP_URL || "http://localhost:3000";

export const TrainingCenterView: React.FC = () => {
  const toast = useToast();
  const [config, setConfig] = useState<TrainingExamConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [tab, setTab] = useState<TabId>("overview");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState<Record<string, { passPercent?: number; timeLimitMin?: number; totalQuestions?: number }>>({});

  const [lmsCourses, setLmsCourses] = useState<LmsCourse[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [lmsLessons, setLmsLessons] = useState<LmsLesson[]>([]);
  const [lmsQuestions, setLmsQuestions] = useState<LmsQuestion[]>([]);
  const [assignments, setAssignments] = useState<AssignmentSubmission[]>([]);
  const [lmsLoading, setLmsLoading] = useState(false);
  const [stats, setStats] = useState<{ passRateByModule: Record<number, { passed: number; total: number; rate: number }>; attemptsOverTime: Array<{ date: string; count: number }>; pendingAssignments: number; totalAttempts: number } | null>(null);

  const defaultConfig: TrainingExamConfig = {
    module1: { passPercent: 85, timeLimitMin: 45, totalQuestions: 55 },
    module2: { passPercent: 80, timeLimitMin: 40, totalQuestions: 36, categories: [] },
    module3: { passPercent: 100, timeLimitMin: 30, totalQuestions: 5 },
  };

  const fetchConfig = async () => {
    setLoading(true);
    setError(null);
    setErrorStatus(null);
    try {
      const data = await getTrainingExamConfig();
      setConfig(data);
    } catch (e: any) {
      setError(e?.message ?? "โหลด config ไม่สำเร็จ");
      setErrorStatus(e?.status ?? null);
      setConfig(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchLmsCourses = async () => {
    setLmsLoading(true);
    try {
      const { courses } = await getLmsCourses();
      setLmsCourses(courses || []);
      if (!selectedCourseId && courses?.length) {
        const m1 = courses.find((c: LmsCourse) => c.id === "nexus-professional-standards");
        setSelectedCourseId(m1?.id ?? courses[0]?.id ?? null);
      }
    } catch (e) {
      console.warn("LMS courses fetch failed:", e);
      setLmsCourses([]);
    } finally {
      setLmsLoading(false);
    }
  };

  const fetchLmsLessons = async (courseId: string) => {
    try {
      const { lessons } = await getLmsLessons(courseId);
      setLmsLessons(lessons || []);
    } catch (e) {
      setLmsLessons([]);
    }
  };

  const fetchLmsQuestions = async (courseId: string) => {
    try {
      const { questions } = await getLmsQuestions(courseId);
      setLmsQuestions(questions || []);
    } catch (e) {
      setLmsQuestions([]);
    }
  };

  const fetchAssignments = async () => {
    try {
      const { submissions } = await getLmsAssignments("pending");
      setAssignments(submissions || []);
    } catch (e) {
      setAssignments([]);
    }
  };

  const fetchTrainingStats = async () => {
    try {
      const s = await getTrainingStats();
      setStats(s);
    } catch {
      setStats(null);
    }
  };

  useEffect(() => {
    if (tab === "module1" || tab === "module2") fetchLmsCourses();
    if (tab === "assignments") fetchAssignments();
    if (tab === "overview" || tab === "assignments") fetchTrainingStats();
  }, [tab]);

  const m1CourseId = lmsCourses.find((c) => c.id === "nexus-professional-standards")?.id ?? null;
  const effectiveCourseId = tab === "module1" ? (m1CourseId || selectedCourseId) : selectedCourseId;

  useEffect(() => {
    if (effectiveCourseId) {
      fetchLmsLessons(effectiveCourseId);
      fetchLmsQuestions(effectiveCourseId);
    } else {
      setLmsLessons([]);
      setLmsQuestions([]);
    }
  }, [effectiveCourseId]);

  const handleSave = async (module: 1 | 2 | 3) => {
    const d = dirty[`module${module}`];
    if (!d || !config) return;
    setSaving(true);
    try {
      await updateTrainingExamConfig({
        module,
        passPercent: d.passPercent,
        timeLimitMin: d.timeLimitMin,
        totalQuestions: d.totalQuestions,
      });
      setConfig((prev) => {
        if (!prev) return prev;
        const m = prev[`module${module}` as keyof TrainingExamConfig] as any;
        return {
          ...prev,
          [`module${module}`]: {
            ...m,
            passPercent: d.passPercent ?? m.passPercent,
            timeLimitMin: d.timeLimitMin ?? m.timeLimitMin,
            totalQuestions: d.totalQuestions ?? m.totalQuestions,
            updatedAt: new Date().toISOString(),
          },
        };
      });
      setDirty((prev) => {
        const next = { ...prev };
        delete next[`module${module}`];
        return next;
      });
      toast.success(`บันทึก Module ${module} เรียบร้อย`);
    } catch (e: any) {
      setError(e?.message ?? "บันทึกไม่สำเร็จ");
      toast.error(e?.message ?? "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const updateLocal = (module: 1 | 2 | 3, field: "passPercent" | "timeLimitMin" | "totalQuestions", value: number) => {
    setDirty((prev) => ({
      ...prev,
      [`module${module}`]: {
        ...(prev[`module${module}`] || {}),
        [field]: value,
      },
    }));
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-indigo-500" />
      </div>
    );
  }

  if (error && !config) {
    return (
      <div className="p-8">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 flex items-center gap-3">
          <AlertCircle className="text-amber-600 flex-shrink-0" size={24} />
          <div>
            <p className="font-medium text-amber-900">{error}</p>
            <p className="text-sm text-amber-800 mt-1">
              {errorStatus === 404
                ? "ไม่พบ route (404) — รีสตาร์ท Backend (server.js) และรัน POST /api/admin/setup-database เพื่อสร้างตาราง exam_module_config"
                : errorStatus === 401 || error.includes("401") || error.includes("Authorization") || error.includes("token")
                ? "กรุณา Login Admin ก่อน (หรือ token หมดอายุ)"
                : "ตรวจสอบว่า (1) Backend รันที่ URL ด้านล่าง (2) มี route GET /api/admin/training/exam-config (3) Login Admin แล้ว"}
            </p>
            {errorStatus != null && <p className="text-xs text-amber-700 mt-1">HTTP {errorStatus}</p>}
            <p className="text-xs text-amber-700 mt-1 font-mono break-all">เรียก: {ADMIN_API_BASE}/api/admin/training/exam-config</p>
            <button
              onClick={fetchConfig}
              className="mt-3 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
            >
              โหลดใหม่
            </button>
          </div>
        </div>
      </div>
    );
  }

  const pendingCount = stats?.pendingAssignments ?? 0;
  const tabs: { id: TabId; label: string; badge?: number }[] = [
    { id: "overview", label: "ภาพรวม" },
    { id: "module1", label: "Module 1 — Video & Content" },
    { id: "module2", label: "Module 2 — Question Bank" },
    { id: "module3", label: "Module 3 — Scenario" },
    { id: "assignments", label: "Assignments — Manual Grading", badge: pendingCount },
  ];

  const c = config!;
  const m1 = c.module1;
  const m2 = c.module2;
  const m3 = c.module3;

  return (
    <div className="p-6 overflow-auto">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <BookOpen size={28} /> Training Center — ข้อสอบ & คะแนน
          </h1>
          <p className="text-slate-600 text-sm mt-1">
            ปรับเกณฑ์ผ่าน จำนวนข้อ และเวลาแต่ละ Module ที่ใช้ในแอปหลัก (TrainingDashboard, NexusExamModule2/3)
          </p>
        </div>

        <div className="flex flex-wrap gap-2 mb-6 border-b border-slate-200 pb-4">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition flex items-center gap-2 ${
                tab === t.id ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {t.label}
              {t.badge != null && t.badge > 0 && (
                <span className="ml-1 px-2 py-0.5 rounded-full bg-rose-500 text-white text-xs">{t.badge}</span>
              )}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm flex items-center gap-2">
            <AlertCircle size={18} /> {error}
          </div>
        )}

        {tab === "overview" && (
          <div className="space-y-6">
            {stats && (
              <StatsSection stats={stats} onRefresh={fetchTrainingStats} />
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card title="Module 1" desc="จริยธรรม ความปลอดภัย กฎหมาย" passPercent={m1.passPercent} timeLimitMin={m1.timeLimitMin} totalQuestions={m1.totalQuestions} previewCourseId="nexus-professional-standards" learnerPreviewUrl={LEARNER_PREVIEW_URL} />
              <Card title="Module 2" desc="ทักษะทางเทคนิคตามอาชีพ" passPercent={m2.passPercent} timeLimitMin={m2.timeLimitMin} totalQuestions={m2.totalQuestions} previewCourseId={lmsCourses.find((c) => c.nexus_module === 2)?.id} learnerPreviewUrl={LEARNER_PREVIEW_URL} />
              <Card title="Module 3" desc="Scenario ทัศนคติ" passPercent={m3.passPercent} timeLimitMin={m3.timeLimitMin} totalQuestions={m3.totalQuestions} learnerPreviewUrl={LEARNER_PREVIEW_URL} />
            </div>
          </div>
        )}

        {tab === "module1" && (
          <div className="space-y-6">
            <ModuleForm
              module={1}
              title="Module 1 — General Ethics, Safety, and Law"
              desc="แบบทดสอบ 55 ข้อ (nexus-professional-standards), ผ่าน ≥85%, ไม่ผ่านล็อก 24 ชม."
              current={m1}
              dirty={dirty.module1}
              onUpdate={updateLocal}
              onSave={handleSave}
              saving={saving}
            />
            <Module1ContentManager
              courses={lmsCourses}
              selectedCourseId={m1CourseId}
              onSelectCourse={() => {}}
              lessons={lmsLessons}
              onRefresh={fetchLmsCourses}
              onRefreshLessons={() => m1CourseId && fetchLmsLessons(m1CourseId)}
              loading={lmsLoading}
            />
            <Module2QuestionManager
              courses={lmsCourses.filter((c) => c.nexus_module === 1)}
              selectedCourseId={m1CourseId}
              onSelectCourse={() => {}}
              questions={lmsQuestions}
              onRefresh={() => m1CourseId && fetchLmsQuestions(m1CourseId)}
              onRefreshCourses={fetchLmsCourses}
              loading={lmsLoading}
            />
          </div>
        )}
        {tab === "module2" && (
          <div className="space-y-6">
            <ModuleForm
              module={2}
              title="Module 2 — Technical Skills (ตามอาชีพ)"
              desc="36 ข้อต่ออาชีพ, เกณฑ์ผ่าน 80%, จำกัดเวลา 40 นาที"
              current={m2}
              dirty={dirty.module2}
              onUpdate={updateLocal}
              onSave={handleSave}
              saving={saving}
              categories={m2.categories}
            />
            <Module2QuestionManager
              courses={lmsCourses.filter((c) => c.nexus_module === 2)}
              selectedCourseId={selectedCourseId}
              onSelectCourse={setSelectedCourseId}
              questions={lmsQuestions}
              onRefresh={() => selectedCourseId && fetchLmsQuestions(selectedCourseId)}
              onRefreshCourses={fetchLmsCourses}
              loading={lmsLoading}
            />
          </div>
        )}
        {tab === "module3" && (
          <ModuleForm
            module={3}
            title="Module 3 — Scenario: Problem Solving & Positive Mindset"
            desc="แบบ Scenario แสดง Recommended Action, ผ่านอัตโนมัติ (เรียนรู้)"
            current={m3}
            dirty={dirty.module3}
            onUpdate={updateLocal}
            onSave={handleSave}
            saving={saving}
          />
        )}
        {tab === "assignments" && (
          <AssignmentsGradingView
            submissions={assignments}
            onRefresh={() => { fetchAssignments(); fetchTrainingStats(); }}
            onGrade={gradeLmsAssignment}
            toast={toast}
          />
        )}
      </div>
    </div>
  );
};

function StatsSection({ stats, onRefresh }: { stats: { passRateByModule: Record<number, { passed: number; total: number; rate: number }>; attemptsOverTime: Array<{ date: string; count: number }>; pendingAssignments: number; totalAttempts: number }; onRefresh: () => void }) {
  const chartData = [...(stats.attemptsOverTime || [])].reverse();
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="font-bold text-slate-800 mb-4 flex items-center justify-between">
        สถิติการสอบและ Assignments
        <button onClick={onRefresh} className="text-sm text-indigo-600 hover:text-indigo-800">โหลดใหม่</button>
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="p-3 rounded-lg bg-slate-50">
          <p className="text-xs text-slate-500">ผู้สอบ Module 1 ผ่าน</p>
          <p className="text-xl font-bold text-slate-800">{stats.passRateByModule?.[1]?.rate ?? 0}%</p>
          <p className="text-xs text-slate-600">({stats.passRateByModule?.[1]?.passed ?? 0}/{stats.passRateByModule?.[1]?.total ?? 0})</p>
        </div>
        <div className="p-3 rounded-lg bg-slate-50">
          <p className="text-xs text-slate-500">ผู้สอบ Module 2 ผ่าน</p>
          <p className="text-xl font-bold text-slate-800">{stats.passRateByModule?.[2]?.rate ?? 0}%</p>
          <p className="text-xs text-slate-600">({stats.passRateByModule?.[2]?.passed ?? 0}/{stats.passRateByModule?.[2]?.total ?? 0})</p>
        </div>
        <div className="p-3 rounded-lg bg-slate-50">
          <p className="text-xs text-slate-500">รวมการสอบ</p>
          <p className="text-xl font-bold text-slate-800">{stats.totalAttempts ?? 0}</p>
        </div>
        <div className="p-3 rounded-lg bg-amber-50">
          <p className="text-xs text-amber-700">รอตรวจงาน</p>
          <p className="text-xl font-bold text-amber-800">{stats.pendingAssignments ?? 0}</p>
        </div>
      </div>
      {chartData.length > 0 && (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v?.slice(0, 10) ?? ""} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => [v, "ครั้ง"]} labelFormatter={(l) => l?.slice(0, 10)} />
              <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function Card({
  title,
  desc,
  passPercent,
  timeLimitMin,
  totalQuestions,
  previewCourseId,
  learnerPreviewUrl,
}: {
  title: string;
  desc: string;
  passPercent: number;
  timeLimitMin: number;
  totalQuestions: number;
  previewCourseId?: string | null;
  learnerPreviewUrl?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="font-bold text-slate-800">{title}</h3>
      <p className="text-sm text-slate-600 mt-1">{desc}</p>
      <div className="mt-4 space-y-2 text-sm">
        <div className="flex items-center gap-2 text-slate-700">
          <Percent size={16} /> ผ่านไม่ต่ำกว่า <strong>{passPercent}%</strong>
        </div>
        <div className="flex items-center gap-2 text-slate-700">
          <Clock size={16} /> จำกัดเวลา <strong>{timeLimitMin} นาที</strong>
        </div>
        <div className="flex items-center gap-2 text-slate-700">
          <ListOrdered size={16} /> จำนวนข้อ <strong>{totalQuestions}</strong>
        </div>
      </div>
      {previewCourseId && learnerPreviewUrl && (
        <a
          href={`${learnerPreviewUrl.replace(/\/$/, "")}/training/course/${previewCourseId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 px-3 py-2 bg-indigo-100 text-indigo-800 rounded-lg text-sm font-medium hover:bg-indigo-200"
        >
          <Eye size={16} /> ดูแบบผู้เรียน
        </a>
      )}
    </div>
  );
}

function ModuleForm({
  module,
  title,
  desc,
  current,
  dirty,
  onUpdate,
  onSave,
  saving,
  categories,
}: {
  module: 1 | 2 | 3;
  title: string;
  desc: string;
  current: { passPercent: number; timeLimitMin: number; totalQuestions: number };
  dirty?: { passPercent?: number; timeLimitMin?: number; totalQuestions?: number };
  onUpdate: (mod: 1 | 2 | 3, field: "passPercent" | "timeLimitMin" | "totalQuestions", value: number) => void;
  onSave: (mod: 1 | 2 | 3) => void;
  saving: boolean;
  categories?: string[] | null;
}) {
  const p = dirty?.passPercent ?? current.passPercent;
  const t = dirty?.timeLimitMin ?? current.timeLimitMin;
  const n = dirty?.totalQuestions ?? current.totalQuestions;
  const hasDirty = dirty && Object.keys(dirty).length > 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold text-slate-800">{title}</h3>
      <p className="text-sm text-slate-600 mt-1 mb-6">{desc}</p>
      {categories && categories.length > 0 && (
        <p className="text-xs text-slate-500 mb-4">หมวดอาชีพ: {categories.join(", ")}</p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">เกณฑ์ผ่าน (%)</label>
          <input
            type="number"
            min={0}
            max={100}
            value={p}
            onChange={(e) => onUpdate(module, "passPercent", parseInt(e.target.value, 10) || 0)}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">จำกัดเวลา (นาที)</label>
          <input
            type="number"
            min={1}
            value={t}
            onChange={(e) => onUpdate(module, "timeLimitMin", parseInt(e.target.value, 10) || 1)}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">จำนวนข้อ</label>
          <input
            type="number"
            min={1}
            value={n}
            onChange={(e) => onUpdate(module, "totalQuestions", parseInt(e.target.value, 10) || 1)}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>
      {hasDirty && (
        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={() => onSave(module)}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            บันทึก
          </button>
          <span className="text-sm text-slate-500">มีการแก้ไข — กดบันทึกเพื่ออัปเดต</span>
        </div>
      )}
    </div>
  );
}

function Module1ContentManager({
  courses,
  selectedCourseId,
  onSelectCourse,
  lessons,
  onRefresh,
  onRefreshLessons,
  loading,
}: {
  courses: LmsCourse[];
  selectedCourseId: string | null;
  onSelectCourse: (id: string | null) => void;
  lessons: LmsLesson[];
  onRefresh: () => void;
  onRefreshLessons: () => void;
  loading: boolean;
}) {
  const m1Course = courses.find((c) => c.id === "nexus-professional-standards");
  const [saving, setSaving] = useState(false);
  const [modalAdd, setModalAdd] = useState(false);
  const [modalEdit, setModalEdit] = useState<LmsLesson | null>(null);

  const handleDeleteLesson = async (lessonId: string) => {
    if (!confirm("ลบบทเรียนนี้?")) return;
    setSaving(true);
    try {
      await deleteLmsLesson(lessonId);
      onRefreshLessons();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleReorder = async (order: string[]) => {
    if (!m1Course?.id) return;
    setSaving(true);
    try {
      await reorderLmsLessons(m1Course.id, order);
      onRefreshLessons();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-4 flex justify-center"><Loader2 className="animate-spin" /> Loading...</div>;
  if (!m1Course) return (
    <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-slate-700">
      <p className="font-medium">ไม่พบคอร์ส Module 1</p>
      <p className="text-sm mt-1">รัน <code className="bg-amber-100 px-1 rounded">npm run seed:lms:m1</code> แล้วกดโหลดใหม่</p>
      <button onClick={onRefresh} className="mt-3 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">โหลดใหม่</button>
    </div>
  );

  const sortedLessons = [...lessons].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const stepLabels: Record<string, string> = { video: "วิดีโอ", text: "อ่าน", quiz: "แบบทดสอบ", assignment: "ส่งงาน" };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
        <Video size={20} /> Lesson Management — Video, Text, Quiz
      </h3>
      <p className="text-sm text-slate-600 mt-1 mb-4">จัดการบทเรียน: ดูวิดีโอ → อ่านเนื้อหา → ทำแบบทดสอบ (ลากเพื่อเปลี่ยนลำดับ)</p>
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => setModalAdd(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
        >
          <Plus size={16} /> เพิ่มบทเรียน
        </button>
        <a
          href={`${(import.meta as any).env?.VITE_APP_URL || "http://localhost:3000"}/training/course/${m1Course.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200"
        >
          <Eye size={16} /> ดูแบบผู้เรียน
        </a>
      </div>
      <Module1SortableLessons
        lessons={sortedLessons}
        stepLabels={stepLabels}
        onReorder={handleReorder}
        onEdit={(l) => setModalEdit(l)}
        onDelete={handleDeleteLesson}
        saving={saving}
      />
      {modalAdd && (
        <LessonModal
          courseId={m1Course.id}
          onClose={() => setModalAdd(false)}
          onSaved={async () => { setModalAdd(false); onRefreshLessons(); }}
          createLmsLesson={createLmsLesson}
          nextSortOrder={sortedLessons.length}
        />
      )}
      {modalEdit && (
        <LessonModal
          courseId={m1Course.id}
          lesson={modalEdit}
          onClose={() => setModalEdit(null)}
          onSaved={async () => { setModalEdit(null); onRefreshLessons(); }}
          updateLmsLesson={updateLmsLesson}
        />
      )}
    </div>
  );
}

function LessonModal({
  courseId,
  lesson,
  onClose,
  onSaved,
  createLmsLesson,
  updateLmsLesson,
  nextSortOrder = 0,
}: {
  courseId: string;
  lesson?: LmsLesson | null;
  onClose: () => void;
  onSaved: () => void;
  createLmsLesson?: (d: { courseId: string; title: string; sortOrder?: number; stepType: "video" | "text" | "quiz" | "assignment"; videoUrl?: string; textContent?: string; durationMin?: number }) => Promise<LmsLesson>;
  updateLmsLesson?: (id: string, d: Partial<LmsLesson>) => Promise<LmsLesson>;
  nextSortOrder?: number;
}) {
  const isEdit = !!lesson;
  const [title, setTitle] = useState(lesson?.title || "");
  const [stepType, setStepType] = useState<"video" | "text" | "quiz" | "assignment">(lesson?.step_type || "video");
  const [videoUrl, setVideoUrl] = useState(lesson?.video_url || "");
  const [textContent, setTextContent] = useState(lesson?.text_content || "");
  const [durationMin, setDurationMin] = useState(lesson?.duration_min ?? 0);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      if (isEdit && updateLmsLesson && lesson) {
        await updateLmsLesson(lesson.id, {
          title,
          step_type: stepType,
          videoUrl: stepType === "video" ? videoUrl || undefined : undefined,
          textContent: stepType === "text" ? textContent || undefined : undefined,
          duration_min: durationMin || undefined,
        });
      } else if (!isEdit && createLmsLesson) {
        await createLmsLesson({
          courseId,
          title,
          sortOrder: nextSortOrder,
          stepType,
          videoUrl: stepType === "video" ? videoUrl || undefined : undefined,
          textContent: stepType === "text" ? textContent || undefined : undefined,
          durationMin: durationMin || undefined,
        });
      }
      onSaved();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <h4 className="font-bold text-slate-800 mb-4 flex items-center justify-between">
          {isEdit ? "แก้ไขบทเรียน" : "เพิ่มบทเรียน"}
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700"><X size={20} /></button>
        </h4>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">ชื่อบทเรียน</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-4 py-2 border border-slate-300 rounded-lg" placeholder="เช่น มาตรฐานการบริการและความปลอดภัย" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">ประเภท</label>
            <select value={stepType} onChange={(e) => setStepType(e.target.value as any)} className="w-full px-4 py-2 border border-slate-300 rounded-lg" disabled={isEdit}>
              <option value="video">วิดีโอ</option>
              <option value="text">อ่านเนื้อหา</option>
              <option value="quiz">แบบทดสอบ</option>
              <option value="assignment">ส่งงาน</option>
            </select>
          </div>
          {stepType === "video" && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Video URL (YouTube)</label>
                <input type="url" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." className="w-full px-4 py-2 border border-slate-300 rounded-lg" />
                {videoUrl && (() => {
                  const m = videoUrl.match(/(?:youtube\.com\/.*v=|youtube\.com\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
                  const vid = m ? m[1] : null;
                  return vid ? (
                    <div className="mt-2 rounded-lg overflow-hidden border border-slate-200">
                      <iframe title="preview" width="100%" height="200" src={`https://www.youtube.com/embed/${vid}`} allowFullScreen className="block" />
                    </div>
                  ) : null;
                })()}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">ระยะเวลา (นาที)</label>
                <input type="number" min={0} value={durationMin} onChange={(e) => setDurationMin(parseInt(e.target.value, 10) || 0)} className="w-full px-4 py-2 border border-slate-300 rounded-lg" />
              </div>
            </>
          )}
          {stepType === "text" && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">เนื้อหา (Rich Text)</label>
              <div className="border border-slate-300 rounded-lg overflow-hidden [&_.ql-editor]:min-h-[120px]">
                <ReactQuill theme="snow" value={textContent} onChange={setTextContent} placeholder="เนื้อหาที่ผู้เรียนต้องอ่านก่อนทำแบบทดสอบ" />
              </div>
            </div>
          )}
        </div>
        <div className="mt-6 flex gap-2">
          <button onClick={handleSave} disabled={saving || !title.trim()} className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50">
            {saving ? <Loader2 size={18} className="animate-spin inline" /> : <Save size={18} className="inline" />} บันทึก
          </button>
          <button onClick={onClose} className="px-4 py-2 bg-slate-200 text-slate-800 rounded-lg font-medium">ยกเลิก</button>
        </div>
      </div>
    </div>
  );
}

function Module1SortableLessons({
  lessons,
  stepLabels,
  onReorder,
  onEdit,
  onDelete,
  saving,
}: {
  lessons: LmsLesson[];
  stepLabels: Record<string, string>;
  onReorder: (order: string[]) => void;
  onEdit: (l: LmsLesson) => void;
  onDelete: (id: string) => void;
  saving: boolean;
}) {
  const [items, setItems] = useState<LmsLesson[]>(lessons);
  useEffect(() => setItems([...lessons]), [lessons]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    onReorder(next.map((l) => l.id));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((l) => l.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-3 max-h-80 overflow-y-auto">
          {items.map((l) => (
            <SortableLessonRow key={l.id} lesson={l} stepLabels={stepLabels} onEdit={() => onEdit(l)} onDelete={() => onDelete(l.id)} saving={saving} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableLessonRow({
  lesson,
  stepLabels,
  onEdit,
  onDelete,
  saving,
}: {
  lesson: LmsLesson;
  stepLabels: Record<string, string>;
  onEdit: () => void;
  onDelete: () => void;
  saving: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lesson.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const label = stepLabels[lesson.step_type] || lesson.step_type;
  const preview = lesson.step_type === "video" ? (lesson.video_url || "—") : lesson.step_type === "text" ? (lesson.text_content?.slice(0, 60) || "—") : "";
  return (
    <div ref={setNodeRef} style={style} className={`p-4 border border-slate-200 rounded-lg bg-slate-50 flex items-center gap-2 ${isDragging ? "opacity-80 shadow-lg" : ""}`}>
      <button type="button" {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none p-1 text-slate-400 hover:text-slate-600">
        <GripVertical size={18} />
      </button>
      <div className="flex-1 min-w-0">
        <span className="font-medium text-slate-800">{lesson.title}</span>
        <span className="ml-2 px-2 py-0.5 rounded text-xs bg-indigo-100 text-indigo-800">{label}</span>
        {preview && <p className="text-sm text-slate-500 truncate mt-1">{preview}</p>}
      </div>
      <div className="flex gap-1">
        <button type="button" onClick={onEdit} disabled={saving} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded"><Edit2 size={16} /></button>
        <button type="button" onClick={onDelete} disabled={saving} className="p-2 text-red-600 hover:bg-red-50 rounded"><Trash2 size={16} /></button>
      </div>
    </div>
  );
}

function Module2QuestionManager({
  courses,
  selectedCourseId,
  onSelectCourse,
  questions,
  onRefresh,
  onRefreshCourses,
  loading,
}: {
  courses: LmsCourse[];
  selectedCourseId: string | null;
  onSelectCourse: (id: string | null) => void;
  questions: LmsQuestion[];
  onRefresh: () => void;
  onRefreshCourses: () => void;
  loading: boolean;
}) {
  const toast = useToast();
  const [modalAdd, setModalAdd] = useState(false);
  const [modalEdit, setModalEdit] = useState<LmsQuestion | null>(null);
  const [modalImport, setModalImport] = useState(false);
  const [modalAi, setModalAi] = useState(false);
  const [saving, setSaving] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const handleDelete = async (qid: string) => {
    if (!confirm("ลบข้อนี้?")) return;
    setSaving(true);
    try {
      await deleteLmsQuestion(qid);
      onRefresh();
      toast.success("ลบข้อสำเร็จ");
    } catch (e) {
      toast.error("ลบล้มเหลว");
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async (q: LmsQuestion) => {
    setSaving(true);
    try {
      await duplicateLmsQuestion(q.id, selectedCourseId || undefined);
      onRefresh();
      toast.success("สำเนาข้อสำเร็จ");
    } catch (e) {
      toast.error("สำเนาล้มเหลว");
    } finally {
      setSaving(false);
    }
  };

  const handleReorder = async (order: string[]) => {
    if (!selectedCourseId) return;
    setSaving(true);
    try {
      await reorderLmsQuestions(selectedCourseId, order);
      onRefresh();
      toast.success("เรียงลำดับแล้ว");
    } catch (e) {
      toast.error("เรียงลำดับล้มเหลว");
    } finally {
      setSaving(false);
    }
  };

  const handleExportCsv = async () => {
    if (!selectedCourseId) return;
    try {
      const blob = await exportLmsQuestionsCsv(selectedCourseId);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `questions-${selectedCourseId}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("Export CSV เรียบร้อย");
    } catch (e) {
      toast.error("Export ล้มเหลว");
    }
  };

  const handleDuplicateCourse = async () => {
    if (!selectedCourseId) return;
    const title = courses.find((c) => c.id === selectedCourseId)?.title || "";
    if (!confirm(`สำเนาคอร์ส "${title}" พร้อมบทเรียนและคำถามทั้งหมด?`)) return;
    setSaving(true);
    try {
      await duplicateLmsCourse(selectedCourseId, `${title} (สำเนา)`);
      onRefreshCourses();
      onRefresh();
      toast.success("สำเนาคอร์สสำเร็จ");
    } catch (e: any) {
      toast.error(e?.message ?? "สำเนาคอร์สล้มเหลว");
    } finally {
      setSaving(false);
    }
  };

  const handleAiGenerate = async () => {
    if (!aiText.trim()) return;
    setAiLoading(true);
    try {
      const { questions: generated } = await aiGenerateQuestions(aiText.trim());
      if (generated.length === 0) {
        toast.error("AI ไม่สร้างคำถามได้");
        return;
      }
      if (selectedCourseId) {
        await bulkImportLmsQuestions(selectedCourseId, generated);
        onRefresh();
        toast.success(`สร้างคำถาม ${generated.length} ข้อสำเร็จ`);
        setModalAi(false);
        setAiText("");
      } else {
        setCsvText(generated.map((q) => [q.questionText, ...(q.options?.map((o) => o.text) || []), q.correctOptionId].join(",")).join("\n"));
        setModalImport(true);
        setModalAi(false);
        toast.success("สร้างคำถามแล้ว — ใส่ในหน้าต่าง Import เพื่อบันทึก");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "AI สร้างคำถามล้มเหลว");
    } finally {
      setAiLoading(false);
    }
  };

  const handleBulkImport = async () => {
    if (!selectedCourseId || !csvText.trim()) return;
    const lines = csvText.trim().split("\n").filter(Boolean);
    const questionsParsed: Array<{ questionText?: string; options?: Array<{ id: string; text: string }>; correctOptionId?: string }> = [];
    setImportError(null);
    const labels = ["a", "b", "c", "d", "e"];
    for (const line of lines) {
      const parts = line.split(",").map((p) => p.trim());
      if (parts.length >= 4) {
        const [text, ...rest] = parts;
        const correctId = rest[rest.length - 1];
        const optionTexts = rest.slice(0, -1);
        const validCorrect = ["a", "b", "c", "d", "e"].includes(correctId?.toLowerCase());
        const options = optionTexts.map((t, i) => ({ id: labels[i] || String(i), text: t }));
        questionsParsed.push({
          questionText: text,
          options: options.length >= 2 ? options : [{ id: "a", text: rest[0] || "" }, { id: "b", text: rest[1] || "" }],
          correctOptionId: validCorrect ? correctId!.toLowerCase() : labels[0],
        });
      } else {
        setImportError(`รูปแบบไม่ถูกต้อง: ${line.slice(0, 50)}... ใช้รูปแบบ question,optA,optB,optC,optD,correct_id`);
        return;
      }
    }
    if (questionsParsed.length === 0) {
      setImportError("ไม่พบข้อมูลที่ถูกต้อง");
      return;
    }
    setSaving(true);
    try {
      await bulkImportLmsQuestions(selectedCourseId, questionsParsed);
      setCsvText("");
      setModalImport(false);
      onRefresh();
      toast.success(`นำเข้า ${questionsParsed.length} ข้อสำเร็จ`);
    } catch (e: any) {
      setImportError(e?.message ?? "นำเข้าล้มเหลว");
      toast.error(e?.message ?? "นำเข้าล้มเหลว");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-4 flex justify-center"><Loader2 className="animate-spin" /> Loading...</div>;
  if (!courses.length) return (
    <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-slate-700">
      <p className="font-medium">ไม่พบคอร์ส Module 2</p>
      <p className="text-sm mt-1">รัน <code className="bg-amber-100 px-1 rounded">npm run seed:lms:m2</code> แล้วกดโหลดใหม่</p>
      <button onClick={onRefreshCourses} className="mt-3 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">โหลดใหม่</button>
    </div>
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
        <FileText size={20} /> Question Bank
      </h3>
      <p className="text-sm text-slate-600 mt-1 mb-4">เพิ่ม/ลด/แก้ไข โจทย์และตัวเลือกได้เอง</p>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">เลือกหมวดอาชีพ</label>
          <select
            value={selectedCourseId || ""}
            onChange={(e) => onSelectCourse(e.target.value || null)}
            className="px-4 py-2 border border-slate-300 rounded-lg"
          >
            <option value="">-- เลือก --</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </div>
        {selectedCourseId && (
          <div className="flex flex-wrap gap-2 items-end">
            <button
              type="button"
              onClick={() => setModalAdd(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
            >
              <Plus size={16} /> เพิ่มข้อ
            </button>
            <button
              type="button"
              onClick={() => setModalImport(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg text-sm font-medium hover:bg-slate-700"
            >
              <Upload size={16} /> นำเข้า CSV
            </button>
            <button type="button" onClick={handleExportCsv} className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">
              <Download size={16} /> Export CSV
            </button>
            <button type="button" onClick={() => setModalAi(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700">
              <Zap size={16} /> AI สร้างคำถาม
            </button>
            <button type="button" onClick={handleDuplicateCourse} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50">
              <Copy size={16} /> สำเนาคอร์ส
            </button>
            <a
              href={`${(import.meta as any).env?.VITE_APP_URL || "http://localhost:3000"}/training/course/${selectedCourseId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200"
            >
              <Eye size={16} /> ดูแบบผู้เรียน
            </a>
          </div>
        )}
      </div>
      <Module2SortableList
        questions={questions}
        onReorder={handleReorder}
        onEdit={(q) => setModalEdit(q)}
        onDelete={handleDelete}
        onDuplicate={handleDuplicate}
        saving={saving}
      />
      {modalAdd && selectedCourseId && (
        <QuestionModal
          courseId={selectedCourseId}
          onClose={() => setModalAdd(false)}
          onSaved={() => { setModalAdd(false); onRefresh(); }}
          createLmsQuestion={createLmsQuestion}
        />
      )}
      {modalEdit && (
        <QuestionModal
          courseId={modalEdit.course_id}
          question={modalEdit}
          onClose={() => setModalEdit(null)}
          onSaved={() => { setModalEdit(null); onRefresh(); }}
          updateLmsQuestion={updateLmsQuestion}
        />
      )}
      {modalImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
            <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2"><Upload size={20} /> นำเข้าจาก CSV</h4>
            <p className="text-sm text-slate-600 mb-3">รูปแบบ: question,a,b,c,d,correct_id (เช่น สร้างตารางอย่างไร?,"CREATE TABLE","ALTER","DROP",a)</p>
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              rows={10}
              placeholder="ข้อคำถาม,ตัวเลือกa,ตัวเลือกb,ตัวเลือกc,ตัวเลือกd,a"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg font-mono text-sm"
            />
            {importError && <p className="text-red-600 text-sm mt-2">{importError}</p>}
            <div className="mt-4 flex gap-2">
              <button onClick={handleBulkImport} disabled={saving || !csvText.trim()} className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50">
                {saving ? <Loader2 size={18} className="animate-spin inline" /> : null} นำเข้า
              </button>
              <button onClick={() => { setModalImport(false); setCsvText(""); setImportError(null); }} className="px-4 py-2 bg-slate-200 text-slate-800 rounded-lg font-medium">ยกเลิก</button>
            </div>
          </div>
        </div>
      )}
      {modalAi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
            <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2"><Zap size={20} /> AI สร้างคำถามจากเนื้อหา</h4>
            <p className="text-sm text-slate-600 mb-3">วางเนื้อหาหรือบทความที่ต้องการ — AI จะสร้างคำถามแบบเลือกตอบ (4 ตัวเลือก) ให้</p>
            <textarea
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              rows={8}
              placeholder="วางเนื้อหาต้นฉบับที่นี่..."
              className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm"
            />
            <div className="mt-4 flex gap-2">
              <button onClick={handleAiGenerate} disabled={aiLoading || !aiText.trim()} className="px-4 py-2 bg-violet-600 text-white rounded-lg font-medium hover:bg-violet-700 disabled:opacity-50">
                {aiLoading ? <Loader2 size={18} className="animate-spin inline" /> : <Zap size={18} className="inline" />} สร้างคำถาม
              </button>
              <button onClick={() => { setModalAi(false); setAiText(""); }} className="px-4 py-2 bg-slate-200 text-slate-800 rounded-lg font-medium">ยกเลิก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionModal({
  courseId,
  question,
  onClose,
  onSaved,
  createLmsQuestion,
  updateLmsQuestion,
}: {
  courseId: string;
  question?: LmsQuestion | null;
  onClose: () => void;
  onSaved: () => void;
  createLmsQuestion?: (d: { courseId: string; questionText: string; options: Array<{ id: string; text: string }>; correctOptionId: string; sortOrder?: number }) => Promise<LmsQuestion>;
  updateLmsQuestion?: (qid: string, d: Partial<LmsQuestion>) => Promise<LmsQuestion>;
}) {
  const isEdit = !!question;
  const [text, setText] = useState(question?.question_text || "");
  const [options, setOptions] = useState<Array<{ id: string; text: string }>>(
    (question?.options && Array.isArray(question.options) && question.options.length > 0)
      ? question.options
      : [{ id: "a", text: "" }, { id: "b", text: "" }, { id: "c", text: "" }, { id: "d", text: "" }]
  );
  const [correctId, setCorrectId] = useState(question?.correct_option_id || "a");
  const [saving, setSaving] = useState(false);

  const removeOption = (id: string) => {
    if (options.length <= 2) return;
    setOptions((p) => p.filter((o) => o.id !== id));
    if (correctId === id) setCorrectId(options.find((o) => o.id !== id)?.id || "a");
  };
  const addOption = () => {
    if (options.length >= 5) return;
    setOptions((p) => [...p, { id: ["a", "b", "c", "d", "e"][p.length], text: "" }]);
  };

  const handleSave = async () => {
    if (!text.trim()) return;
    const opts = options.filter((o) => o.text.trim());
    if (opts.length < 2) return;
    const finalCorrect = opts.some((o) => o.id === correctId) ? correctId : opts[0]?.id || "a";
    setSaving(true);
    try {
      if (isEdit && updateLmsQuestion && question) {
        await updateLmsQuestion(question.id, { question_text: text, options: opts, correct_option_id: finalCorrect });
      } else if (!isEdit && createLmsQuestion) {
        await createLmsQuestion({ courseId, questionText: text, options: opts, correctOptionId: finalCorrect });
      }
      onSaved();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <h4 className="font-bold text-slate-800 mb-4 flex items-center justify-between">
          {isEdit ? "แก้ไขข้อ" : "เพิ่มข้อใหม่"}
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700"><X size={20} /></button>
        </h4>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">ข้อความคำถาม</label>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className="w-full px-4 py-2 border border-slate-300 rounded-lg" placeholder="พิมพ์คำถาม..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">ตัวเลือก (กดเลือกว่าเป็นคำตอบที่ถูก)</label>
            {options.map((o) => (
              <div key={o.id} className="flex items-center gap-2 mb-2">
                <input
                  type="radio"
                  name="correct"
                  checked={correctId === o.id}
                  onChange={() => setCorrectId(o.id)}
                  className="w-4"
                />
                <span className="text-slate-600 w-6">{o.id}.</span>
                <input
                  type="text"
                  value={o.text}
                  onChange={(e) => setOptions((prev) => prev.map((p) => (p.id === o.id ? { ...p, text: e.target.value } : p)))}
                  placeholder={`ตัวเลือก ${o.id}`}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg"
                />
                {options.length > 2 && (
                  <button type="button" onClick={() => removeOption(o.id)} className="text-red-500 hover:text-red-700 text-sm">ลบ</button>
                )}
              </div>
            ))}
            {options.length < 5 && (
              <button type="button" onClick={addOption} className="text-sm text-indigo-600 hover:text-indigo-800 mt-1">+ เพิ่มตัวเลือก</button>
            )}
          </div>
        </div>
        <div className="mt-6 flex gap-2">
          <button onClick={handleSave} disabled={saving || !text.trim()} className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50">
            {saving ? <Loader2 size={18} className="animate-spin inline" /> : <Save size={18} className="inline" />} บันทึก
          </button>
          <button onClick={onClose} className="px-4 py-2 bg-slate-200 text-slate-800 rounded-lg font-medium">ยกเลิก</button>
        </div>
      </div>
    </div>
  );
}

function Module2SortableList({
  questions,
  onReorder,
  onEdit,
  onDelete,
  onDuplicate,
  saving,
}: {
  questions: LmsQuestion[];
  onReorder: (order: string[]) => void;
  onEdit: (q: LmsQuestion) => void;
  onDelete: (qid: string) => void;
  onDuplicate: (q: LmsQuestion) => void;
  saving: boolean;
}) {
  const [items, setItems] = useState<LmsQuestion[]>([]);
  useEffect(() => {
    setItems([...questions].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));
  }, [questions]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    onReorder(next.map((q) => q.id));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((q) => q.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {items.map((q) => (
            <SortableQuestionRow
              key={q.id}
              q={q}
              onEdit={() => onEdit(q)}
              onDelete={() => onDelete(q.id)}
              onDuplicate={() => onDuplicate(q)}
              saving={saving}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableQuestionRow({
  q,
  onEdit,
  onDelete,
  onDuplicate,
  saving,
}: {
  q: LmsQuestion;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  saving: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: q.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-4 border border-slate-200 rounded-lg bg-slate-50 flex items-start gap-2 ${isDragging ? "opacity-80 shadow-lg" : ""}`}
    >
      <button type="button" {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none p-1 text-slate-400 hover:text-slate-600 mt-1">
        <GripVertical size={18} />
      </button>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-slate-800">{q.question_text}</div>
        <div className="mt-2 text-sm text-slate-600">
          ตัวเลือก: {Array.isArray(q.options) ? q.options.map((o) => o.text).join(" | ") : "—"}
          <span className="ml-2 text-green-800">✓ ถูก: {q.correct_option_id}</span>
        </div>
      </div>
      <div className="flex gap-1 flex-shrink-0">
        <button type="button" onClick={onEdit} disabled={saving} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded" title="แก้ไข">
          <Edit2 size={16} />
        </button>
        <button type="button" onClick={onDuplicate} disabled={saving} className="p-2 text-slate-600 hover:bg-slate-100 rounded" title="สำเนา">
          <Copy size={16} />
        </button>
        <button type="button" onClick={onDelete} disabled={saving} className="p-2 text-red-600 hover:bg-red-50 rounded" title="ลบ">
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

function AssignmentsGradingView({
  submissions,
  onRefresh,
  onGrade,
  toast,
}: {
  submissions: AssignmentSubmission[];
  onRefresh: () => void;
  onGrade: (id: string, status: "passed" | "failed", adminFeedback?: string) => Promise<unknown>;
  toast?: { success: (m: string) => void; error: (m: string) => void };
}) {
  const [grading, setGrading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  const handleGrade = async (id: string, status: "passed" | "failed") => {
    setGrading(id);
    try {
      await onGrade(id, status, feedback[id]);
      onRefresh();
      toast?.success(status === "passed" ? "อนุมัติแล้ว" : "ไม่อนุมัติแล้ว");
    } catch (e) {
      toast?.error("ตรวจสอบล้มเหลว");
    } finally {
      setGrading(null);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold text-slate-800">{submissions.length} รายการรอตรวจ</h3>
      <p className="text-sm text-slate-600 mt-1 mb-4">กดอนุมัติ/ไม่อนุมัติ พร้อม feedback</p>
      <div className="space-y-4">
        {submissions.length === 0 ? (
          <p className="text-slate-500">ไม่มีรายการรอตรวจ</p>
        ) : (
          submissions.map((s) => (
            <div key={s.id} className="p-4 border border-slate-200 rounded-lg bg-slate-50">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium">{s.full_name || s.email || s.id}</p>
                  <p className="text-sm text-slate-600">{s.course_title} — {s.lesson_title}</p>
                  <p className="text-xs text-slate-500">{new Date(s.submitted_at).toLocaleString()}</p>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Feedback"
                    value={feedback[s.id] || ""}
                    onChange={(e) => setFeedback((f) => ({ ...f, [s.id]: e.target.value }))}
                    className="px-2 py-1 border rounded text-sm w-40"
                  />
                  <button
                    type="button"
                    onClick={() => handleGrade(s.id, "passed")}
                    disabled={grading === s.id}
                    className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50"
                  >
                    {grading === s.id ? <Loader2 size={14} className="animate-spin inline" /> : "ผ่าน"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleGrade(s.id, "failed")}
                    disabled={grading === s.id}
                    className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:opacity-50"
                  >
                    ไม่ผ่าน
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
