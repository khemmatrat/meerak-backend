'use client';

import Link from 'next/link';
import type { RiderOnboardingState } from '@/lib/riderOnboarding';
import { riderOsPath } from '@/lib/riderOsPaths';

type Props = {
  state: RiderOnboardingState;
  compact?: boolean;
  showCreditPitch?: boolean;
  className?: string;
};

export function RiderOnboardingProgress({
  state,
  compact = false,
  showCreditPitch = true,
  className = '',
}: Props) {
  if (state.completed) return null;

  const nextHref = state.nextAction?.href?.startsWith('/m')
    ? state.nextAction.href
    : state.nextAction?.href
      ? state.nextAction.href
      : riderOsPath('/signup');

  return (
    <section
      className={`tt-rider-onboard-progress${compact ? ' tt-rider-onboard-progress--compact' : ''} ${className}`.trim()}
      aria-label="ความคืบหน้าการเริ่มใช้งาน Rider OS"
    >
      <div className="tt-rider-onboard-progress-head">
        <span>เริ่มใช้งาน Rider OS</span>
        <strong>{state.progressPct}%</strong>
      </div>
      <div className="tt-rider-onboard-progress-bar" role="progressbar" aria-valuenow={state.progressPct} aria-valuemin={0} aria-valuemax={100}>
        <div className="tt-rider-onboard-progress-fill" style={{ width: `${state.progressPct}%` }} />
      </div>
      <ol className="tt-rider-onboard-steps">
        {state.steps.map((s) => (
          <li
            key={s.id}
            className={`tt-rider-onboard-step${s.done ? ' done' : ''}${s.current ? ' current' : ''}`}
          >
            <span className="tt-rider-onboard-step-dot" aria-hidden>
              {s.done ? '✓' : s.short}
            </span>
            {!compact && <span className="tt-rider-onboard-step-label">{s.label}</span>}
          </li>
        ))}
      </ol>
      {showCreditPitch && !state.steps.find((s) => s.id === 'credit')?.done && (
        <p className="tt-rider-onboard-credit-pitch">{state.creditPitch}</p>
      )}
      {state.nextAction && (
        <div className="tt-rider-onboard-next">
          {state.nextAction.hint && <p className="tt-hint">{state.nextAction.hint}</p>}
          <Link href={nextHref} className="tt-rider-onboard-cta">
            {state.nextAction.label} →
          </Link>
        </div>
      )}
      {!compact && state.currentStepId === 'first_job' && (
        <p className="tt-rider-onboard-skip-hint">
          ข้ามแบบทดสอบ/Compass ได้ — อาจลดลำดับความสำคัญงานชั่วคราวจนกว่าจะทำครบ
        </p>
      )}
    </section>
  );
}

/** แนะนำงานแรกบนหน้ารับงาน */
export function RiderFirstJobHint({ jobCount }: { jobCount: number }) {
  if (jobCount <= 0) return null;
  return (
    <div className="tt-rider-first-job-hint">
      <strong>งานแรกแนะนำ</strong>
      <p>เลือกงานที่มีค่าจ้างต่ำสุดในรายการ — เหมาะสำหรับเริ่มต้น (ไฮไลต์สีเขียว)</p>
    </div>
  );
}
