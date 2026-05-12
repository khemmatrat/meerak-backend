import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import {
  getNexusQuestions,
  submitNexusExam,
  NEXUS_TIME_LIMIT_MINUTES,
  type NexusQuestion,
} from '../services/nexusExamService';
import { Clock, Lightbulb } from 'lucide-react';

const TOTAL_SECONDS = NEXUS_TIME_LIMIT_MINUTES.module3 * 60;
const PROGRESS_KEY = (userId: string) => `nexus_m3_progress:${userId}`;
const PROGRESS_TTL_MS = 24 * 60 * 60 * 1000;

export default function NexusExamModule3Page() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<NexusQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(TOTAL_SECONDS);
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getNexusQuestions(3);
        if (!mounted) return;
        setQuestions(res.questions || []);
        if (user?.id) {
          try {
            const key = PROGRESS_KEY(user.id);
            const raw = localStorage.getItem(key);
            if (raw) {
              const parsed = JSON.parse(raw) as { answers?: Record<string, string>; startedAt?: string };
              if (parsed.startedAt && parsed.answers && typeof parsed.answers === 'object') {
                const started = new Date(parsed.startedAt).getTime();
                if (Date.now() - started < PROGRESS_TTL_MS) {
                  const elapsed = Math.floor((Date.now() - started) / 1000);
                  const left = Math.max(0, TOTAL_SECONDS - elapsed);
                  setAnswers(parsed.answers);
                  setStartedAt(parsed.startedAt);
                  setSecondsLeft(left);
                }
              }
            }
          } catch (_) {}
        }
      } catch (err: any) {
        if (mounted) setError(err?.message ?? t('training.load_failed'));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || Object.keys(answers).length === 0) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      try {
        localStorage.setItem(PROGRESS_KEY(user.id), JSON.stringify({ answers, startedAt }));
      } catch (_) {}
      saveTimeoutRef.current = null;
    }, 500);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [answers, startedAt, user?.id]);

  useEffect(() => {
    if (questions.length === 0 || done) return;
    timerRef.current = setInterval(() => setSecondsLeft((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [questions.length, done]);

  const clearProgress = () => {
    if (user?.id) {
      try {
        localStorage.removeItem(PROGRESS_KEY(user.id));
      } catch (_) {}
    }
  };

  const handleSubmit = async () => {
    if (!user?.id) return;
    setSubmitting(true);
    clearProgress();
    try {
      await submitNexusExam({
        userId: user.id,
        module: 3,
        answers,
        time_spent_seconds: TOTAL_SECONDS - secondsLeft,
        started_at: startedAt,
      });
      setDone(true);
      setTimeout(() => navigate('/training/certificate-readiness'), 2000);
    } catch (err: any) {
      setError(err?.message ?? 'ส่งคำตอบไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-600">{t('training.loading_exam')}</p>
      </div>
    );
  }
  if (error && questions.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6">
        <p className="text-red-600 mb-4">{error}</p>
        <button onClick={() => navigate('/training/dashboard')} className="text-indigo-600">{t('training.back_dashboard')}</button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-white p-6">
        <div className="rounded-2xl p-8 max-w-md w-full text-center bg-green-50 border-2 border-green-200">
          <p className="text-2xl font-bold text-slate-800">{t('training.module3_done')}</p>
          <p className="mt-2 text-green-800">{t('training.redirecting_cert')}</p>
        </div>
      </div>
    );
  }

  const minutes = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-800">{t('training.module3_title')}</h2>
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg font-mono bg-slate-200 text-slate-800">
            <Clock size={20} /> {minutes}:{secs.toString().padStart(2, '0')}
          </div>
        </div>
        <div className="space-y-8 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
          {questions.map((q, idx) => (
            <div key={q.id} className="border-b border-slate-100 last:border-0 pb-8 last:pb-0">
              <p className="font-medium text-slate-900 mb-3">{idx + 1}. {q.text}</p>
              <div className="space-y-2 mb-4">
                {(q.options || []).map((opt) => (
                  <label
                    key={opt.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition ${answers[q.id] === opt.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <input type="radio" name={q.id} checked={answers[q.id] === opt.id} onChange={() => setAnswers((s) => ({ ...s, [q.id]: opt.id }))} className="sr-only" />
                    <span className="text-slate-800">{opt.text}</span>
                  </label>
                ))}
              </div>
              {answers[q.id] && q.recommended_action && (
                <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl flex gap-3">
                  <Lightbulb className="text-amber-600 flex-shrink-0" size={22} />
                  <div>
                    <p className="text-sm font-semibold text-amber-900">{t('training.recommended_action')}</p>
                    <p className="text-amber-800 text-sm mt-1">{q.recommended_action}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <button onClick={handleSubmit} disabled={submitting} className="px-8 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50">
            {submitting ? t('training.submitting') : t('training.submit_view_cert')}
          </button>
          <button onClick={() => { clearProgress(); navigate('/training/dashboard'); }} className="text-slate-500 hover:text-slate-700 text-sm">{t('training.cancel')}</button>
        </div>
        {error && <p className="mt-4 text-red-600">{error}</p>}
      </div>
    </div>
  );
}
