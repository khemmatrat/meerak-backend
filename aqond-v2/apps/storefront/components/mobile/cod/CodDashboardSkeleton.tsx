'use client';

export function CodDashboardSkeleton() {
  return (
    <div className="tt-rider-cod-skeleton" aria-hidden>
      <div className="tt-rider-cod-skel-line tt-rider-cod-skel-line--title" />
      <div className="tt-rider-cod-skel-hero" />
      <div className="tt-rider-cod-skel-grid">
        <div className="tt-rider-cod-skel-card" />
        <div className="tt-rider-cod-skel-card" />
      </div>
      <div className="tt-rider-cod-skel-card tt-rider-cod-skel-card--tall" />
    </div>
  );
}
