import React, { useMemo, useState } from "react";
import {
  AUTO_GENERATED_ALIAS_RULES,
  buildRoutingMatrixCsv,
  PROFESSION_ALIAS_KEYWORD_RULES,
  PROFESSION_ROUTING_MATRIX,
  WORK_SURFACES,
  suggestRoutingByKeywords,
  type WorkSurface,
} from "../constants/workTaxonomy";
import { useMobileAppConfig } from "../context/MobileAppConfigContext";

export const WorkRoutingMatrix: React.FC = () => {
  const { config } = useMobileAppConfig();
  const [query, setQuery] = useState("");
  const [surface, setSurface] = useState<WorkSurface | "all">("all");
  const suggestion = useMemo(
    () =>
      suggestRoutingByKeywords(query, {
        verticalWeightOverrides: config.remote.routingWeightOverrides || null,
      }),
    [query, config.remote.routingWeightOverrides],
  );

  const handleExportCsv = () => {
    const blob = new Blob([buildRoutingMatrixCsv()], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `work-routing-matrix-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleExportJson = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      matrix: PROFESSION_ROUTING_MATRIX,
      alias_rules: PROFESSION_ALIAS_KEYWORD_RULES,
      auto_generated_alias_rules: AUTO_GENERATED_ALIAS_RULES,
    };
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
      type: "application/json;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `work-routing-matrix-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PROFESSION_ROUTING_MATRIX.filter((row) => {
      if (surface !== "all" && row.primary_surface !== surface) return false;
      if (!q) return true;
      return (
        row.profession.toLowerCase().includes(q) ||
        row.province_examples.some((p) => p.toLowerCase().includes(q)) ||
        row.recommended_employment_types.some((e) =>
          e.toLowerCase().includes(q),
        )
      );
    });
  }, [query, surface]);

  const aliasRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PROFESSION_ALIAS_KEYWORD_RULES.filter((r) => {
      if (surface !== "all" && r.preferred_surface !== surface) return false;
      if (!q) return true;
      return (
        r.profession.toLowerCase().includes(q) ||
        r.keywords.some((k) => k.toLowerCase().includes(q))
      );
    });
  }, [query, surface]);

  return (
    <div className="aqond-trust-theme space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">
          Work Routing Matrix
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          ค้นหาอาชีพหรือ keyword เพื่อดูว่าเหมาะกับ Booking / Match Job /
          JobBoard / VideoFeed
        </p>
      </div>

      <div className="luxury-card rounded-2xl p-4 space-y-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="เช่น ช่างแอร์ด่วน, ตัดต่อวิดีโอ, SEO, ช่างแต่งหน้า..."
          className="w-full px-4 py-2.5 rounded-xl bg-charcoal-800 border border-slate-600 text-slate-100 placeholder-slate-500"
        />
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            onClick={() => setSurface("all")}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              surface === "all"
                ? "bg-amber-500 text-black font-semibold"
                : "bg-slate-700 text-slate-200"
            }`}
          >
            ทั้งหมด
          </button>
          {WORK_SURFACES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSurface(s.id)}
              className={`px-3 py-1.5 rounded-lg text-sm ${
                surface === s.id
                  ? "bg-amber-500 text-black font-semibold"
                  : "bg-slate-700 text-slate-200"
              }`}
            >
              {s.label}
            </button>
          ))}
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 text-white"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={handleExportJson}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white"
            >
              Export JSON
            </button>
          </div>
        </div>
      </div>

      {suggestion && query.trim() ? (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
          <p className="text-xs text-emerald-300 uppercase tracking-wide font-semibold">
            Auto Route Suggestion
          </p>
          <p className="text-sm text-slate-100 mt-1">
            แนะนำไปที่ <b>{suggestion.surface}</b> ({suggestion.profession})
          </p>
          <p className="text-xs text-slate-400 mt-1">
            confidence: {(suggestion.confidence * 100).toFixed(0)}%
            {suggestion.matched_keywords.length
              ? ` • matched: ${suggestion.matched_keywords.join(", ")}`
              : ""}
            {suggestion.vertical ? ` • vertical: ${suggestion.vertical}` : ""}
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="luxury-card rounded-2xl p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-200">
            Mapping Matrix ({rows.length})
          </p>
          <div className="space-y-2 max-h-[28rem] overflow-auto pr-1">
            {rows.map((row) => (
              <div
                key={row.profession}
                className="rounded-lg border border-slate-700 bg-charcoal-900/50 p-3"
              >
                <p className="text-sm text-slate-100 font-medium">
                  {row.profession}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Primary: {row.primary_surface} • Secondary:{" "}
                  {row.secondary_surfaces.join(", ")}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  จ้างงานที่แนะนำ: {row.recommended_employment_types.join(", ")}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="luxury-card rounded-2xl p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-200">
            Alias / Keywords ({aliasRows.length})
          </p>
          <div className="space-y-2 max-h-[28rem] overflow-auto pr-1">
            {aliasRows.map((row) => (
              <div
                key={`${row.profession}-${row.preferred_surface}`}
                className="rounded-lg border border-slate-700 bg-charcoal-900/50 p-3"
              >
                <p className="text-sm text-slate-100 font-medium">
                  {row.profession}
                </p>
                <p className="text-xs text-amber-300 mt-1">
                  route: {row.preferred_surface}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {row.keywords.slice(0, 10).map((k) => (
                    <span
                      key={k}
                      className="px-2 py-0.5 rounded bg-slate-700 text-slate-200 text-[11px]"
                    >
                      {k}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkRoutingMatrix;
