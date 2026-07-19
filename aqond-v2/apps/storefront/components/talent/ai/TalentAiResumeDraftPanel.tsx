'use client';

import { useState } from 'react';
import { StatusChip } from '@aqond/ui';
import { useTalentAi } from '@/lib/talent/ai/TalentAiContext';
import { PLACEHOLDER_RESUME_DRAFT } from '@/lib/talent/talentAiPlaceholders';
import type { TalentAiResumeDraftPlaceholder } from '@/lib/talent/talentAiTypes';

export function TalentAiResumeDraftPanel() {
  const { adapter, refreshHistory, lastError, clearError } = useTalentAi();
  const [notes, setNotes] = useState('');
  const [draft, setDraft] = useState<TalentAiResumeDraftPlaceholder>(PLACEHOLDER_RESUME_DRAFT);
  const [loading, setLoading] = useState(false);

  const onGenerate = async () => {
    setLoading(true);
    clearError();
    try {
      const next = await adapter.generateResumeDraft({ notes });
      setDraft(next);
      await refreshHistory();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tt-talent-ai-panel">
      <div className="tt-talent-ai-panel-head">
        <h3>Resume Draft</h3>
        <StatusChip tone="active">Mock adapter · TOS-9</StatusChip>
      </div>
      <p className="tt-talent-ai-hint">
        Adapter: <code>TalentAiIntegrationPort.generateResumeDraft</code> — no LLM call
      </p>

      <label className="tt-talent-ai-field">
        <span>Notes (optional)</span>
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="ใส่โน้ตสำหรับ mock draft…"
          data-talent-ai-field="resume.notes"
        />
      </label>

      <label className="tt-talent-ai-field">
        <span>Headline</span>
        <input type="text" readOnly value={draft.headline} data-talent-ai-field="resume.headline" />
      </label>
      <label className="tt-talent-ai-field">
        <span>Summary</span>
        <textarea readOnly rows={3} value={draft.summary} data-talent-ai-field="resume.summary" />
      </label>
      <label className="tt-talent-ai-field">
        <span>Skills</span>
        <div className="tt-talent-ai-chips">
          {draft.skills.map((s) => (
            <span key={s} className="tt-talent-ai-chip">
              {s}
            </span>
          ))}
        </div>
      </label>
      <label className="tt-talent-ai-field">
        <span>Journey</span>
        <textarea readOnly rows={3} value={draft.journey} data-talent-ai-field="resume.journey" />
      </label>

      {lastError ? <p className="tt-talent-ai-error">{lastError}</p> : null}

      <div className="tt-talent-ai-actions">
        <button type="button" className="tt-talent-ai-btn" disabled={loading} onClick={() => void onGenerate()}>
          {loading ? 'Generating…' : 'Generate draft (mock)'}
        </button>
        <button type="button" className="tt-talent-ai-btn tt-talent-ai-btn--ghost" disabled title="Publish RFC later">
          Publish to profile
        </button>
      </div>
    </div>
  );
}
