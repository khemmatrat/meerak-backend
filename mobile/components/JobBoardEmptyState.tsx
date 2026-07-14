import React, { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Briefcase } from "lucide-react";
import { useMobileAppConfig } from "../context/MobileAppConfigContext";
import { useNotification } from "../context/NotificationContext";
import { trackAdvanceEvent } from "../utils/analytics";

export type JobBoardEmptyStateProps = {
  icon: React.ElementType;
  title: string;
  message?: string;
  bullets?: string[];
  ctaLabel: string;
  ctaHref: string;
  secondaryCtaLabel?: string;
  secondaryCtaHref?: string;
  onSecondaryClick?: () => void;
  dataTour?: string;
  /** ใช้ใน analytics เช่น empty_applications, empty_all */
  analyticsContext: string;
  experimentCopy?: { experimentId?: string; variant?: string } | null;
};

export function JobBoardEmptyState({
  icon: Icon,
  title,
  message,
  bullets,
  ctaLabel,
  ctaHref,
  secondaryCtaLabel,
  secondaryCtaHref,
  onSecondaryClick,
  dataTour,
  analyticsContext,
  experimentCopy,
}: JobBoardEmptyStateProps) {
  const { config } = useMobileAppConfig();
  const { notify } = useNotification();
  const impressionSent = useRef(false);

  useEffect(() => {
    if (impressionSent.current) return;
    impressionSent.current = true;
    trackAdvanceEvent(
      "advance_empty_state_impression",
      { context: analyticsContext },
      experimentCopy,
    );
  }, [analyticsContext, experimentCopy]);

  const trackCta = (cta: "primary" | "secondary") => {
    trackAdvanceEvent(
      "advance_empty_state_cta_click",
      { context: analyticsContext, cta },
      experimentCopy,
    );
  };

  const jobPostingCta = /\/create-job/.test(ctaHref);
  const postingBlocked = jobPostingCta && !config.featureFlags.enableJobPosting;

  return (
    <div className="luxury-card rounded-2xl p-12 text-center max-w-lg mx-auto">
      <div className="w-20 h-20 mx-auto rounded-full bg-slate-700/50 flex items-center justify-center mb-6">
        <Icon size={40} className="text-slate-500" />
      </div>
      <h3 className="text-lg font-bold text-slate-100 mb-2">{title}</h3>
      {message ? <p className="text-slate-400 text-sm mb-4">{message}</p> : null}
      {bullets && bullets.length > 0 && (
        <ul className="text-left text-sm text-slate-400 space-y-2 mb-6 max-w-sm mx-auto list-disc list-inside">
          {bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
      {!bullets?.length && !message ? <div className="mb-6" /> : null}
      {postingBlocked ? (
        <button
          type="button"
          data-tour={dataTour}
          onClick={() => {
            trackCta("primary");
            notify("การโพสต์งานถูกปิดชั่วคราวโดยผู้ดูแลระบบ", "warning");
          }}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium bg-slate-600 text-slate-300 cursor-not-allowed opacity-90"
        >
          <Briefcase size={20} />
          {ctaLabel}
        </button>
      ) : (
        <Link
          to={ctaHref}
          data-tour={dataTour}
          onClick={() => trackCta("primary")}
          className="inline-flex items-center gap-2 btn-gold-black px-6 py-3 rounded-xl font-medium hover:opacity-90 transition-opacity"
        >
          <Briefcase size={20} />
          {ctaLabel}
        </Link>
      )}
      {secondaryCtaLabel && (secondaryCtaHref || onSecondaryClick) && (
        <div className="mt-3">
          {secondaryCtaHref ? (
            <Link
              to={secondaryCtaHref}
              onClick={() => trackCta("secondary")}
              className="text-sm text-blue-400 hover:underline"
            >
              {secondaryCtaLabel}
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => {
                trackCta("secondary");
                onSecondaryClick?.();
              }}
              className="text-sm text-blue-400 hover:underline"
            >
              {secondaryCtaLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
