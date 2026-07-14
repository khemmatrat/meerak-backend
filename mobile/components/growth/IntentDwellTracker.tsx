import React, { useRef } from "react";
import { useIntentDwell } from "../../hooks/useIntentDwell";

export interface IntentDwellTrackerProps {
  entityType: string;
  entityId: string;
  surface?: string;
  enabled?: boolean;
  className?: string;
  children: React.ReactNode;
}

/** Wrap cards / menu tiles — logs dwell >5s via batched /api/intent/dwell */
export const IntentDwellTracker: React.FC<IntentDwellTrackerProps> = ({
  entityType,
  entityId,
  surface = "mobile_home",
  enabled = true,
  className,
  children,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  useIntentDwell(ref, {
    entity_type: entityType,
    entity_id: entityId,
    surface,
    enabled,
  });

  return (
    <div ref={ref} className={className} data-intent-entity={entityId}>
      {children}
    </div>
  );
};

export default IntentDwellTracker;
