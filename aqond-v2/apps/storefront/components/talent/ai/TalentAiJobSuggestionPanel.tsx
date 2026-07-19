'use client';

import Link from 'next/link';
import { StatusChip } from '@aqond/ui';
import { PLACEHOLDER_JOB_SUGGESTIONS } from '@/lib/talent/talentAiPlaceholders';

const SURFACE_LABEL: Record<string, string> = {
  match: 'Match Job',
  board: 'Job Board',
  booking: 'Booking',
  video: 'Video Feed',
};

export function TalentAiJobSuggestionPanel() {
  return (
    <div className="tt-talent-ai-panel">
      <div className="tt-talent-ai-panel-head">
        <h3>Job Suggestion</h3>
        <StatusChip tone="pending">Placeholder · workTaxonomy</StatusChip>
      </div>
      <p className="tt-talent-ai-hint">
        Future: client routing matrix + rules — ไม่มี LLM ใน TOS-4
      </p>
      <ul className="tt-talent-ai-suggest-list">
        {PLACEHOLDER_JOB_SUGGESTIONS.map((s) => (
          <li key={s.id}>
            <Link href={s.href} className="tt-talent-ai-suggest-card" data-talent-ai-suggestion={s.id}>
              <div className="tt-talent-ai-suggest-top">
                <strong>{SURFACE_LABEL[s.surface] || s.surface}</strong>
                <StatusChip tone="active">{s.profession}</StatusChip>
              </div>
              <p>{s.reason}</p>
              <span className="tt-talent-ai-suggest-link">ไปยังระบบเดิม →</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/m/services/create/routing" className="tt-talent-ai-inline-link">
        เปิด Work Routing Matrix
      </Link>
    </div>
  );
}
