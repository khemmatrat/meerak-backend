import type { TalentAiIntegrationPort, TalentAiPanelId } from '@/lib/talent/talentAiTypes';

export type TalentAiProviderId = 'mock';

/** Thin adapter over `TalentAiIntegrationPort` — swap provider without UI changes */
export class TalentAiAdapter {
  readonly providerId: TalentAiProviderId;

  constructor(
    private readonly port: TalentAiIntegrationPort,
    providerId: TalentAiProviderId = 'mock',
  ) {
    this.providerId = providerId;
  }

  generateResumeDraft(input: { notes: string }) {
    return this.port.generateResumeDraft(input);
  }

  suggestJobs(input: { profession: string }) {
    return this.port.suggestJobs(input);
  }

  fetchIncubationBrief() {
    return this.port.fetchIncubationBrief();
  }

  listHistory() {
    return this.port.listHistory();
  }

  submitPrompt(input: { prompt: string; panel: TalentAiPanelId }) {
    return this.port.submitPrompt(input);
  }
}

export function createTalentAiAdapter(port: TalentAiIntegrationPort, providerId: TalentAiProviderId = 'mock') {
  return new TalentAiAdapter(port, providerId);
}
