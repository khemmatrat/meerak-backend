/* Lightweight analytics helper for Advance Job funnel */

type Payload = Record<string, unknown>;

export type AdvanceExperimentMeta = {
  experiment_id?: string;
  variant?: string;
};

export type AdvanceJobAnalyticsFields = {
  category?: string | null;
  min_budget?: number | null;
  max_budget?: number | null;
};

export function formatBudgetRange(
  min?: number | null,
  max?: number | null,
): string | undefined {
  const lo =
    min != null && !Number.isNaN(Number(min)) ? Math.round(Number(min)) : null;
  const hi =
    max != null && !Number.isNaN(Number(max)) ? Math.round(Number(max)) : null;
  if (lo != null && hi != null) return `${lo}-${hi}`;
  if (lo != null) return `${lo}+`;
  if (hi != null) return `0-${hi}`;
  return undefined;
}

/** รวม job_category + budget_range สำหรับ funnel events */
export function advanceJobEventMeta(
  job?: AdvanceJobAnalyticsFields | null,
  extra: Payload = {},
): Payload {
  const budget_range = job
    ? formatBudgetRange(job.min_budget, job.max_budget)
    : undefined;
  const category = job?.category?.trim();
  return {
    ...(category ? { job_category: category, category } : {}),
    ...(budget_range ? { budget_range } : {}),
    ...extra,
  };
}

export function getAdvanceExperimentMeta(
  copy?: { experimentId?: string; variant?: string } | null,
): AdvanceExperimentMeta {
  const experimentId = copy?.experimentId?.trim();
  const variant = copy?.variant?.trim() || "control";
  if (!experimentId) return {};
  return { experiment_id: experimentId, variant };
}

export function withAdvanceExperiment(
  payload: Payload,
  copy?: { experimentId?: string; variant?: string } | null,
): Payload {
  return { ...payload, ...getAdvanceExperimentMeta(copy) };
}

export function trackAdvanceEvent(
  event: string,
  payload: Payload = {},
  experimentCopy?: { experimentId?: string; variant?: string } | null,
) {
  try {
    const merged = experimentCopy
      ? withAdvanceExperiment(payload, experimentCopy)
      : payload;
    const dl = (window as { dataLayer?: unknown[] })?.dataLayer;
    if (Array.isArray(dl)) {
      dl.push({ event, ...merged });
    } else if (typeof (window as { aqTrack?: (e: string, p: Payload) => void }).aqTrack === "function") {
      (window as { aqTrack: (e: string, p: Payload) => void }).aqTrack(event, merged);
    } else if (process.env.NODE_ENV === "development") {
      console.debug("[analytics]", event, merged);
    }
  } catch (_) {
    /* ignore analytics errors */
  }
}
