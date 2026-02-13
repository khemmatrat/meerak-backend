// ...existing code...
import React, { useState } from 'react';
import type { Quiz, Question, Option } from '../types'; // <-- type-only import

type Props = {
  quiz: Quiz;
  onSubmit: (answers: Record<string, any>) => Promise<{ score: number; passed: boolean; attempts: number }>;
};

/**
 * Quiz UI supporting mcq, multi, short.
 * Shows loading state and result summary.
 */
export default function QuizComponent({ quiz, onSubmit }: Props) { // <-- renamed component
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ score: number; passed: boolean; attempts: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleOption = (q: Question, opt: Option) => {
    if (q.type === 'mcq') setAnswers((s) => ({ ...s, [q.id]: opt.id }));
    if (q.type === 'multi') {
      setAnswers((s) => {
        const prev: string[] = Array.isArray(s[q.id]) ? s[q.id] : [];
        const exists = prev.includes(opt.id);
        const next = exists ? prev.filter((x) => x !== opt.id) : [...prev, opt.id];
        return { ...s, [q.id]: next };
      });
    }
  };

  const handleShort = (q: Question, v: string) => {
    setAnswers((s) => ({ ...s, [q.id]: v }));
  };

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await onSubmit(answers);
      setResult(res);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to submit quiz');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4 bg-white rounded shadow">
      <h3 className="text-lg font-semibold mb-4">{quiz.title ?? 'Quiz'}</h3>
      <div className="space-y-6">
        {quiz.questions.map((q) => (
          <div key={q.id}>
            <div className="font-medium mb-2">{q.text}</div>

            {q.type === 'mcq' && (q.options ?? []).map((opt) => (
              <label key={opt.id} className="flex items-center space-x-2 mb-2">
                <input type="radio" name={q.id} checked={answers[q.id] === opt.id} onChange={() => handleOption(q, opt)} className="form-radio" />
                <span>{opt.text}</span>
              </label>
            ))}

            {q.type === 'multi' && (q.options ?? []).map((opt) => (
              <label key={opt.id} className="flex items-center space-x-2 mb-2">
                <input type="checkbox" checked={Array.isArray(answers[q.id]) ? answers[q.id].includes(opt.id) : false} onChange={() => handleOption(q, opt)} className="form-checkbox" />
                <span>{opt.text}</span>
              </label>
            ))}

            {q.type === 'short' && (
              <input type="text" value={answers[q.id] ?? ''} onChange={(e) => handleShort(q, e.target.value)} className="w-full border rounded px-2 py-1" />
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center space-x-3">
        <button onClick={submit} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded">
          {loading ? 'กำลังส่ง...' : 'ส่งคำตอบ'}
        </button>
        {error && <div className="text-red-600">{error}</div>}
      </div>

      {result && (
        <div className="mt-4 p-3 border rounded bg-gray-50">
          <div>คะแนน: {result.score}%</div>
          <div>{result.passed ? 'สถานะ: ผ่าน ✅' : 'สถานะ: ไม่ผ่าน ❌'}</div>
          <div>จำนวนครั้ง: {result.attempts}</div>
        </div>
      )}
    </div>
  );
}
// ...existing code...