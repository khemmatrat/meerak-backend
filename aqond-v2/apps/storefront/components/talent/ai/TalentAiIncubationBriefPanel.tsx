'use client';

import Link from 'next/link';
import { useState } from 'react';
import { StatusChip } from '@aqond/ui';
import { useTalentAi } from '@/lib/talent/ai/TalentAiContext';
import { PLACEHOLDER_INCUBATION_BRIEF } from '@/lib/talent/talentAiPlaceholders';
import type { TalentAiIncubationBriefPlaceholder } from '@/lib/talent/talentAiTypes';

export function TalentAiIncubationBriefPanel() {
  const { adapter, refreshHistory, lastError, clearError } = useTalentAi();
  const [brief, setBrief] = useState<TalentAiIncubationBriefPlaceholder>(PLACEHOLDER_INCUBATION_BRIEF);
  const [loading, setLoading] = useState(false);

  const onRefresh = async () => {
    setLoading(true);
    clearError();
    try {
      const next = await adapter.fetchIncubationBrief();
      setBrief(next);
      await refreshHistory();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tt-talent-ai-panel">
      <div className="tt-talent-ai-panel-head">
        <h3>Incubation Brief</h3>
        <StatusChip tone="active">Mock adapter · TOS-9</StatusChip>
      </div>
      <p className="tt-talent-ai-hint">Adapter: <code>fetchIncubationBrief</code> — no incubation-brief.js call</p>

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

      {lastError ? <p className="tt-talent-ai-error">{lastError}</p> : null}

      <div className="tt-talent-ai-actions">
        <button type="button" className="tt-talent-ai-btn" disabled={loading} onClick={() => void onRefresh()}>
          {loading ? 'Loading…' : 'Refresh brief (mock)'}
        </button>
        <Link href="/m/services/video" className="tt-talent-ai-btn tt-talent-ai-btn--ghost">
          ไป Video Feed
        </Link>
      </div>
    </div>
  );
}
