import React from "react";

export type ManageJobSkeletonVariant =
  | "applicants"
  | "chat"
  | "escrow"
  | "scope"
  | "review"
  | "default";

/** Skeleton โหลดหน้า ManageAdvanceJob — แยก layout ตามแท็บ */
export function ManageJobSkeleton({
  variant = "default",
}: {
  variant?: ManageJobSkeletonVariant;
}) {
  const header = (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-slate-700/60" />
      <div className="h-6 flex-1 max-w-xs rounded-lg bg-slate-700/60" />
      <div className="w-9 h-9 rounded-lg bg-slate-700/40 shrink-0" />
    </div>
  );

  const stepper = (
    <div className="luxury-card rounded-2xl p-4 space-y-3">
      <div className="h-3 w-20 rounded bg-slate-700/50" />
      <div className="flex gap-2 overflow-hidden">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="shrink-0 flex flex-col items-center gap-1.5 w-14">
            <div className="w-7 h-7 rounded-full bg-slate-700/60" />
            <div className="h-2 w-10 rounded bg-slate-700/40" />
          </div>
        ))}
      </div>
    </div>
  );

  const tabs = (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-10 w-24 shrink-0 rounded-xl bg-slate-700/50" />
      ))}
    </div>
  );

  let body: React.ReactNode;
  switch (variant) {
    case "chat":
      body = (
        <div className="luxury-card rounded-2xl p-5 space-y-3 min-h-[320px] flex flex-col">
          <div className="flex-1 space-y-3">
            <div className="h-12 w-3/4 rounded-2xl bg-slate-700/40 ml-auto" />
            <div className="h-10 w-2/3 rounded-2xl bg-slate-700/35" />
            <div className="h-14 w-4/5 rounded-2xl bg-slate-700/40 ml-auto" />
          </div>
          <div className="h-12 rounded-xl bg-slate-700/50" />
        </div>
      );
      break;
    case "escrow":
      body = (
        <div className="luxury-card rounded-2xl p-5 space-y-4">
          <div className="h-16 rounded-xl bg-emerald-500/10 border border-emerald-500/20" />
          <div className="h-10 rounded-xl bg-slate-700/50" />
          <div className="grid grid-cols-2 gap-3">
            <div className="h-24 rounded-xl bg-slate-700/40" />
            <div className="h-24 rounded-xl bg-slate-700/40" />
          </div>
          <div className="h-12 rounded-xl bg-amber-500/15" />
        </div>
      );
      break;
    case "scope":
      body = (
        <div className="luxury-card rounded-2xl p-5 space-y-3">
          <div className="h-5 w-40 rounded bg-slate-700/60" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-slate-700/40" />
          ))}
        </div>
      );
      break;
    case "review":
      body = (
        <div className="luxury-card rounded-2xl p-5 space-y-4">
          <div className="h-5 w-48 rounded bg-slate-700/60" />
          <div className="flex gap-2 justify-center py-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="w-10 h-10 rounded-xl bg-slate-700/50" />
            ))}
          </div>
          <div className="h-24 rounded-xl bg-slate-700/40" />
          <div className="h-11 rounded-xl bg-slate-700/50" />
        </div>
      );
      break;
    case "applicants":
      body = (
        <div className="luxury-card rounded-2xl p-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 rounded-xl bg-slate-700/45" />
            ))}
          </div>
          {[1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-slate-700/50 p-4 space-y-3">
              <div className="flex gap-3">
                <div className="w-12 h-12 rounded-full bg-slate-700/60 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-2/3 rounded bg-slate-700/50" />
                  <div className="h-3 w-1/2 rounded bg-slate-700/40" />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="h-9 flex-1 rounded-lg bg-slate-700/45" />
                <div className="h-9 flex-1 rounded-lg bg-amber-500/15" />
              </div>
            </div>
          ))}
        </div>
      );
      break;
    default:
      body = (
        <>
          <div className="luxury-card rounded-2xl p-5 space-y-4">
            <div className="h-5 w-2/3 rounded bg-slate-700/60" />
            <div className="h-4 w-full rounded bg-slate-700/40" />
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="h-10 rounded-xl bg-slate-700/50" />
              <div className="h-10 rounded-xl bg-slate-700/50" />
            </div>
          </div>
          <div className="luxury-card rounded-2xl p-5 space-y-3">
            <div className="h-16 rounded-xl bg-slate-700/40" />
            <div className="h-16 rounded-xl bg-slate-700/40" />
          </div>
        </>
      );
  }

  return (
    <div className="aqond-trust-theme jobboard-flow-theme space-y-6 pb-12 min-h-screen animate-pulse">
      {header}
      {stepper}
      {tabs}
      {body}
    </div>
  );
}
