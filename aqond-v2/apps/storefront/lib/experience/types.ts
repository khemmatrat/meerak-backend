/** Sprint 30 — Experience Engine snapshot (BFF /api/experience/state) */

export type ExperienceLifecycle = {
  stage: string;
  stub?: boolean;
};

export type ExperienceIntents = {
  primary: string | null;
  secondary: string[];
  hidden: string[];
  surfaces?: string[];
  moduleOrder?: { id: string; rank: number }[];
  stub?: boolean;
};

export type ExperiencePersonalization = {
  stage?: string;
  modules?: { id: string; rank: number }[];
  showFtxOverlay?: boolean;
  showWizard?: boolean;
  showTour?: boolean;
  promotions?: unknown[];
  stub?: boolean;
};

export type ExperienceProfile = {
  userId?: string;
  guestId?: string | null;
  lifecycleStage?: string;
  primaryIntent?: string | null;
  secondaryIntents?: string[];
  wizardCompletedAt?: string | null;
  tourCompletedAt?: string | null;
  tourSkipped?: boolean;
  intentGraph?: { moduleOrder?: { id: string; rank: number }[] };
  referralSource?: string | null;
  country?: string | null;
  language?: string | null;
};

export type ExperienceSnapshot = {
  ok?: boolean;
  enabled?: boolean;
  stub?: boolean;
  userId?: string | null;
  guestId?: string | null;
  surface?: string;
  lifecycle?: ExperienceLifecycle;
  intents?: ExperienceIntents;
  personalization?: ExperiencePersonalization;
  profile?: ExperienceProfile | null;
  memory?: Record<string, unknown>;
  recommendations?: Record<string, unknown>;
  growth?: Record<string, unknown>;
  jarvisBrief?: Record<string, unknown>;
};
