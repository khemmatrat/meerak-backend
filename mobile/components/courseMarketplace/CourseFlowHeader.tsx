import React from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

type CourseFlowHeaderProps = {
  title?: string;
  backTo?: string;
  backLabel?: string;
  onBack?: () => void;
};

export default function CourseFlowHeader({
  title,
  backTo,
  backLabel = "ย้อนกลับ",
  onBack,
}: CourseFlowHeaderProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (backTo) {
      navigate(backTo);
      return;
    }
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/courses");
  };

  return (
    <header className="course-flow-header flex items-center gap-3">
      <button
        type="button"
        onClick={handleBack}
        aria-label={backLabel}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/90 border border-emerald-100 text-slate-700 font-semibold text-sm shadow-sm shrink-0 hover:bg-white"
      >
        <ArrowLeft size={18} aria-hidden />
        {backLabel}
      </button>
      {title ? <h1 className="text-base font-bold text-slate-800 truncate min-w-0">{title}</h1> : null}
    </header>
  );
}
