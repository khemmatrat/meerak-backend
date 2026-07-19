'use client';

import Link from 'next/link';
import { useState } from 'react';
import { StatusChip } from '@aqond/ui';
import { useTalentAi } from '@/lib/talent/ai/TalentAiContext';
import { PLACEHOLDER_JOB_SUGGESTIONS } from '@/lib/talent/talentAiPlaceholders';
import type { TalentAiJobSuggestionPlaceholder } from '@/lib/talent/talentAiTypes';

const SURFACE_LABEL: Record<string, string> = {
  match: 'Match Job',
  board: 'Job Board',
  booking: 'Booking',
  video: 'Video Feed',
};

export function TalentAiJobSuggestionPanel() {
  const { adapter, refreshHistory, lastError, clearError } = useTalentAi();
  const [profession, setProfession] = useState('ช่างไฟ');
  const [suggestions, setSuggestions] = useState<TalentAiJobSuggestionPlaceholder[]>(
    PLACEHOLDER_JOB_SUGGESTIONS,
  );
  const [loading, setLoading] = useState(false);

  const onSuggest = async () => {
    setLoading(true);
    clearError();
    try {
      const rows = await adapter.suggestJobs({ profession });
      setSuggestions(rows);
      await refreshHistory();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tt-talent-ai-panel">
      <div className="tt-talent-ai-panel-head">
        <h3>Job Suggestion</h3>
        <StatusChip tone="active">Mock adapter · TOS-9</StatusChip>
      </div>
      <p className="tt-talent-ai-hint">Adapter: <code>suggestJobs</code> — client routing matrix mock</p>

      <label className="tt-talent-ai-field">
        <span>Profession</span>
        <input
          type="text"
          value={profession}
          onChange={(e) => setProfession(e.target.value)}
          data-talent-ai-field="jobs.profession"
        />
      </label>

      <div className="tt-talent-ai-actions">
        <button type="button" className="tt-talent-ai-btn" disabled={loading} onClick={() => void onSuggest()}>
          {loading ? 'Suggesting…' : 'Suggest jobs (mock)'}
        </button>
      </div>

      {lastError ? <p className="tt-talent-ai-error">{lastError}</p> : null}

      <ul className="tt-talent-ai-suggest-list">
        {suggestions.map((s) => (
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
