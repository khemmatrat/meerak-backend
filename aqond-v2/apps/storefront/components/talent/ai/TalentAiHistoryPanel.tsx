'use client';

import { StatusChip } from '@aqond/ui';
import { PLACEHOLDER_AI_HISTORY } from '@/lib/talent/talentAiPlaceholders';
import { TALENT_AI_PANELS } from '@/lib/talent/talentAiTypes';

function formatWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function panelLabel(id: string): string {
  return TALENT_AI_PANELS.find((p) => p.id === id)?.label ?? id;
}

export function TalentAiHistoryPanel() {
  return (
    <div className="tt-talent-ai-panel">
      <div className="tt-talent-ai-panel-head">
        <h3>AI History</h3>
        <StatusChip tone="default">Local placeholder</StatusChip>
      </div>
      <p className="tt-talent-ai-hint">Future: session list from TOS-5 — ไม่มี vector store ใน TOS-4</p>

      <ul className="tt-talent-ai-history-list">
        {PLACEHOLDER_AI_HISTORY.map((entry) => (
          <li key={entry.id} className="tt-talent-ai-history-item" data-talent-ai-history={entry.id}>
            <div className="tt-talent-ai-history-top">
              <strong>{entry.title}</strong>
              <StatusChip tone="pending">{entry.status}</StatusChip>
            </div>
            <p className="tt-talent-ai-history-meta">
              {panelLabel(entry.panel)} · {formatWhen(entry.createdAt)}
            </p>
            <p>{entry.preview}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
