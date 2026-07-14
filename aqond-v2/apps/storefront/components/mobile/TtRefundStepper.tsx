'use client';

type Step = {
  id: string;
  label_th: string;
  date?: string;
  done: boolean;
  active: boolean;
  badge?: string;
};

export function TtRefundStepper({ steps }: { steps: Step[] }) {
  return (
    <div className="tt-rr-stepper">
      {steps.map((step, i) => (
        <div key={step.id} className={`tt-rr-step${step.done ? ' done' : ''}${step.active ? ' active' : ''}`}>
          <div className="tt-rr-step-track">
            {i > 0 && <span className="tt-rr-step-line" />}
            <span className="tt-rr-step-dot">{step.done ? '✓' : i + 1}</span>
          </div>
          <div className="tt-rr-step-body">
            <strong>{step.label_th}</strong>
            {step.date && <p>{step.date}</p>}
            {step.badge && <span className="tt-rr-step-badge">{step.badge}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
