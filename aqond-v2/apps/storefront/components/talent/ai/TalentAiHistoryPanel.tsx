'use client';

import { StatusChip } from '@aqond/ui';
import { useTalentAi } from '@/lib/talent/ai/TalentAiContext';
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
  const { history, historyLoading, refreshHistory, providerId, lastError } = useTalentAi();

  return (
    <div className="tt-talent-ai-panel">
      <div className="tt-talent-ai-panel-head">
        <h3>AI History</h3>
        <StatusChip tone="active">{providerId} · localStorage</StatusChip>
      </div>
      <p className="tt-talent-ai-hint">
        Adapter: <code>listHistory</code> — UI session store only · no vector DB
      </p>

      <div className="tt-talent-ai-actions">
        <button type="button" className="tt-talent-ai-btn tt-talent-ai-btn--ghost" disabled={historyLoading} onClick={() => void refreshHistory()}>
          {historyLoading ? 'Loading…' : 'Reload history'}
        </button>
      </div>

      {lastError ? <p className="tt-talent-ai-error">{lastError}</p> : null}

      {historyLoading ? (
        <p className="tt-hint" aria-busy>
          กำลังโหลดประวัติ…
        </p>
      ) : (
        <ul className="tt-talent-ai-history-list">
          {history.map((entry) => (
            <li key={entry.id} className="tt-talent-ai-history-item" data-talent-ai-history={entry.id}>
              <div className="tt-talent-ai-history-top">
                <strong>{entry.title}</strong>
                <StatusChip tone={entry.status === 'completed' ? 'active' : 'pending'}>{entry.status}</StatusChip>
              </div>
              <p className="tt-talent-ai-history-meta">
                {panelLabel(entry.panel)} · {formatWhen(entry.createdAt)}
              </p>
              <p>{entry.preview}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
