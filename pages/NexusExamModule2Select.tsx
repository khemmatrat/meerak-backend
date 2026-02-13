import React from 'react';
import { useNavigate } from 'react-router-dom';
import { NEXUS_MODULE2_CATEGORIES, NEXUS_TIME_LIMIT_MINUTES } from '../services/nexusExamService';
import { Briefcase, Clock } from 'lucide-react';

/**
 * เลือกอาชีพ (category) ก่อนทำแบบทดสอบ Module 2 — ทักษะทางเทคนิค 36 ข้อ, ผ่าน 80%, จำกัดเวลา
 */
export default function NexusExamModule2Select() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 p-6 md:p-10">
      <div className="max-w-4xl mx-auto">
        <div className="mb-10">
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight">
            Module 2 — ทักษะทางเทคนิค
          </h1>
          <p className="mt-2 text-slate-600">
            36 ข้อ ตามอาชีพที่เลือก • ผ่านไม่ต่ำกว่า 80% • จำกัดเวลา {NEXUS_TIME_LIMIT_MINUTES.module2} นาที
          </p>
          <div className="mt-4 flex items-center gap-4 text-sm text-slate-500">
            <span className="flex items-center gap-1.5">
              <Briefcase size={18} /> เลือก 1 อาชีพ
            </span>
            <span className="flex items-center gap-1.5">
              <Clock size={18} /> {NEXUS_TIME_LIMIT_MINUTES.module2} นาที
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4">
          {NEXUS_MODULE2_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => navigate(`/training/nexus-module2/quiz/${encodeURIComponent(cat)}`)}
              className="p-5 rounded-xl border-2 border-slate-200 bg-white text-left hover:border-indigo-400 hover:bg-indigo-50/50 hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              <span className="font-semibold text-slate-800">{cat}</span>
            </button>
          ))}
        </div>

        <div className="mt-10">
          <button
            type="button"
            onClick={() => navigate('/training/dashboard')}
            className="text-slate-500 hover:text-slate-700 text-sm"
          >
            ← กลับไป Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
