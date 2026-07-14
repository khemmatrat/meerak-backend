/**
 * ReviewFormAdvanced.tsx
 * ──────────────────────────────────────────────────────
 * ฟอร์มรีวิวอัจฉริยะ พร้อม:
 *  - คะแนนรายหมวด (Overall, Quality, Punctuality, Attitude, Cleanliness, Communication)
 *  - Smart Tags ตามหมวดอาชีพ
 *  - Comment textarea
 */

import React, { useState } from 'react';
import {
  Star, Clock, Heart, Sparkles, MessageCircle,
  ThumbsUp, Send, X, Loader2,
} from 'lucide-react';
import { gradeService, getSmartTags, SubmitReviewPayload } from '../services/gradeService';
import { useNotification } from '../context/NotificationContext';

// ── Star Picker ────────────────────────────────────────────────────────
function StarPicker({
  value,
  onChange,
  label,
  icon,
  required = false,
}: {
  value:    number;
  onChange: (v: number) => void;
  label:    string;
  icon:     React.ReactNode;
  required?: boolean;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm text-slate-300">
        {icon}
        <span>{label}</span>
        {required && <span className="text-red-400 text-xs">*</span>}
      </div>
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            onMouseEnter={() => setHover(s)}
            onMouseLeave={() => setHover(0)}
            className="transition-transform hover:scale-110"
          >
            <Star
              size={22}
              className="transition-colors duration-150"
              fill={(hover || value) >= s ? '#D4AF37' : 'none'}
              stroke={(hover || value) >= s ? '#D4AF37' : '#475569'}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Props ──────────────────────────────────────────────────────────────
interface ReviewFormAdvancedProps {
  jobId:        string;
  revieweeId:   string;
  revieweeName: string;
  jobCategory?: string;
  onSubmit?:    () => void;
  onCancel?:    () => void;
}

// ── Main Component ─────────────────────────────────────────────────────
export function ReviewFormAdvanced({
  jobId,
  revieweeId,
  revieweeName,
  jobCategory,
  onSubmit,
  onCancel,
}: ReviewFormAdvancedProps) {
  const { showNotification } = useNotification();
  const smartTags = getSmartTags(jobCategory);

  // Rating state
  const [overall,       setOverall]       = useState(0);
  const [quality,       setQuality]       = useState(0);
  const [punctuality,   setPunctuality]   = useState(0);
  const [attitude,      setAttitude]      = useState(0);
  const [cleanliness,   setCleanliness]   = useState(0);
  const [communication, setCommunication] = useState(0);

  // Tags & comment
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [comment,      setComment]      = useState('');
  const [submitting,   setSubmitting]   = useState(false);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      next.has(tag) ? next.delete(tag) : next.add(tag);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (overall === 0) {
      showNotification?.('กรุณาให้คะแนนภาพรวมก่อน', 'error');
      return;
    }

    setSubmitting(true);
    const payload: SubmitReviewPayload = {
      job_id:                jobId,
      reviewee_id:           revieweeId,
      rating_overall:        overall,
      ...(quality       > 0 && { rating_quality:       quality       }),
      ...(punctuality   > 0 && { rating_punctuality:   punctuality   }),
      ...(attitude      > 0 && { rating_attitude:      attitude      }),
      ...(cleanliness   > 0 && { rating_cleanliness:   cleanliness   }),
      ...(communication > 0 && { rating_communication: communication }),
      tags:    Array.from(selectedTags),
      comment: comment.trim(),
    };

    const result = await gradeService.submitReview(payload);
    setSubmitting(false);

    if (result) {
      showNotification?.(`ส่งรีวิวสำเร็จ! Grade ใหม่ของ ${revieweeName}: ${result.new_grade.grade}`, 'success');
      onSubmit?.();
    } else {
      showNotification?.('เกิดข้อผิดพลาด ลองใหม่อีกครั้ง', 'error');
    }
  };

  return (
    <div
      className="rounded-2xl overflow-hidden border border-slate-700/50"
      style={{ background: 'rgba(15,23,42,0.95)', backdropFilter: 'blur(16px)' }}
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-700/50 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-100">รีวิวการทำงาน</h3>
          <p className="text-xs text-slate-400 mt-0.5">{revieweeName}</p>
        </div>
        {onCancel && (
          <button onClick={onCancel} className="text-slate-500 hover:text-slate-300">
            <X size={18} />
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="px-5 py-4 space-y-5">
        {/* Overall (required) */}
        <div className="rounded-xl bg-slate-800/50 px-4 py-3 space-y-3">
          <StarPicker
            value={overall}
            onChange={setOverall}
            label="ภาพรวม"
            icon={<Star size={16} className="text-amber-400" />}
            required
          />
        </div>

        {/* Category Ratings */}
        <div className="rounded-xl bg-slate-800/50 px-4 py-3 space-y-3">
          <p className="text-xs font-semibold text-slate-400 mb-1">คะแนนรายหมวด (ไม่บังคับ)</p>
          <StarPicker value={quality}       onChange={setQuality}       label="คุณภาพงาน"    icon={<Sparkles size={14} className="text-indigo-400" />} />
          <StarPicker value={punctuality}   onChange={setPunctuality}   label="ความตรงเวลา"  icon={<Clock size={14} className="text-sky-400" />} />
          <StarPicker value={attitude}      onChange={setAttitude}      label="มารยาท"        icon={<Heart size={14} className="text-pink-400" />} />
          <StarPicker value={cleanliness}   onChange={setCleanliness}   label="ความสะอาด"    icon={<Sparkles size={14} className="text-emerald-400" />} />
          <StarPicker value={communication} onChange={setCommunication} label="การสื่อสาร"   icon={<MessageCircle size={14} className="text-violet-400" />} />
        </div>

        {/* Smart Tags */}
        <div>
          <p className="text-xs font-semibold text-slate-400 mb-2">
            <ThumbsUp size={12} className="inline mr-1" />
            เลือก Tag ที่ตรงกับประสบการณ์คุณ
          </p>
          <div className="flex flex-wrap gap-2">
            {smartTags.map((tag) => {
              const active = selectedTags.has(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150"
                  style={{
                    background:   active ? 'linear-gradient(135deg,#6366F1,#818CF8)' : 'rgba(71,85,105,0.4)',
                    color:        active ? '#fff' : '#94A3B8',
                    border:       active ? '1px solid #818CF8' : '1px solid #334155',
                    transform:    active ? 'scale(1.05)' : 'scale(1)',
                    boxShadow:    active ? '0 0 8px rgba(99,102,241,0.4)' : 'none',
                  }}
                >
                  {active ? '✓ ' : ''}{tag}
                </button>
              );
            })}
          </div>
        </div>

        {/* Comment */}
        <div>
          <label className="text-xs font-semibold text-slate-400 mb-1.5 block">
            ความคิดเห็นเพิ่มเติม
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="เล่าประสบการณ์ของคุณ..."
            maxLength={500}
            rows={3}
            className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl px-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 resize-none focus:outline-none focus:border-indigo-500/50 transition-colors"
          />
          <p className="text-right text-[10px] text-slate-600 mt-0.5">{comment.length}/500</p>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting || overall === 0}
          className="w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: overall > 0
              ? 'linear-gradient(135deg,#6366F1 0%,#8B5CF6 100%)'
              : '#334155',
            color: '#fff',
            boxShadow: overall > 0 ? '0 4px 15px rgba(99,102,241,0.4)' : 'none',
          }}
        >
          {submitting ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Send size={16} />
          )}
          {submitting ? 'กำลังส่งรีวิว...' : 'ส่งรีวิว'}
        </button>
      </form>
    </div>
  );
}

export default ReviewFormAdvanced;
