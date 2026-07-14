import React from "react";
import { Link } from "react-router-dom";
import { BookOpen, Bookmark, Star, Users } from "lucide-react";
import type { CourseBadge, MarketplaceCourse } from "../../services/courseMarketplaceService";

const levelLabels: Record<string, string> = {
  beginner: "เริ่มต้น",
  intermediate: "กลาง",
  advanced: "สูง",
};

const badgeStyles: Record<string, string> = {
  new: "bg-blue-500/15 text-blue-300",
  bestseller: "bg-amber-500/15 text-amber-300",
  trending: "bg-rose-500/15 text-rose-300",
  coach_recommended: "bg-indigo-500/15 text-indigo-300",
  provider_essential: "bg-emerald-500/15 text-emerald-300",
  coach_instructor: "bg-purple-500/15 text-purple-300",
};

function BadgePill({ badge }: { badge: CourseBadge }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${badgeStyles[badge.id] || "bg-slate-700 text-slate-300"}`}>
      {badge.label}
    </span>
  );
}

export default function CourseMarketplaceCard({
  course,
  enrolled = false,
  compact = false,
  saved = false,
  onSaveChange,
}: {
  course: MarketplaceCourse;
  enrolled?: boolean;
  compact?: boolean;
  saved?: boolean;
  onSaveChange?: (courseId: string, nextSaved: boolean) => void;
}) {
  const price = Number(course.priceThb || 0);
  const original = Number(course.originalPriceThb || 0);
  const isSaved = saved || course.saved;

  const handleSave = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSaveChange?.(course.id, !isSaved);
  };

  return (
    <Link
      to={`/courses/${course.id}`}
      className={`luxury-card rounded-3xl overflow-hidden block hover:border-emerald-400/30 transition-colors relative ${compact ? "min-w-[240px]" : ""}`}
    >
      <div className={`${compact ? "aspect-[4/3]" : "aspect-video"} bg-emerald-500/10 overflow-hidden relative`}>
        {course.imageUrl ? (
          <img src={course.imageUrl} alt={course.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full grid place-items-center">
            <BookOpen className="text-emerald-300" size={compact ? 28 : 38} />
          </div>
        )}
        {(course.badges || []).length ? (
          <div className="absolute top-2 left-2 flex flex-wrap gap-1 max-w-[70%]">
            {(course.badges || []).slice(0, 2).map((badge) => (
              <BadgePill key={badge.id} badge={badge} />
            ))}
          </div>
        ) : null}
        {onSaveChange ? (
          <button
            type="button"
            onClick={handleSave}
            aria-label={isSaved ? "ลบออกจากที่บันทึก" : "บันทึกคอร์ส"}
            className="absolute top-2 right-2 p-2 rounded-full bg-slate-950/70 border border-slate-700 text-slate-200 hover:bg-slate-900"
          >
            <Bookmark size={16} className={isSaved ? "fill-rose-400 text-rose-400" : ""} />
          </button>
        ) : null}
      </div>
      <div className={`${compact ? "p-3" : "p-4"} space-y-2`}>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-300">
            {levelLabels[course.level || "beginner"] || course.level}
          </span>
          {enrolled || course.enrolled ? (
            <span className="px-2 py-1 rounded-full bg-blue-500/15 text-blue-300">
              {(course.progressPct ?? 0) >= 100
                ? "จบแล้ว"
                : (course.progressPct ?? 0) > 0
                  ? `${Math.round(Number(course.progressPct || 0))}%`
                  : "มีแล้ว"}
            </span>
          ) : course.trust?.hasPreview ? (
            <span className="px-2 py-1 rounded-full bg-slate-800 text-slate-400">Preview ฟรี</span>
          ) : null}
        </div>
        <div>
          <h3 className={`font-bold text-slate-100 line-clamp-2 ${compact ? "text-sm" : ""}`}>{course.title}</h3>
          {!compact ? (
            <p className="text-sm text-slate-400 line-clamp-2 mt-1">{course.subtitle || course.description}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1">
            <Star size={14} className="text-amber-300 fill-current" /> {Number(course.ratingAvg || 0).toFixed(1)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Users size={14} /> {course.totalEnrolled || 0}
          </span>
        </div>
        {(enrolled || course.enrolled) && Number(course.progressPct || 0) > 0 && Number(course.progressPct || 0) < 100 ? (
          <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, Number(course.progressPct || 0))}%` }} />
          </div>
        ) : null}
        <div className="flex items-end justify-between">
          <div>
            {original > price ? <p className="text-xs text-slate-500 line-through">฿{original.toLocaleString()}</p> : null}
            <p className={`${compact ? "text-lg" : "text-xl"} font-extrabold text-emerald-300`}>
              {price <= 0 ? "ฟรี" : `฿${price.toLocaleString()}`}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}

export { BadgePill, badgeStyles };
