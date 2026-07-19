'use client';

import Link from 'next/link';
import { StatusChip } from '@aqond/ui';
import { PLACEHOLDER_INCUBATION_BRIEF } from '@/lib/talent/talentAiPlaceholders';

export function TalentAiIncubationBriefPanel() {
  const brief = PLACEHOLDER_INCUBATION_BRIEF;

  return (
    <div className="tt-talent-ai-panel">
      <div className="tt-talent-ai-panel-head">
        <h3>Incubation Brief</h3>
        <StatusChip tone="pending">Placeholder · incubation-brief</StatusChip>
      </div>
      <p className="tt-talent-ai-hint">Future: weekly 15s clip script → upload → booking CTA</p>

      <article className="tt-talent-ai-brief-card">
        <p className="tt-talent-ai-brief-week">{brief.weekLabel}</p>
        <section>
          <h4>Hook</h4>
          <p>{brief.hook}</p>
        </section>
        <section>
          <h4>Script</h4>
          <p className="tt-talent-ai-brief-script">{brief.script}</p>
        </section>
        <section>
          <h4>CTA</h4>
          <p>{brief.cta}</p>
        </section>
      </article>

      <div className="tt-talent-ai-actions">
        <button type="button" className="tt-talent-ai-btn" disabled title="TOS-5 RFC required">
          Refresh brief
        </button>
        <Link href="/m/services/video" className="tt-talent-ai-btn tt-talent-ai-btn--ghost">
          ไป Video Feed
        </Link>
      </div>
    </div>
  );
}
