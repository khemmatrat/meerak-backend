import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Sparkles } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import { fetchEsimPackages } from "../services/rescueNetApi";

/**
 * Slim single-line promo strip on Home when catalog has packages — links to full store.
 */
export const HomeEsimFeaturedBanner: React.FC = () => {
  const { t } = useLanguage();
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchEsimPackages();
        const first = res.packages[0];
        if (!cancelled && first) {
          setLabel(
            `${first.region} · ${first.dataGb} GB / ${first.validityDays}d — ฿${first.totalCustomerPrice.toLocaleString()}`
          );
        }
      } catch {
        if (!cancelled) setLabel(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!label) return null;

  return (
    <Link
      to="/internet-packages"
      className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-emerald-200 hover:bg-slate-50"
    >
      <Sparkles size={16} className="shrink-0 text-emerald-600" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
          {t("esim.featured_strip")}
        </p>
        <p className="truncate text-sm font-medium text-slate-800">{label}</p>
      </div>
      <ChevronRight size={18} className="shrink-0 text-slate-400 opacity-90 group-hover:text-emerald-600" />
    </Link>
  );
};
