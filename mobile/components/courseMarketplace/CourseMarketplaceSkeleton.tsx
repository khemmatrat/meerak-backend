import React from "react";
import { Bookmark } from "lucide-react";

export default function CourseMarketplaceSkeleton({
  variant = "grid",
}: {
  variant?: "grid" | "saved";
}) {
  if (variant === "saved") {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="jb-skeleton-card luxury-card rounded-3xl h-72 relative overflow-hidden">
            <Bookmark size={16} className="absolute top-4 right-4 text-slate-500/80" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="jb-skeleton-card luxury-card rounded-3xl h-72" />
      ))}
    </div>
  );
}
