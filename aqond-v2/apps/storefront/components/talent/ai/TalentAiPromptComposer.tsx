'use client';

import { useState } from 'react';
import { StatusChip } from '@aqond/ui';
import { useTalentAi } from '@/lib/talent/ai/TalentAiContext';
import { PLACEHOLDER_PROMPT_TEMPLATES } from '@/lib/talent/talentAiPlaceholders';
import { useTalentAiWorkspace } from '@/hooks/talent/useTalentAiWorkspace';

export function TalentAiPromptComposer() {
  const { adapter, refreshHistory, lastError, clearError } = useTalentAi();
  const { activePanel } = useTalentAiWorkspace();
  const [prompt, setPrompt] = useState(PLACEHOLDER_PROMPT_TEMPLATES[0]?.prompt ?? '');
  const [loading, setLoading] = useState(false);
  const [lastSubmitId, setLastSubmitId] = useState<string | null>(null);

  const onSubmit = async () => {
    setLoading(true);
    clearError();
    try {
      const res = await adapter.submitPrompt({ prompt, panel: activePanel });
      setLastSubmitId(res.id);
      await refreshHistory();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tt-talent-ai-panel">
      <div className="tt-talent-ai-panel-head">
        <h3>Prompt Composer</h3>
        <StatusChip tone="active">Mock queue · TOS-9</StatusChip>
      </div>
      <p className="tt-talent-ai-hint">
        Adapter: <code>submitPrompt</code> — queues mock session · no ai-core route
      </p>

      <div className="tt-talent-ai-templates" role="group" aria-label="Prompt templates">
        {PLACEHOLDER_PROMPT_TEMPLATES.map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            className="tt-talent-ai-template-btn"
            onClick={() => setPrompt(tpl.prompt)}
          >
            {tpl.label}
          </button>
        ))}
      </div>

      <label className="tt-talent-ai-field">
        <span>Prompt</span>
        <textarea
          rows={6}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="เขียน prompt สำหรับ Talent AI…"
          data-talent-ai-field="composer.prompt"
        />
      </label>

      {lastError ? <p className="tt-talent-ai-error">{lastError}</p> : null}
      {lastSubmitId ? (
        <p className="tt-hint">Mock queued: <code>{lastSubmitId}</code></p>
      ) : null}

      <div className="tt-talent-ai-actions">
        <button type="button" className="tt-talent-ai-btn" disabled={loading} onClick={() => void onSubmit()}>
          {loading ? 'Queuing…' : 'Send prompt (mock)'}
        </button>
        <button type="button" className="tt-talent-ai-btn tt-talent-ai-btn--ghost" onClick={() => setPrompt('')}>
          Clear
        </button>
      </div>
    </div>
  );
}
