import { useCallback, useEffect, useRef } from "react";
import { adsService, type AdRenderEventType } from "../services/adsService";

type Params = {
  impressionId: string;
  campaignId?: string;
  creativeId?: string;
  surface: string;
  enabled?: boolean;
};

/**
 * MRC-style viewability: ≥50% visible for ≥1s → ad_viewable_1s
 */
export function useAdViewability({
  impressionId,
  campaignId,
  creativeId,
  surface,
  enabled = true,
}: Params) {
  const rootRef = useRef<HTMLElement | null>(null);
  const viewableSentRef = useRef(false);

  const reportRender = useCallback(
    (eventType: AdRenderEventType, reason?: string) => {
      if (!impressionId) return;
      void adsService.recordRenderEvent({
        publicImpressionId: impressionId,
        eventType,
        creativeId,
        campaignId,
        surface,
        reason,
      });
    },
    [impressionId, campaignId, creativeId, surface],
  );

  useEffect(() => {
    viewableSentRef.current = false;
  }, [impressionId]);

  useEffect(() => {
    if (!enabled || !impressionId) return;
    reportRender("ad_rendered");
  }, [enabled, impressionId, reportRender]);

  useEffect(() => {
    const root = rootRef.current;
    if (!enabled || !impressionId || !root) return;

    let visibleSince: number | null = null;
    let viewableTimer: ReturnType<typeof setTimeout> | null = null;

    const obs = new IntersectionObserver(
      (entries) => {
        const ratio = entries[0]?.intersectionRatio ?? 0;
        if (ratio >= 0.5) {
          if (visibleSince == null) visibleSince = Date.now();
          if (!viewableSentRef.current && visibleSince && Date.now() - visibleSince >= 1000) {
            viewableSentRef.current = true;
            reportRender("ad_viewable_1s");
          } else if (!viewableSentRef.current && !viewableTimer) {
            const wait = visibleSince ? Math.max(0, 1000 - (Date.now() - visibleSince)) : 1000;
            viewableTimer = setTimeout(() => {
              if (!viewableSentRef.current) {
                viewableSentRef.current = true;
                reportRender("ad_viewable_1s");
              }
            }, wait);
          }
        } else {
          visibleSince = null;
          if (viewableTimer) clearTimeout(viewableTimer);
          viewableTimer = null;
        }
      },
      { threshold: [0, 0.5, 1] },
    );

    obs.observe(root);
    return () => {
      obs.disconnect();
      if (viewableTimer) clearTimeout(viewableTimer);
    };
  }, [enabled, impressionId, reportRender]);

  return { rootRef, reportRender, viewableSentRef };
}
