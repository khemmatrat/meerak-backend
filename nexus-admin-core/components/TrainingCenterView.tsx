/**
 * Training Center Admin — ปรับข้อสอบ เกณฑ์คะแนน และเวลาต่อ Module
 * ควบคุมระบบที่ใช้ในแอปหลัก: TrainingDashboard, TrainingQuizPage, NexusExamModule2/3, CertificateOfReadiness
 */
import React, { useState, useEffect } from "react";
import {
  getTrainingExamConfig,
  updateTrainingExamConfig,
  ADMIN_API_BASE,
  type TrainingExamConfig,
} from "../services/adminApi";
import {
  BookOpen,
  Loader2,
  Save,
  CheckCircle,
  Clock,
  Percent,
  ListOrdered,
  AlertCircle,
} from "lucide-react";

type TabId = "overview" | "module1" | "module2" | "module3";

export const TrainingCenterView: React.FC = () => {
  const [config, setConfig] = useState<TrainingExamConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [tab, setTab] = useState<TabId>("overview");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState<Record<string, { passPercent?: number; timeLimitMin?: number; totalQuestions?: number }>>({});

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
    } catch (e: any) {
      setError(e?.message ?? "บันทึกไม่สำเร็จ");
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

  const tabs: { id: TabId; label: string }[] = [
    { id: "overview", label: "ภาพรวม" },
    { id: "module1", label: "Module 1 — จริยธรรม/ความปลอดภัย" },
    { id: "module2", label: "Module 2 — ทักษะทางเทคนิค" },
    { id: "module3", label: "Module 3 — Scenario" },
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
              className={`px-4 py-2 rounded-lg font-medium text-sm transition ${
                tab === t.id ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm flex items-center gap-2">
            <AlertCircle size={18} /> {error}
          </div>
        )}

        {tab === "overview" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card title="Module 1" desc="จริยธรรม ความปลอดภัย กฎหมาย" passPercent={m1.passPercent} timeLimitMin={m1.timeLimitMin} totalQuestions={m1.totalQuestions} />
            <Card title="Module 2" desc="ทักษะทางเทคนิคตามอาชีพ" passPercent={m2.passPercent} timeLimitMin={m2.timeLimitMin} totalQuestions={m2.totalQuestions} />
            <Card title="Module 3" desc="Scenario ทัศนคติ" passPercent={m3.passPercent} timeLimitMin={m3.timeLimitMin} totalQuestions={m3.totalQuestions} />
          </div>
        )}

        {tab === "module1" && (
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
        )}
        {tab === "module2" && (
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
      </div>
    </div>
  );
};

function Card({
  title,
  desc,
  passPercent,
  timeLimitMin,
  totalQuestions,
}: {
  title: string;
  desc: string;
  passPercent: number;
  timeLimitMin: number;
  totalQuestions: number;
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
