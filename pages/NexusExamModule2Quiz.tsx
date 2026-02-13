import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getNexusQuestions,
  submitNexusExam,
  NEXUS_TIME_LIMIT_MINUTES,
  type NexusQuestion,
} from '../services/nexusExamService';
import { Clock, AlertCircle } from 'lucide-react';

const TOTAL_SECONDS = NEXUS_TIME_LIMIT_MINUTES.module2 * 60;
const PASS_PERCENT = 80;

export default function NexusExamModule2Quiz() {
  const { category } = useParams<{ category: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<NexusQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ passed: boolean; score: number } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(TOTAL_SECONDS);
  const [startedAt] = useState(() => new Date().toISOString());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!category) {
      setError('ไม่พบหมวดอาชีพ');
      setLoading(false);
      return;
    }
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getNexusQuestions(2, decodeURIComponent(category));
        if (mounted) setQuestions(res.questions || []);
      } catch (err: any) {
        if (mounted) setError(err?.message ?? 'โหลดข้อสอบไม่สำเร็จ');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [category]);

  useEffect(() => {
    if (questions.length === 0 || result) return;
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [questions.length, result]);

  const timeUp = secondsLeft <= 0;
  const minutes = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;

  const handleSubmit = async () => {
    if (!user?.id || !category) return;
    setSubmitting(true);
    try {
      const timeSpent = TOTAL_SECONDS - secondsLeft;
      const res = await submitNexusExam({
        userId: user.id,
        module: 2,
        category: decodeURIComponent(category),
        answers,
        time_spent_seconds: timeSpent,
        started_at: startedAt,
      });
      setResult({ passed: res.passed, score: res.score });
      if (res.passed) {
        if (res.onboarding_status === 'QUALIFIED') {
          setTimeout(() => navigate('/training/certificate-readiness'), 2500);
        } else {
          setTimeout(() => navigate('/training/dashboard'), 2500);
        }
      }
    } catch (err: any) {
      setError(err?.message ?? 'ส่งคำตอบไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-600">กำลังโหลดข้อสอบ...</p>
      </div>
    );
  }
  if (error && questions.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6">
        <p className="text-red-600 mb-4">{error}</p>
        <button onClick={() => navigate('/training/nexus-module2')} className="text-indigo-600">
          ← เลือกอาชีพใหม่
        </button>
      </div>
    );
  }

  if (result) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-white p-6">
        <div className={`rounded-2xl p-8 max-w-md w-full text-center ${result.passed ? 'bg-green-50 border-2 border-green-200' : 'bg-amber-50 border-2 border-amber-200'}`}>
          <p className="text-2xl font-bold text-slate-800">
            {result.passed ? 'ผ่าน Module 2' : 'ไม่ผ่าน'}
          </p>
          <p className="mt-2 text-lg text-slate-600">คะแนน {result.score}% (ผ่านที่ {PASS_PERCENT}%)</p>
          {result.passed && (
            <p className="mt-4 text-sm text-green-800">
              กำลังนำคุณไปหน้าถัดไป...
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-800">
            Module 2 — {decodeURIComponent(category || '')}
          </h2>
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg font-mono ${secondsLeft <= 300 ? 'bg-red-100 text-red-800' : 'bg-slate-200 text-slate-800'}`}>
            <Clock size={20} />
            <span>{minutes}:{secs.toString().padStart(2, '0')}</span>
          </div>
        </div>

        {timeUp && (
          <div className="mb-6 p-4 bg-amber-100 border border-amber-400 rounded-lg flex items-center gap-2 text-amber-900">
            <AlertCircle size={24} />
            <span>เวลาหมด — กรุณาส่งคำตอบทันที</span>
          </div>
        )}

        <div className="space-y-6 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
          {questions.map((q, idx) => (
            <div key={q.id}>
              <p className="font-medium text-slate-900 mb-3">
                {idx + 1}. {q.text}
              </p>
              <div className="space-y-2">
                {(q.options || []).map((opt) => (
                  <label
                    key={opt.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition ${
                      answers[q.id] === opt.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name={q.id}
                      checked={answers[q.id] === opt.id}
                      onChange={() => setAnswers((s) => ({ ...s, [q.id]: opt.id }))}
                      className="sr-only"
                    />
                    <span className="text-slate-800">{opt.text}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <button
            onClick={handleSubmit}
            disabled={submitting || Object.keys(answers).length < questions.length}
            className="px-8 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'กำลังส่ง...' : 'ส่งคำตอบ'}
          </button>
          <button
            onClick={() => navigate('/training/nexus-module2')}
            className="text-slate-500 hover:text-slate-700 text-sm"
          >
            ยกเลิก — เลือกอาชีพใหม่
          </button>
        </div>
        {error && <p className="mt-4 text-red-600">{error}</p>}
      </div>
    </div>
  );
}
