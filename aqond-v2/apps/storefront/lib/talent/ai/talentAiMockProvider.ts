import {
  PLACEHOLDER_AI_HISTORY,
  PLACEHOLDER_INCUBATION_BRIEF,
  PLACEHOLDER_JOB_SUGGESTIONS,
  PLACEHOLDER_RESUME_DRAFT,
} from '@/lib/talent/talentAiPlaceholders';
import type {
  TalentAiHistoryEntry,
  TalentAiIncubationBriefPlaceholder,
  TalentAiIntegrationPort,
  TalentAiJobSuggestionPlaceholder,
  TalentAiPanelId,
  TalentAiResumeDraftPlaceholder,
} from '@/lib/talent/talentAiTypes';

export const TALENT_AI_HISTORY_STORAGE_KEY = 'aqond_talent_ai_history_v1';

const MOCK_DELAY_MS = 280;

function delay(ms = MOCK_DELAY_MS): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readStoredHistory(): TalentAiHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(TALENT_AI_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TalentAiHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function writeStoredHistory(entries: TalentAiHistoryEntry[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TALENT_AI_HISTORY_STORAGE_KEY, JSON.stringify(entries.slice(0, 40)));
  } catch {
    /* ignore */
  }
}

function appendHistory(entry: TalentAiHistoryEntry) {
  const next = [entry, ...readStoredHistory()].slice(0, 40);
  writeStoredHistory(next);
  return next;
}

function mergeHistory(stored: TalentAiHistoryEntry[]): TalentAiHistoryEntry[] {
  const seen = new Set<string>();
  const merged: TalentAiHistoryEntry[] = [];
  for (const e of [...stored, ...PLACEHOLDER_AI_HISTORY]) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    merged.push(e);
  }
  return merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/** Mock implementation of TOS-4 port — no LLM, API, vector, or embedding */
export function createTalentAiMockProvider(): TalentAiIntegrationPort {
  return {
    async generateResumeDraft(input: { notes: string }): Promise<TalentAiResumeDraftPlaceholder> {
      await delay();
      const notes = input.notes.trim();
      const draft: TalentAiResumeDraftPlaceholder = {
        ...PLACEHOLDER_RESUME_DRAFT,
        summary: notes
          ? `[Mock adapter] ${PLACEHOLDER_RESUME_DRAFT.summary}\n\nNotes: ${notes}`
          : `[Mock adapter] ${PLACEHOLDER_RESUME_DRAFT.summary}`,
      };
      appendHistory({
        id: `mock-resume-${Date.now()}`,
        panel: 'resume',
        title: 'Resume draft (mock)',
        preview: draft.headline,
        status: 'completed',
        createdAt: new Date().toISOString(),
      });
      return draft;
    },

    async suggestJobs(input: { profession: string }): Promise<TalentAiJobSuggestionPlaceholder[]> {
      await delay();
      const profession = input.profession.trim() || 'ช่างไฟ';
      const suggestions = PLACEHOLDER_JOB_SUGGESTIONS.map((s) => ({
        ...s,
        profession,
        reason: `[Mock] ${s.reason}`,
      }));
      appendHistory({
        id: `mock-jobs-${Date.now()}`,
        panel: 'jobs',
        title: `Job suggest · ${profession}`,
        preview: `${suggestions.length} surfaces`,
        status: 'completed',
        createdAt: new Date().toISOString(),
      });
      return suggestions;
    },

    async fetchIncubationBrief(): Promise<TalentAiIncubationBriefPlaceholder> {
      await delay();
      const brief: TalentAiIncubationBriefPlaceholder = {
        ...PLACEHOLDER_INCUBATION_BRIEF,
        weekLabel: `[Mock] ${PLACEHOLDER_INCUBATION_BRIEF.weekLabel}`,
      };
      appendHistory({
        id: `mock-incubation-${Date.now()}`,
        panel: 'incubation',
        title: 'Incubation brief (mock)',
        preview: brief.hook,
        status: 'completed',
        createdAt: new Date().toISOString(),
      });
      return brief;
    },

    async listHistory(): Promise<TalentAiHistoryEntry[]> {
      await delay(120);
      return mergeHistory(readStoredHistory());
    },

    async submitPrompt(input: {
      prompt: string;
      panel: TalentAiPanelId;
    }): Promise<{ id: string }> {
      await delay();
      const id = `mock-prompt-${Date.now()}`;
      appendHistory({
        id,
        panel: input.panel,
        title: 'Prompt queued (mock)',
        preview: input.prompt.slice(0, 120) || '(empty prompt)',
        status: 'queued',
        createdAt: new Date().toISOString(),
      });
      return { id };
    },
  };
}
