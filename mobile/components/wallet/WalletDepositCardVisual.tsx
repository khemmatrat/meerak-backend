/**
 * Presentational card mock for deposit — reflects typed PAN / name / expiry only (never CVC).
 */
import React from "react";
import { CreditCard } from "lucide-react";

const MASK = "•";

function panGroupsFromFormatted(
  numberFormatted: string,
): [string, string, string, string] {
  const digits = numberFormatted.replace(/\D/g, "").slice(0, 16);
  const out: string[] = [];
  for (let i = 0; i < 4; i += 1) {
    let g = "";
    for (let j = 0; j < 4; j += 1) {
      const idx = i * 4 + j;
      g += idx < digits.length ? digits[idx]! : MASK;
    }
    out.push(g);
  }
  return out as [string, string, string, string];
}

function expiryMasked(expiryMmYy: string): string {
  const d = expiryMmYy.replace(/\D/g, "").slice(0, 4);
  const m1 = d[0] ?? MASK;
  const m2 = d[1] ?? MASK;
  const y1 = d[2] ?? MASK;
  const y2 = d[3] ?? MASK;
  return `${m1}${m2}/${y1}${y2}`;
}

export function WalletDepositCardVisual(props: {
  numberFormatted: string;
  cardholderName: string;
  expiryMmYy: string;
}) {
  const [g1, g2, g3, g4] = panGroupsFromFormatted(props.numberFormatted);
  const name =
    props.cardholderName.trim() !== ""
      ? props.cardholderName.trim().toUpperCase()
      : "CARDHOLDER NAME";
  const exp = expiryMasked(props.expiryMmYy);

  return (
    <div
      className="relative mb-4 overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-violet-900 p-[1px] shadow-lg shadow-slate-900/25 ring-1 ring-white/10 pointer-events-none select-none"
      aria-hidden
    >
      <div className="relative rounded-[15px] bg-gradient-to-br from-slate-800/95 via-indigo-900/95 to-violet-950 px-5 py-6">
        <div className="pointer-events-none absolute -right-6 -top-10 h-32 w-32 rounded-full bg-emerald-500/15 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-8 left-10 h-24 w-40 rounded-full bg-violet-500/10 blur-2xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="flex h-9 w-11 items-center justify-center rounded-md bg-gradient-to-br from-amber-200/90 to-amber-600/95 shadow-inner ring-1 ring-amber-100/40" />
          <CreditCard
            className="h-6 w-6 shrink-0 text-white/35"
            strokeWidth={1.5}
          />
        </div>
        <p className="relative mt-5 font-mono text-lg tracking-[0.2em] text-white drop-shadow-sm sm:text-xl">
          <span>{g1}</span>
          <span className="mx-2 sm:mx-3">{g2}</span>
          <span className="mx-2 sm:mx-3">{g3}</span>
          <span className="ml-2 sm:ml-3">{g4}</span>
        </p>
        <div className="relative mt-5 flex items-end justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-emerald-200/80">
              Cardholder
            </p>
            <p className="truncate font-mono text-xs font-semibold uppercase tracking-wide text-white/95">
              {name}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-emerald-200/80">
              Expiry
            </p>
            <p className="font-mono text-sm font-semibold tracking-widest text-white/95">
              {exp}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
