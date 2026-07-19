'use client';

import { Suspense } from 'react';
import { StatusChip } from '@aqond/ui';
import { TalentAiHistoryPanel } from '@/components/talent/ai/TalentAiHistoryPanel';
import { TalentAiIncubationBriefPanel } from '@/components/talent/ai/TalentAiIncubationBriefPanel';
import { TalentAiJobSuggestionPanel } from '@/components/talent/ai/TalentAiJobSuggestionPanel';
import { TalentAiPromptComposer } from '@/components/talent/ai/TalentAiPromptComposer';
import { TalentAiResumeDraftPanel } from '@/components/talent/ai/TalentAiResumeDraftPanel';
import { useTalentAiWorkspace } from '@/hooks/talent/useTalentAiWorkspace';
import type { TalentAiPanelId } from '@/lib/talent/talentAiTypes';

function PanelBody({ id }: { id: TalentAiPanelId }) {
  switch (id) {
    case 'resume':
      return <TalentAiResumeDraftPanel />;
    case 'jobs':
      return <TalentAiJobSuggestionPanel />;
    case 'incubation':
      return <TalentAiIncubationBriefPanel />;
    case 'history':
      return <TalentAiHistoryPanel />;
    case 'composer':
      return <TalentAiPromptComposer />;
    default:
      return null;
  }
}

function TalentAiWorkspaceInner() {
  const { activePanel, setActivePanel, panels } = useTalentAiWorkspace();

  return (
    <div className="tt-talent-page tt-talent-ai-workspace">
      <header className="tt-talent-page-head">
        <span className="tt-talent-page-icon" aria-hidden>
          🤖
        </span>
        <div>
          <p className="tt-talent-page-module">AI · TOS-4</p>
          <h2 className="tt-talent-page-title">AI Workspace</h2>
          <StatusChip tone="pending">UI only · integration ready</StatusChip>
        </div>
      </header>

      <nav className="tt-talent-ai-tabs" aria-label="AI workspace panels">
        {panels.map((p) => (
          <button
            key={p.id}
            type="button"
            className={activePanel === p.id ? 'active' : ''}
            aria-current={activePanel === p.id ? 'page' : undefined}
            onClick={() => setActivePanel(p.id)}
          >
            <span aria-hidden>{p.icon}</span>
            <span>{p.label}</span>
          </button>
        ))}
      </nav>

      <PanelBody id={activePanel} />

      <p className="tt-talent-shell-badge">Talent OS AI Layer · No LLM · No backend · TOS-4</p>
    </div>
  );
}

export function TalentAiWorkspace() {
  return (
    <Suspense fallback={<div className="tt-talent-loading" aria-busy>กำลังโหลด AI Workspace…</div>}>
      <TalentAiWorkspaceInner />
    </Suspense>
  );
}
