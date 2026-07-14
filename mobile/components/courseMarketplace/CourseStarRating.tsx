import React from "react";
import { Star } from "lucide-react";

type Props = {
  value: number;
  onChange: (value: number) => void;
  size?: number;
  disabled?: boolean;
};

export default function CourseStarRating({ value, onChange, size = 22, disabled }: Props) {
  return (
    <div className="inline-flex items-center gap-1" role="group" aria-label="ให้คะแนนคอร์ส">
      {[1, 2, 3, 4, 5].map((star) => {
        const active = star <= value;
        return (
          <button
            key={star}
            type="button"
            disabled={disabled}
            aria-label={`${star} ดาว`}
            onClick={() => onChange(star)}
            className={`p-0.5 rounded transition ${disabled ? "opacity-50 cursor-not-allowed" : "hover:scale-110"}`}
          >
            <Star
              size={size}
              className={active ? "text-amber-400 fill-amber-400" : "text-slate-600"}
            />
          </button>
        );
      })}
    </div>
  );
}

export function formatReviewDate(iso?: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("th-TH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}
