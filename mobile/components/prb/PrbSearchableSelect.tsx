import React, { useMemo, useState } from "react";
import { prbInput } from "./prbTheme";

export function PrbSearchableSelect({
  label,
  value,
  options,
  onChange,
  required,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter((o) => o.toLowerCase().includes(s));
  }, [options, q]);

  return (
    <div className="relative">
      <label className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </label>
      <button
        type="button"
        className={`${prbInput} text-left`}
        onClick={() => setOpen((v) => !v)}
      >
        {value || "เลือก..."}
      </button>
      {open ? (
        <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          <input
            className="sticky top-0 w-full border-b border-slate-100 px-3 py-2 text-sm"
            placeholder="ค้นหา..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {filtered.map((opt) => (
            <button
              key={opt}
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-sky-50"
              onClick={() => {
                onChange(opt);
                setOpen(false);
                setQ("");
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
