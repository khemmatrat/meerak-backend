import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, ChevronRight, Loader2 } from "lucide-react";
import {
  fetchPersonalizedHome,
} from "../../services/growthEngineService";
import { useAuth } from "../../context/AuthContext";

export interface ContextualHomeBannerProps {
  className?: string;
}

export const ContextualHomeBanner: React.FC<ContextualHomeBannerProps> = ({
  className = "",
}) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{
    title: string;
    subtitle: string;
    href: string;
  } | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setBanner(null);
      setLoading(false);
      return;
    }
    let alive = true;
    fetchPersonalizedHome()
      .then((hints) => {
        if (!alive) return;
        setBanner(hints.banner);
      })
      .catch(() => {
        if (alive) setBanner(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [user?.id]);

  if (!user?.id || loading) {
    if (loading && user?.id) {
      return (
        <div className={`flex justify-center py-2 ${className}`} aria-hidden>
          <Loader2 size={18} className="animate-spin text-emerald-400/60" />
        </div>
      );
    }
    return null;
  }

  if (!banner) return null;

  const to = banner.href.startsWith("/") ? banner.href : `/${banner.href}`;

  return (
    <Link
      to={to}
      className={`group flex items-center gap-3 rounded-2xl border border-emerald-400/35 bg-gradient-to-r from-emerald-600/25 via-teal-600/15 to-amber-500/10 px-4 py-3.5 shadow-sm shadow-black/20 transition-all hover:border-emerald-300/50 hover:shadow-md active:scale-[0.99] ${className}`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/25 text-emerald-200 ring-1 ring-emerald-400/30">
        <Sparkles size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-50 truncate">{banner.title}</p>
        <p className="text-xs text-slate-300/90 truncate mt-0.5">{banner.subtitle}</p>
      </div>
      <ChevronRight
        size={20}
        className="shrink-0 text-emerald-300/80 group-hover:translate-x-0.5 transition-transform"
      />
    </Link>
  );
};

export default ContextualHomeBanner;
