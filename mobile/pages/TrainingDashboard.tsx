import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage, type Language } from '../context/LanguageContext';
import { useVIPTheme } from '../context/VIPThemeContext';
import { adminService } from '../services/adminService';
import { trainingService } from '../services/trainingService';
import { MockApi } from '../services/mockApi';
import { Course, Progress } from '../types';
import CertificateView from '../components/CertificateView';
import { BookOpen, Play, Lock, CheckCircle, BarChart3, Trophy, Video, ShieldAlert, ClipboardList } from 'lucide-react';
import { UserRole } from '../types';
import { getProviderOnboardingStatus } from '../services/nexusExamService';
import { NEXUS_PROFESSIONAL_COURSE_ID } from '../services/trainingService';

/** คีย์ใหม่ — อ่านคีย์เก่า meerak_nexus_exam_results ครั้งแรกแล้วย้ายให้อัตโนมัติ */
const AQOND_TRAINING_EXAM_RESULTS_KEY = 'meerak_aqond_training_exam_results';
const LEGACY_EXAM_RESULTS_KEY = 'meerak_nexus_exam_results';

function migrateLegacyExamResultsKey(): void {
  try {
    if (localStorage.getItem(AQOND_TRAINING_EXAM_RESULTS_KEY)) return;
    const legacy = localStorage.getItem(LEGACY_EXAM_RESULTS_KEY);
    if (legacy) {
      localStorage.setItem(AQOND_TRAINING_EXAM_RESULTS_KEY, legacy);
    }
  } catch {
    /* ignore */
  }
}

/**
 * ข้อความจาก i18n ที่ยังอ้าง "Nexus" → ปรับเป็นชื่อแพลตฟอร์ม AQOND ให้เป็นธรรมชาติ (ไทย / ภาษาอื่นใช้สำนวนอังกฤษ)
 * ใช้เฉพาะบนหน้านี้
 */
function aqondTrainingCopy(text: string, lang: Language): string {
  if (!text) return text;
  if (lang === 'th') {
    return text
      .replace(/มาตรฐานการบริการและความปลอดภัยของ Nexus/g, 'มาตรฐานการบริการและความปลอดภัยของ AQOND')
      .replace(/ลำดับขั้นตอน Nexus Exam/g, 'ขั้นตอนการอบรมและสอบมาตรฐาน AQOND')
      .replace(/Nexus Exam — Module 2 & 3/g, 'การสอบมาตรฐาน AQOND — โมดูล 2 และ 3')
      .replace(/\bNexus\b/g, 'AQOND')
      .replace(/\bNEXUS\b/g, 'AQOND');
  }
  return text
    .replace(/"Nexus Service Standards & Safety"/g, '"AQOND Service Standards & Safety"')
    .replace(/Nexus Exam Steps/g, 'AQOND training & exam steps')
    .replace(/Nexus Exam — Module 2 & 3/g, 'AQOND certification — Modules 2 & 3')
    .replace(/\bNexus\b/g, 'AQOND')
    .replace(/\bNEXUS\b/g, 'AQOND');
}

/**
 * User training progress dashboard with certificate view
 */
export default function TrainingDashboard() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  /** ข้อความ training บนหน้านี้ — แปลงชื่อแบรนด์เป็น AQOND */
  const tr = useCallback((key: string) => aqondTrainingCopy(t(key), language), [t, language]);
  const { themeId } = useVIPTheme();
  const navigate = useNavigate();
  const trainingTierClass = `training-container training-${themeId}`;
  const [progress, setProgress] = useState<Progress[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [stats, setStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'courses' | 'progress' | 'certificates'>('overview');
  const [providerStatus, setProviderStatus] = useState<string | null>(null);
  const [onboardingStatus, setOnboardingStatus] = useState<string | null>(null);
  const [kycStatus, setKycStatus] = useState<string | null>(null);
  const [examResults, setExamResults] = useState<{ module: number; passed: boolean }[]>([]);
  const location = useLocation();

  useEffect(() => {
    migrateLegacyExamResultsKey();
  }, []);

  // รับ state ที่ส่งมาจากหน้าแบบทดสอบเมื่อผ่าน Module 1 — แสดง Module 2 ทันที + เก็บลง localStorage
  useEffect(() => {
    const state = location.state as { module1JustPassed?: boolean; examResults?: { module: number; passed: boolean }[]; onboardingStatus?: string } | null;
    if (state?.module1JustPassed && Array.isArray(state.examResults) && state.examResults.length > 0) {
      setExamResults(state.examResults);
      try {
        localStorage.setItem(AQOND_TRAINING_EXAM_RESULTS_KEY, JSON.stringify(state.examResults));
      } catch (_) {}
      if (state.onboardingStatus) setOnboardingStatus(state.onboardingStatus);
      setProviderStatus('PENDING_TEST');
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);

  const fetchOnboarding = React.useCallback(async () => {
    if (!user?.id || user?.role !== UserRole.PROVIDER) return;
    try {
      const onboarding = await getProviderOnboardingStatus(user.id);
      setProviderStatus(onboarding?.provider_status ?? null);
      setOnboardingStatus(onboarding?.onboarding_status ?? null);
      setKycStatus(onboarding?.kyc_status ?? null);
      const results = onboarding?.exam_results ?? [];
      const next = results.map((r: any) => ({ module: r.module, passed: r.passed }));
      if (next.length > 0) {
        try {
          localStorage.setItem(AQOND_TRAINING_EXAM_RESULTS_KEY, JSON.stringify(next));
        } catch (_) {}
      }
      // อย่าเขียนทับด้วย [] — ถ้า backend คืนว่าง (user ไม่เจอ/คนละ DB) ให้คงค่าที่มีอยู่ (เช่น จาก state หลังทำข้อสอบผ่าน)
      setExamResults((prev) => (next.length > 0 ? next : prev));
    } catch (_) {
      try {
        const fallback = await MockApi.getProviderOnboardingStatus(user.id);
        setProviderStatus(fallback?.provider_status ?? null);
      } catch (_2) {}
    }
  }, [user?.id, user?.role]);

  // โหลดหลัก + รีเฟรชทุกครั้งที่เข้า Training Dashboard (รวมหลังทำ Module 1 เสร็จ) เพื่อให้เห็น Module 2 ต่อ
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const c = await trainingService.getCourses();
        if (!cancelled) setCourses(c);

        if (user?.id) {
          const [p, s] = await Promise.all([
            trainingService.getProgress(user.id),
            adminService.getUserProgressStats(user.id),
          ]);
          if (!cancelled) {
            setProgress(p);
            setStats(s);
            // โหลดผลสอบจาก localStorage ถ้ามี (เผื่อ backend คืนว่างหรือเปิดเครื่องใหม่)
            try {
              const raw = localStorage.getItem(AQOND_TRAINING_EXAM_RESULTS_KEY);
              if (raw) {
                const stored = JSON.parse(raw);
                if (Array.isArray(stored) && stored.length > 0) {
                  setExamResults((prev) => (prev.length > 0 ? prev : stored));
                }
              }
            } catch (_) {}
          }
          if (user?.role === UserRole.PROVIDER) await fetchOnboarding();
        }
      } catch (err) {
        if (!cancelled) console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, user?.role, location.pathname, fetchOnboarding]);

  // เมื่อผู้ใช้กลับมาเปิดแท็บ/หน้าต่าง ให้รีเฟรชผลสอบ (เผื่อกลับจากทำข้อสอบแล้วเปิดแท็บเดิม)
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && user?.id && user?.role === UserRole.PROVIDER) {
        fetchOnboarding();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [user?.id, user?.role, fetchOnboarding]);

  if (loading) return (
    <div className="p-6 text-center">
      <div className="inline-block animate-spin">⏳</div> {tr('training.loading')}
    </div>
  );

  const completedCount = progress.filter((p) => p.completed).length;
  const avgScore = progress.length > 0 ? Math.round(progress.reduce((s, p) => s + (p.bestScore ?? 0), 0) / progress.length) : 0;

  // Helper: get course progress — Module 1 ผ่านแล้วต้องไม่ขึ้น 0% (ใช้ทั้งจาก progress และจาก examResults)
  const getCourseProgress = (courseId: string): Progress | undefined => {
    const p = progress.find(pr => pr.courseId === courseId);
    if (courseId === NEXUS_PROFESSIONAL_COURSE_ID) {
      const passedFromBackend = examResults.some(r => r.module === 1 && r.passed);
      const passedFromProgress = p?.completed === true;
      if (passedFromBackend || passedFromProgress) {
        const base = p ?? { courseId, lessonId: `lesson-${courseId}`, watched: false, completed: false, attempts: 0, lastAttemptAt: null };
        const score = (p?.bestScore != null && p.bestScore > 0) ? p.bestScore : 85;
        return { ...base, completed: true, bestScore: Math.max(score, 85), watched: true };
      }
    }
    return p;
  };

  const isProvider = user?.role === UserRole.PROVIDER || (user?.role as string)?.toLowerCase() === 'provider';

  const StepCard = ({ title, desc, done, onClick }: { title: string; desc: string; done: boolean; onClick: () => void }) => (
    <button
      type="button"
      onClick={onClick}
      className={`p-4 rounded-xl border-2 text-left transition-all ${
        done ? 'border-green-300 bg-green-50' : 'border-slate-200 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50/50'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-slate-800">{title}</span>
        {done && <CheckCircle className="text-green-600 flex-shrink-0" size={20} />}
      </div>
      <p className="text-sm text-slate-600">{desc}</p>
    </button>
  );

  return (
    <div className={trainingTierClass}>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6 md:p-10 training-inner">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-3 bg-indigo-100 rounded-lg">
              <BookOpen className="text-indigo-600" size={32} />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-gray-900">{tr('training.dashboard_title')}</h1>
              <p className="text-gray-600 text-sm mt-1">{tr('training.dashboard_subtitle')}</p>
            </div>
          </div>
        </div>

        {/* Provider Onboarding: ต้องผ่านแบบทดสอบก่อนรับงาน — แสดงสำหรับทุก Provider ที่ยังไม่ Verified (รวม user ใหม่) */}
        {user?.role === UserRole.PROVIDER && providerStatus !== 'VERIFIED_PROVIDER' && (
          <div className="mb-8 p-6 bg-amber-50 border-2 border-amber-400 rounded-xl flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <ShieldAlert className="text-amber-600 flex-shrink-0" size={32} />
              <div>
                <h3 className="font-bold text-amber-900">
                  {onboardingStatus === 'NOT_STARTED' || !examResults.length
                    ? tr('training.mandatory_exam')
                    : tr('training.exam_incomplete')}
                </h3>
                <p className="text-amber-800 text-sm mt-1">
                  {onboardingStatus === 'NOT_STARTED' || !examResults.some(r => r.module === 1 && r.passed)
                    ? tr('training.exam_instruction_m1')
                    : tr('training.exam_instruction_after_m1')}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setTab('courses');
                if (examResults.some(r => r.module === 1 && r.passed)) navigate('/training/nexus-module2');
                else navigate('/training/course/nexus-professional-standards');
              }}
              className="px-6 py-3 bg-amber-600 text-white font-semibold rounded-lg hover:bg-amber-700 shadow"
            >
              {examResults.some(r => r.module === 1 && r.passed) ? tr('training.go_to_module2') : tr('training.go_to_exam')}
            </button>
          </div>
        )}

        {providerStatus === 'VERIFIED_PROVIDER' && (
          <div className="mb-6 px-4 py-2 bg-green-100 border border-green-400 rounded-lg inline-flex items-center gap-2 text-green-800 text-sm font-medium">
            <CheckCircle size={18} /> {tr('training.verified_provider')}
          </div>
        )}

        {/* เรียนจบครบแล้ว แต่ยังไม่ยืนยันตัวตน — กระตุ้นให้ไปทำ KYC */}
        {user?.role === UserRole.PROVIDER && providerStatus !== 'VERIFIED_PROVIDER' && (onboardingStatus === 'TRAINING_COMPLETE' || examResults.some(r => r.module === 3)) && !['verified', 'approved'].includes((kycStatus || '').toLowerCase()) && (
          <div className="mb-6 p-5 bg-blue-50 border-2 border-blue-300 rounded-xl">
            <p className="font-bold text-blue-900">{tr('training.training_done_kyc')}</p>
            <p className="text-blue-800 text-sm mt-1">{tr('training.training_done_kyc_desc')}</p>
            <button
              type="button"
              onClick={() => navigate('/profile')}
              className="mt-3 px-5 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700"
            >
              {tr('training.go_verify_identity')}
            </button>
          </div>
        )}

        {/* หลังผ่าน Module 1: แสดงปุ่มชัดเจนให้ไปทำ Module 2 ต่อ */}
        {user?.role === UserRole.PROVIDER && examResults.some(r => r.module === 1 && r.passed) && !examResults.some(r => r.module === 2 && r.passed) && (
          <div className="mb-6 p-5 bg-emerald-50 border-2 border-emerald-400 rounded-xl">
            <p className="font-semibold text-emerald-900 mb-2">✅ {tr('training.passed_m1_do_m2')}</p>
            <p className="text-emerald-800 text-sm mb-3">{tr('training.m2_instruction')}</p>
            <button
              type="button"
              onClick={() => navigate('/training/nexus-module2')}
              className="px-5 py-2.5 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 shadow"
            >
              {tr('training.go_to_module2')}
            </button>
          </div>
        )}

        {/* AQOND training flow: Academy → M1 → M2 → M3 → Certificate (Provider) — กดการ์ดเพื่อไปขั้นถัดไป */}
        {user?.role === UserRole.PROVIDER && (
          <section className="mb-8 p-6 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
              <ClipboardList size={22} /> {tr('training.nexus_flow_title')}
            </h3>
            <p className="text-slate-600 text-sm mb-4">{tr('training.nexus_flow_desc')}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StepCard
                title={tr('training.step_academy_m1')}
                desc={tr('training.step_academy_desc')}
                done={examResults.some(r => r.module === 1 && r.passed)}
                onClick={() => navigate('/training/course/nexus-professional-standards')}
              />
              <StepCard
                title={tr('training.step_m2')}
                desc={tr('training.step_m2_desc')}
                done={examResults.some(r => r.module === 2 && r.passed)}
                onClick={() => navigate('/training/nexus-module2')}
              />
              <StepCard
                title={tr('training.step_m3')}
                desc={tr('training.step_m3_desc')}
                done={examResults.some(r => r.module === 3)}
                onClick={() => navigate('/training/nexus-module3')}
              />
              <StepCard
                title={tr('training.step_cert')}
                desc={tr('training.step_cert_desc')}
                done={onboardingStatus === 'QUALIFIED' || providerStatus === 'VERIFIED_PROVIDER'}
                onClick={() => navigate('/training/certificate-readiness')}
              />
            </div>
          </section>
        )}

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-8 border-b border-gray-200 pb-4">
          {[
            { id: 'overview', label: tr('training.overview'), icon: BarChart3 },
            { id: 'courses', label: tr('training.courses'), icon: Video },
            { id: 'progress', label: tr('training.progress'), icon: Play },
            { id: 'certificates', label: tr('training.certificates'), icon: Trophy },
          ].map(tabItem => {
            const Icon = tabItem.icon;
            return (
              <button
                key={tabItem.id}
                onClick={() => setTab(tabItem.id as any)}
                className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-all ${
                  tab === tabItem.id
                    ? 'bg-indigo-600 text-white shadow-lg'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                <Icon size={18} />
                {tabItem.label}
              </button>
            );
          })}
        </div>

        {/* Overview Tab */}
        {tab === 'overview' && (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-gray-600 text-sm font-medium mb-2">{tr('training.total_courses')}</p>
                    <p className="text-3xl font-bold text-gray-900">{courses.length}</p>
                  </div>
                  <div className="p-3 bg-blue-100 rounded-lg">
                    <BookOpen className="text-blue-600" size={24} />
                  </div>
                </div>
              </div>

              <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-gray-600 text-sm font-medium mb-2">{tr('training.completed')}</p>
                    <p className="text-3xl font-bold text-green-600">{completedCount}</p>
                  </div>
                  <div className="p-3 bg-green-100 rounded-lg">
                    <CheckCircle className="text-green-600" size={24} />
                  </div>
                </div>
              </div>

              <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-gray-600 text-sm font-medium mb-2">{tr('training.avg_score')}</p>
                    <p className="text-3xl font-bold text-yellow-600">{avgScore}%</p>
                  </div>
                  <div className="p-3 bg-yellow-100 rounded-lg">
                    <BarChart3 className="text-yellow-600" size={24} />
                  </div>
                </div>
              </div>

              <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-gray-600 text-sm font-medium mb-2">{tr('training.completion_rate')}</p>
                    <p className="text-3xl font-bold text-purple-600">
                      {courses.length > 0 ? Math.round((completedCount / courses.length) * 100) : 0}%
                    </p>
                  </div>
                  <div className="p-3 bg-purple-100 rounded-lg">
                    <Trophy className="text-purple-600" size={24} />
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <h3 className="text-lg font-bold mb-4">{tr('training.quick_actions')}</h3>
              <button
                onClick={() => setTab('courses')}
                className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition shadow-md"
              >
                👉 {tr('training.start_learning')}
              </button>
            </div>
          </div>
        )}

        {/* Courses Tab — แสดง Course Cards */}
        {tab === 'courses' && (
          <div>
            {/* Module 2 / Module 3 — ไว้ด้านบนในแท็บ Courses เพื่อให้เห็นทันที (Provider หรือใครที่อยู่ใน flow) */}
            {(isProvider || examResults.length > 0) && (
              <div className="mb-8 p-6 bg-slate-50 rounded-2xl border-2 border-slate-200">
                <h3 className="text-xl font-bold text-slate-800 mb-4">{tr('training.nexus_m2_m3')}</h3>
                <p className="text-slate-600 text-sm mb-4">{tr('training.after_m1_tap')}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate('/training/nexus-module2')}
                    onKeyDown={(e) => e.key === 'Enter' && navigate('/training/nexus-module2')}
                    className="p-5 rounded-xl border-2 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-500 transition-all cursor-pointer text-left"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-emerald-900">{tr('training.module2')}</span>
                      {examResults.some(r => r.module === 2 && r.passed) ? (
                        <span className="px-2 py-0.5 bg-green-500 text-white text-xs font-bold rounded-full">✓ {tr('training.passed')}</span>
                      ) : (
                        <span className="text-emerald-700 text-sm">{tr('training.technical_skills')}</span>
                      )}
                    </div>
                    <p className="text-emerald-800 text-sm">{tr('training.select_category_exam')}</p>
                  </div>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate('/training/nexus-module3')}
                    onKeyDown={(e) => e.key === 'Enter' && navigate('/training/nexus-module3')}
                    className="nexus-module3-card p-5 rounded-xl border-2 border-slate-300 bg-white hover:bg-slate-50 hover:border-slate-400 transition-all cursor-pointer text-left"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-slate-900">{tr('training.module3')}</span>
                      {examResults.some(r => r.module === 3) ? (
                        <span className="px-2 py-0.5 bg-green-500 text-white text-xs font-bold rounded-full">✓ {tr('training.passed')}</span>
                      ) : (
                        <span className="text-slate-600 text-sm">{tr('training.mindset_scenario')}</span>
                      )}
                    </div>
                    <p className="text-slate-700 text-sm">{tr('training.scenario_exam')}</p>
                  </div>
                </div>
              </div>
            )}

            <h3 className="text-2xl font-bold mb-6 text-gray-900">{tr('training.available_courses')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {courses.map(course => {
                const prog = getCourseProgress(course.id);
                const isCompleted = prog?.completed;
                const hasQuiz = course.lessons?.[0]?.quiz?.questions?.length > 0;

                return (
                  <div
                    key={course.id}
                    className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg hover:border-indigo-300 transition-all cursor-pointer"
                    onClick={() => navigate(`/training/course/${course.id}`)}
                  >
                    {/* Course Header */}
                    <div className="h-40 bg-gradient-to-br from-indigo-500 to-indigo-600 p-6 text-white flex flex-col justify-between">
                      <div className="flex justify-between items-start">
                        <Video size={32} />
                        {isCompleted ? (
                          <span className="px-3 py-1 bg-green-500 text-white text-xs font-bold rounded-full">
                            ✓ {tr('training.completed')}
                          </span>
                        ) : (
                          <span className="px-3 py-1 bg-slate-600 text-white text-xs font-bold rounded-full">
                            {prog?.watched ? '⏳ In Progress' : '🔒 Not Started'}
                          </span>
                        )}
                      </div>
                      <h3 className="text-lg font-bold">{course.title}</h3>
                    </div>

                    {/* Course Body */}
                    <div className="p-6">
                      <p className="text-gray-600 text-sm mb-4 line-clamp-2">{course.description}</p>

                      {/* Progress Bar */}
                      {prog && (
                        <div className="mb-4">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-semibold text-gray-700">Progress</span>
                            <span className="text-xs font-bold text-indigo-600">{Math.round(prog.bestScore || 0)}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-indigo-600 h-2 rounded-full transition-all"
                              style={{ width: `${prog.bestScore || 0}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Course Meta */}
                      <div className="space-y-2 mb-4 text-sm text-gray-600">
                        <div className="flex items-center gap-2">
                          <Video size={16} />
                          <span>{hasQuiz ? tr('training.video_quiz').replace('{n}', String(course.lessons?.[0]?.quiz?.questions?.length || 0)) : tr('training.video_only')}</span>
                        </div>
                      </div>

                      {/* CTA Button */}
                      <button
                        className={`w-full py-2 rounded-lg font-semibold transition ${
                          isCompleted
                            ? 'bg-gray-100 text-gray-600 cursor-default'
                            : 'bg-indigo-600 text-white hover:bg-indigo-700'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/training/course/${course.id}`);
                        }}
                      >
                        {isCompleted ? `✓ ${tr('training.view_certificate')}` : prog?.watched ? `▶ ${tr('training.continue_course')}` : `▶ ${tr('training.start_course')}`}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {courses.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500 text-lg">No courses available yet.</p>
              </div>
            )}
          </div>
        )}

        {/* Progress Tab */}
        {tab === 'progress' && (
          <div>
            <h3 className="text-2xl font-bold mb-6 text-gray-900">Your Progress</h3>
            <div className="space-y-4">
              {stats.length > 0 ? (
                stats.map((stat) => (
                  <div key={stat.courseId} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="text-lg font-bold text-gray-900">{stat.courseName}</h4>
                      <span className="text-sm font-semibold text-indigo-600">{stat.percentage}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3 mb-3 overflow-hidden">
                      <div
                        className={`h-3 rounded-full transition-all ${
                          stat.percentage === 100 ? 'bg-green-500' : 'bg-indigo-600'
                        }`}
                        style={{ width: `${stat.percentage}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>{stat.completed}/{stat.total} lessons completed</span>
                      <span>Best Score: <strong>{stat.bestScore}%</strong></span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                  <p className="text-gray-500">No progress yet. Start a course to see your progress here.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Certificates Tab */}
        {tab === 'certificates' && <CertificateView />}
      </div>
      </div>
    </div>
  );
}