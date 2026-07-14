import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Award } from "lucide-react";
import { getMyCourseBadges, type CourseCompletionBadge } from "../../services/courseMarketplaceService";

export default function CourseSkillBadgesStrip() {
  const [badges, setBadges] = useState<CourseCompletionBadge[]>([]);

  useEffect(() => {
    let alive = true;
    getMyCourseBadges()
      .then((rows) => {
        if (alive) setBadges(rows.slice(0, 5));
      })
      .catch(() => {
        if (alive) setBadges([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!badges.length) return null;

  return (
    <section className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold text-emerald-900 inline-flex items-center gap-2 text-sm">
          <Award size={16} /> ทักษะจากคอร์สที่จบแล้ว
        </h3>
        <Link to="/courses?tab=mine" className="text-xs font-semibold text-emerald-700">
          ดูคอร์สของฉัน
        </Link>
      </div>
      <div className="flex flex-wrap gap-2">
        {badges.map((b) => (
          <span
            key={b.courseId}
            className="px-2.5 py-1 rounded-full bg-white border border-emerald-200 text-xs font-semibold text-emerald-800"
            title={(b.outcomes || []).join(" · ")}
          >
            จบแล้ว: {b.courseTitle}
          </span>
        ))}
      </div>
    </section>
  );
}
