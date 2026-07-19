/** TOS-4 AI workspace types — integration contracts only, no runtime */

export type TalentAiPanelId = 'resume' | 'jobs' | 'incubation' | 'history' | 'composer';

export type TalentAiPanelMeta = {
  id: TalentAiPanelId;
  label: string;
  icon: string;
  description: string;
  futureEndpoint?: string;
};

export const TALENT_AI_PANELS: TalentAiPanelMeta[] = [
  {
    id: 'resume',
    label: 'Resume Draft',
    icon: '📝',
    description: 'ร่างประสบการณ์ · ทักษะ · journey',
    futureEndpoint: '/v1/talent/resume-draft',
  },
  {
    id: 'jobs',
    label: 'Job Suggest',
    icon: '🎯',
    description: 'แนะนำช่องทางงานจาก profession matrix',
    futureEndpoint: 'workTaxonomy.ts (client)',
  },
  {
    id: 'incubation',
    label: 'Incubation',
    icon: '🎬',
    description: 'สคริปต์คลิป 15 วินาที → CTA จอง',
    futureEndpoint: 'incubation-brief.js',
  },
  {
    id: 'history',
    label: 'History',
    icon: '🕘',
    description: 'ประวัติคำขอ AI ล่าสุด',
    futureEndpoint: 'TOS-5 session store',
  },
  {
    id: 'composer',
    label: 'Composer',
    icon: '✨',
    description: 'เขียน prompt ก่อนส่ง LLM',
    futureEndpoint: 'ai-core (RFC)',
  },
];

export type TalentAiHistoryEntry = {
  id: string;
  panel: TalentAiPanelId;
  title: string;
  preview: string;
  status: 'placeholder' | 'queued' | 'completed' | 'failed';
  createdAt: string;
};

export type TalentAiResumeDraftPlaceholder = {
  headline: string;
  summary: string;
  skills: string[];
  journey: string;
};

export type TalentAiJobSuggestionPlaceholder = {
  id: string;
  profession: string;
  surface: 'match' | 'board' | 'booking' | 'video';
  reason: string;
  href: string;
};

export type TalentAiIncubationBriefPlaceholder = {
  weekLabel: string;
  hook: string;
  script: string;
  cta: string;
};

export type TalentAiPromptTemplate = {
  id: string;
  label: string;
  prompt: string;
};

/** Future hook surface — implement in TOS-5+ */
export type TalentAiIntegrationPort = {
  generateResumeDraft: (input: { notes: string }) => Promise<TalentAiResumeDraftPlaceholder>;
  suggestJobs: (input: { profession: string }) => Promise<TalentAiJobSuggestionPlaceholder[]>;
  fetchIncubationBrief: () => Promise<TalentAiIncubationBriefPlaceholder>;
  listHistory: () => Promise<TalentAiHistoryEntry[]>;
  submitPrompt: (input: { prompt: string; panel: TalentAiPanelId }) => Promise<{ id: string }>;
};
