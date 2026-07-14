import React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export function EscrowCollapsibleSection({
  title,
  open,
  onToggle,
  children,
  highlight,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border ${highlight ? "border-blue-300 bg-blue-50/30" : "border-slate-200"}`}
    >
      <button type="button" onClick={onToggle} className="jb-collapsible-header !rounded-xl">
        <span>{title}</span>
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {open && <div className="p-4 pt-0">{children}</div>}
    </div>
  );
}
