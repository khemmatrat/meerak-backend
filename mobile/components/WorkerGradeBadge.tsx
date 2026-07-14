/**
 * WorkerGradeBadge.tsx
 * ──────────────────────────────────────────────────────
 * แสดง Grade Badge (A/B/C) ของ worker พร้อม shimmer effect สำหรับ Grade A
 * และ Progress bar บอกว่าต้องทำอะไรเพิ่มถึงจะขึ้น Grade
 */

import React, { useEffect, useState } from 'react';
import { Shield, Star, Award, TrendingUp, Lock, ChevronRight, Sparkles } from 'lucide-react';
import {
  gradeService,
  GradeData,
  WorkerGrade,
  GRADE_META,
  getProgressToNextGrade,
} from '../services/gradeService';

// ── Shimmer animation style (inject once) ─────────────────────────────
const shimmerStyle = `
@keyframes grade-shimmer {
  0%   { background-position: -200% center; }
  100% { background-position:  200% center; }
}
.grade-shimmer {
  background-size: 200% auto;
  animation: grade-shimmer 2.5s linear infinite;
}
`;

// ── Sub-component: Grade Icon ──────────────────────────────────────────
function GradeIcon({ grade, size = 20 }: { grade: WorkerGrade; size?: number }) {
  if (grade === 'A') return <Sparkles size={size} />;
  if (grade === 'B') return <Award size={size} />;
  return <Shield size={size} />;
}

// ── Sub-component: Dimension Bar ──────────────────────────────────────
function DimensionBar({ label, value }: { label: string; value: number | string }) {
  const num = parseFloat(String(value ?? 0));
  const pct = Math.round((num / 5) * 100);
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs text-white/90">
        <span>{label}</span>
        <span className="text-white">{num.toFixed(1)}</span>
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            background: num >= 4.5
              ? 'linear-gradient(90deg,#D4AF37,#F5E27D)'
              : num >= 3.5
              ? 'linear-gradient(90deg,#6366F1,#818CF8)'
              : '#64748B',
          }}
        />
      </div>
    </div>
  );
}

// ── Props ──────────────────────────────────────────────────────────────
interface WorkerGradeBadgeProps {
  userId:   string;
  /** compact = แค่ badge เล็กๆ | full = แสดงรายละเอียดเต็ม */
  variant?: 'compact' | 'full';
  /** ข้อมูล stats รายหมวด (optional — จาก reviews endpoint) */
  reviewStats?: {
    avg_quality?:       number;
    avg_punctuality?:   number;
    avg_attitude?:      number;
    avg_cleanliness?:   number;
    avg_communication?: number;
  };
  className?: string;
}

// ── Main Component ─────────────────────────────────────────────────────
export function WorkerGradeBadge({
  userId,
  variant = 'compact',
  reviewStats,
  className = '',
}: WorkerGradeBadgeProps) {
  const [gradeData, setGradeData] = useState<GradeData | null>(null);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    if (!userId) return;
    gradeService.getWorkerGrade(userId).then((data) => {
      setGradeData(data);
      setLoading(false);
    });
  }, [userId]);

  if (loading) {
    return (
      <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-700/60 animate-pulse ${className}`}>
        <div className="w-3 h-3 rounded-full bg-slate-600" />
        <div className="w-16 h-3 rounded bg-slate-600" />
      </div>
    );
  }

  if (!gradeData) return null;

  const meta     = GRADE_META[gradeData.grade];
  const progress = getProgressToNextGrade(gradeData);

  // ── Compact Badge ──────────────────────────────────────────────────
  if (variant === 'compact') {
    return (
      <>
        <style>{shimmerStyle}</style>
        <div
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold select-none ${
            gradeData.grade === 'A' ? 'grade-shimmer' : ''
          } ${className}`}
          style={{
            background:  meta.bgColor,
            color:       gradeData.grade === 'A' ? '#1a1200' : '#fff',
            border:      `1px solid ${meta.borderColor}40`,
            boxShadow:   gradeData.grade === 'A'
              ? '0 0 12px rgba(212,175,55,0.4)'
              : '0 0 6px rgba(0,0,0,0.3)',
          }}
        >
          <GradeIcon grade={gradeData.grade} size={12} />
          {meta.badge}
          {gradeData.grade === 'A' && (
            <span className="ml-0.5 text-[10px] opacity-90">✦</span>
          )}
        </div>
      </>
    );
  }

  // ── Full Card ──────────────────────────────────────────────────────
  return (
    <>
      <style>{shimmerStyle}</style>
      <div
        className={`rounded-2xl overflow-hidden border ${className}`}
        style={{
          borderColor: `${meta.borderColor}40`,
          background:  'rgba(15,23,42,0.7)',
          backdropFilter: 'blur(12px)',
        }}
      >
        {/* Header */}
        <div
          className={`px-5 py-4 flex items-center justify-between ${
            gradeData.grade === 'A' ? 'grade-shimmer' : ''
          }`}
          style={{ background: meta.bgColor }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-2xl font-black shadow-lg"
              style={{
                background: 'rgba(0,0,0,0.25)',
                color:      gradeData.grade === 'A' ? '#FFF8DC' : '#fff',
              }}
            >
              {gradeData.grade}
            </div>
            <div>
              <p
                className="font-bold text-base"
                style={{ color: gradeData.grade === 'A' ? '#1a1200' : '#fff' }}
              >
                {meta.labelTh}
              </p>
              <p
                className="text-xs opacity-75"
                style={{ color: gradeData.grade === 'A' ? '#3d2b00' : '#e2e8f0' }}
              >
                {meta.description}
              </p>
            </div>
          </div>
          {gradeData.grade === 'A' && (
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-[10px] font-bold text-amber-900 bg-amber-100/80 px-2 py-0.5 rounded-full">
                ✦ VVIP Verified
              </span>
              <span className="text-[10px] text-amber-800 opacity-70">รับงาน VVIP ได้</span>
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div className="px-5 py-4 grid grid-cols-3 gap-3 border-b border-slate-700/50">
          {[
            { label: 'คะแนนเฉลี่ย', value: parseFloat(String(gradeData.avg_rating ?? 0)).toFixed(1), icon: <Star size={14} />, gold: parseFloat(String(gradeData.avg_rating ?? 0)) >= 4.5 },
            { label: 'รีวิวทั้งหมด', value: gradeData.total_reviews, icon: <TrendingUp size={14} />, gold: false },
            { label: 'ใบเซอร์', value: gradeData.cert_count, icon: <Award size={14} />, gold: parseInt(String(gradeData.cert_count ?? 0)) > 3 },
          ].map(({ label, value, icon, gold }) => (
            <div key={label} className="text-center">
              <div
                className="flex items-center justify-center gap-1 text-lg font-black"
                style={{ color: gold ? '#D4AF37' : '#ffffff' }}
              >
                {icon}
                {value}
              </div>
              <p className="text-[10px] text-white/90 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Dimension Breakdown (if stats available) */}
        {reviewStats && (
          <div className="px-5 py-4 space-y-2 border-b border-slate-700/50">
            <p className="text-xs font-semibold text-white/90 mb-2">คะแนนรายหมวด</p>
            {reviewStats.avg_quality       != null && <DimensionBar label="คุณภาพงาน"     value={reviewStats.avg_quality} />}
            {reviewStats.avg_punctuality   != null && <DimensionBar label="ความตรงเวลา"   value={reviewStats.avg_punctuality} />}
            {reviewStats.avg_attitude      != null && <DimensionBar label="มารยาท"         value={reviewStats.avg_attitude} />}
            {reviewStats.avg_cleanliness   != null && <DimensionBar label="ความสะอาด"     value={reviewStats.avg_cleanliness} />}
            {reviewStats.avg_communication != null && <DimensionBar label="การสื่อสาร"    value={reviewStats.avg_communication} />}
          </div>
        )}

        {/* Progress to Next Grade */}
        {progress.nextGrade && (
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-white/90">
                ความคืบหน้าสู่ Grade {progress.nextGrade}
              </p>
              <span
                className="text-xs font-bold"
                style={{ color: GRADE_META[progress.nextGrade].color }}
              >
                {progress.progressPct}%
              </span>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden mb-3">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width:      `${progress.progressPct}%`,
                  background: GRADE_META[progress.nextGrade].bgColor,
                }}
              />
            </div>
            <ul className="space-y-1">
              {progress.missingItems.map((item, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-white/90">
                  <ChevronRight size={12} className="mt-0.5 shrink-0 text-white/80" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {gradeData.grade === 'A' && (
          <div className="px-5 pb-4 text-center">
            <p className="text-xs text-amber-400/70">
              ✦ คุณได้รับสิทธิ์รับงาน VVIP Exclusive ทั้งหมดแล้ว
            </p>
          </div>
        )}
      </div>
    </>
  );
}

export default WorkerGradeBadge;
