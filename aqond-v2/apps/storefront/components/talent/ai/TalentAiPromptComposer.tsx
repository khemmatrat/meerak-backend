'use client';

import { useState } from 'react';
import { StatusChip } from '@aqond/ui';
import { PLACEHOLDER_PROMPT_TEMPLATES } from '@/lib/talent/talentAiPlaceholders';

export function TalentAiPromptComposer() {
  const [prompt, setPrompt] = useState(PLACEHOLDER_PROMPT_TEMPLATES[0]?.prompt ?? '');

  return (
    <div className="tt-talent-ai-panel">
      <div className="tt-talent-ai-panel-head">
        <h3>Prompt Composer</h3>
        <StatusChip tone="pending">No LLM · TOS-4</StatusChip>
      </div>
      <p className="tt-talent-ai-hint">Future: ส่งไป ai-core หลัง RFC — ตอนนี้เก็บ prompt ใน UI เท่านั้น</p>

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

      <div className="tt-talent-ai-actions">
        <button type="button" className="tt-talent-ai-btn" disabled title="TOS-5 RFC required — no LLM route">
          Send prompt
        </button>
        <button
          type="button"
          className="tt-talent-ai-btn tt-talent-ai-btn--ghost"
          onClick={() => setPrompt('')}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
