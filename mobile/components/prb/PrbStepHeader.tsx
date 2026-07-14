import React from "react";
import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { prbHeading } from "./prbTheme";

type Step = 1 | 2 | 3;

export function PrbStepHeader({ step, title }: { step: Step; title: string }) {
  const navigate = useNavigate();
  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-3 flex items-center gap-1 text-sm text-blue-700"
      >
        <ChevronLeft className="h-4 w-4" /> กลับ
      </button>
      <h1 className={`text-xl ${prbHeading}`}>{title}</h1>
      <div className="mt-3 flex gap-2">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className={`h-2 flex-1 rounded-full ${
              n <= step ? "bg-blue-600" : "bg-slate-200"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
