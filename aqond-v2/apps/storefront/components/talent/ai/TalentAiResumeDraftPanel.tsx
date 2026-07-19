'use client';

import { StatusChip } from '@aqond/ui';
import { PLACEHOLDER_RESUME_DRAFT } from '@/lib/talent/talentAiPlaceholders';

export function TalentAiResumeDraftPanel() {
  const draft = PLACEHOLDER_RESUME_DRAFT;

  return (
    <div className="tt-talent-ai-panel">
      <div className="tt-talent-ai-panel-head">
        <h3>Resume Draft</h3>
        <StatusChip tone="pending">Placeholder · TOS-4</StatusChip>
      </div>
      <p className="tt-talent-ai-hint">
        Future: <code>/v1/talent/resume-draft</code> → publish via <code>/api/talent-resume/publish</code>
      </p>

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

      <div className="tt-talent-ai-actions">
        <button type="button" className="tt-talent-ai-btn" disabled title="TOS-5 RFC required">
          Generate draft
        </button>
        <button type="button" className="tt-talent-ai-btn tt-talent-ai-btn--ghost" disabled title="TOS-5 RFC required">
          Publish to profile
        </button>
      </div>
    </div>
  );
}
