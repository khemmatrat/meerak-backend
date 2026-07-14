/**
 * Controlled mobile-banking picker (display only — parent owns `MobileBankingBankCode`).
 */
import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import type { MobileBankingBankCode } from "./mobileBankingBanks";
import {
  MOBILE_BANKING_BANKS,
  metaForMobileBankCode,
} from "./mobileBankingBanks";

export function WalletMobileBankingPicker(props: {
  value: MobileBankingBankCode;
  onChange: (code: MobileBankingBankCode) => void;
  disabled?: boolean;
}) {
  const { value, onChange, disabled } = props;
  const selected = metaForMobileBankCode(value);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const el = wrapRef.current;
      if (el && !el.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, close]);

  useEffect(() => {
    if (disabled && open) setOpen(false);
  }, [disabled, open]);

  const listId = `wallet-mb-picker-${useId().replace(/:/g, "")}`;

  return (
    <div ref={wrapRef} className="relative mb-3">
      <label className="text-xs font-bold text-slate-600">ธนาคาร</label>
      <button
        type="button"
        id={`${listId}-trigger`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((o) => !o);
        }}
        className="mt-1 flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm outline-none ring-1 ring-transparent transition hover:border-emerald-200/90 focus-visible:border-emerald-400 focus-visible:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white ring-1 ring-slate-100">
          <img
            src={selected.logoSrc}
            alt=""
            className="h-9 w-9 object-contain"
            draggable={false}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold leading-tight text-slate-900">
            {selected.nameTh}
          </span>
          <span className="mt-0.5 block truncate text-[11px] leading-snug text-slate-500">
            {selected.nameEn}
          </span>
        </span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-labelledby={`${listId}-trigger`}
          className="absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg shadow-slate-900/10 ring-1 ring-slate-100"
        >
          {MOBILE_BANKING_BANKS.map((b) => {
            const isSel = b.code === value;
            return (
              <li key={b.code} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={isSel}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-emerald-50/80 ${
                    isSel ? "bg-emerald-50/90" : ""
                  }`}
                  onClick={() => {
                    onChange(b.code);
                    close();
                  }}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white ring-1 ring-slate-100">
                    <img
                      src={b.logoSrc}
                      alt=""
                      className="h-9 w-9 object-contain"
                      draggable={false}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold leading-tight text-slate-900">
                      {b.nameTh}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] leading-snug text-slate-500">
                      {b.nameEn}
                    </span>
                  </span>
                  {isSel ? (
                    <Check
                      className="h-5 w-5 shrink-0 text-emerald-600"
                      strokeWidth={2.5}
                    />
                  ) : (
                    <span className="h-5 w-5 shrink-0" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
