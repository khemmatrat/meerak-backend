import React from "react";
import type { ManageJobTabId } from "./ManageJobHeader";

export function ManageJobTabs({
  tabs,
  effectiveTab,
  onSelect,
  t,
}: {
  tabs: { id: ManageJobTabId; labelKey: string; icon: React.ReactNode }[];
  effectiveTab: ManageJobTabId;
  onSelect: (tab: ManageJobTabId) => void;
  t: (k: string) => string;
}) {
  return (
    <div className="flex gap-2 border-b border-slate-700 pb-2 overflow-x-auto" role="tablist">
      {tabs.map((tabItem) => (
        <button
          key={tabItem.id}
          type="button"
          onClick={() => onSelect(tabItem.id)}
          aria-selected={effectiveTab === tabItem.id}
          role="tab"
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors shrink-0 ${
            effectiveTab === tabItem.id
              ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
              : "text-slate-400 hover:bg-slate-700/50"
          }`}
        >
          {tabItem.icon} {t(tabItem.labelKey)}
        </button>
      ))}
    </div>
  );
}
