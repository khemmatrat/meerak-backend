/** Client-side wizard draft + completion (guest-safe until login merge) */

import type { WizardStep } from './wizardConfig';

const STORAGE_KEY = 'aqond_ftx_wizard_v1';

export type WizardDraft = {
  referralSource?: string;
  birthDate?: string;
  email?: string;
  referralCode?: string;
  country?: string;
  language?: 'th' | 'en';
  interests?: string[];
  wizardCompletedAt?: string;
  lastStep?: WizardStep;
};

function read(): WizardDraft {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WizardDraft) : {};
  } catch {
    return {};
  }
}

function write(draft: WizardDraft) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
}

export function loadWizardDraft(): WizardDraft {
  return read();
}

export function saveWizardDraft(patch: Partial<WizardDraft>) {
  write({ ...read(), ...patch });
}

export function isWizardCompletedLocally(): boolean {
  return Boolean(read().wizardCompletedAt);
}

export function markWizardCompletedLocally() {
  saveWizardDraft({ wizardCompletedAt: new Date().toISOString() });
}

export function clearWizardDraft() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}
