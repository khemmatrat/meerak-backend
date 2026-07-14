'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AqondButton, AqondCard } from '@aqond/components';
import { useAuth } from '@/lib/auth';
import { postExperienceEvent, submitWizardPreferences } from '@/lib/experience/experienceClient';
import { resolveIntentRedirect } from '@/lib/experience/intentRedirect';
import {
  COUNTRY_OPTIONS,
  REFERRAL_SOURCES,
  WIZARD_INTERESTS,
  WIZARD_STEPS,
  type WizardStep,
} from '@/lib/experience/wizardConfig';
import {
  isWizardCompletedLocally,
  loadWizardDraft,
  markWizardCompletedLocally,
  saveWizardDraft,
} from '@/lib/experience/wizardStorage';
import { useFtxActive } from '@/lib/experience/useFtxActive';
import '@/components/experience/ftx-axs.css';

export function FtxSmartEntryWizard() {
  const router = useRouter();
  const params = useSearchParams();
  const ftxActive = useFtxActive();
  const { auth } = useAuth();
  const from = params.get('from') || 'direct';

  const [stepIdx, setStepIdx] = useState(0);
  const [referralSource, setReferralSource] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [email, setEmail] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [country, setCountry] = useState('TH');
  const [language, setLanguage] = useState<'th' | 'en'>('th');
  const [interests, setInterests] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const step = WIZARD_STEPS[stepIdx];

  useEffect(() => {
    const draft = loadWizardDraft();
    if (draft.referralSource) setReferralSource(draft.referralSource);
    if (draft.birthDate) setBirthDate(draft.birthDate);
    if (draft.email) setEmail(draft.email);
    if (draft.referralCode) setReferralCode(draft.referralCode);
    if (draft.country) setCountry(draft.country);
    if (draft.language) setLanguage(draft.language);
    if (draft.interests?.length) setInterests(draft.interests);
    if (draft.lastStep) {
      const idx = WIZARD_STEPS.indexOf(draft.lastStep);
      if (idx >= 0) setStepIdx(idx);
    }
    void postExperienceEvent('ftx.wizard_started', { from, surface: 'wizard' });
  }, [from]);

  useEffect(() => {
    if (!ftxActive) return;
    if (isWizardCompletedLocally() && from !== 'replay') {
      router.replace('/m/home');
    }
  }, [ftxActive, from, router]);

  const progress = useMemo(() => Math.round(((stepIdx + 1) / WIZARD_STEPS.length) * 100), [stepIdx]);

  const persistDraft = (nextStep?: WizardStep) => {
    saveWizardDraft({
      referralSource,
      birthDate: birthDate || undefined,
      email: email || undefined,
      referralCode: referralCode || undefined,
      country,
      language,
      interests,
      lastStep: nextStep || step,
    });
  };

  const toggleInterest = (id: string) => {
    setInterests((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const goNext = () => {
    if (step === 'referral' && !referralSource) {
      setError('เลือกช่องทางที่รู้จักเราก่อน');
      return;
    }
    if (step === 'interests' && interests.length === 0) {
      setError('เลือกความสนใจอย่างน้อย 1 ข้อ');
      return;
    }
    setError('');
    persistDraft(WIZARD_STEPS[stepIdx + 1]);
    if (stepIdx < WIZARD_STEPS.length - 1) {
      setStepIdx((i) => i + 1);
      return;
    }
    void finishWizard();
  };

  const goBack = () => {
    setError('');
    if (stepIdx === 0) {
      router.replace('/m/home');
      return;
    }
    setStepIdx((i) => i - 1);
  };

  const finishWizard = async () => {
    setSubmitting(true);
    setError('');
    persistDraft();
    const result = await submitWizardPreferences({
      referralSource,
      birthDate,
      email,
      referralCode,
      country,
      language,
      interests,
      completeWizard: true,
    });
    setSubmitting(false);

    if (!result.ok && auth) {
      setError('บันทึกไม่สำเร็จ ลองอีกครั้ง');
      return;
    }

    markWizardCompletedLocally();
    void postExperienceEvent('ftx.wizard_completed', {
      primary: interests[0],
      interests,
      from,
    });

    const href = result.redirectPath || resolveIntentRedirect(interests[0]);
    router.replace(href);
  };

  const skipWizard = () => {
    markWizardCompletedLocally();
    void postExperienceEvent('ftx.wizard_skipped', { from, step });
    router.replace('/m/home');
  };

  if (!ftxActive) {
    return (
      <div className="ftx-wizard-page">
        <p className="ftx-wizard-hint">FTX ปิดอยู่ — เปิดด้วย ?ftx=1</p>
        <Link href="/m/home" className="ftx-wizard-link">
          กลับหน้าแรก
        </Link>
      </div>
    );
  }

  return (
    <div className="ftx-wizard-page">
      <header className="ftx-wizard-header">
        <button type="button" className="ftx-wizard-back" onClick={goBack}>
          ‹
        </button>
        <div className="ftx-wizard-progress-wrap">
          <div className="ftx-wizard-progress" style={{ width: `${progress}%` }} />
        </div>
        <button type="button" className="ftx-wizard-skip-top" onClick={skipWizard}>
          ข้าม
        </button>
      </header>

      <div className="ftx-wizard-body">
        <p className="ftx-wizard-kicker">Smart Entry</p>
        <h1 className="ftx-wizard-title">
          {step === 'referral' && 'คุณรู้จัก AQOND จากไหน?'}
          {step === 'profile' && 'ข้อมูลเบื้องต้น (ไม่บังคับ)'}
          {step === 'interests' && 'สนใจอะไรบ้าง?'}
        </h1>
        <p className="ftx-wizard-sub">
          {step === 'interests'
            ? 'เลือกได้หลายข้อ — ข้อแรกจะเป็นความสนใจหลัก'
            : 'ช่วยให้เราแนะนำโมดูลที่เหมาะกับคุณ'}
        </p>

        {step === 'referral' && (
          <div className="ftx-wizard-chip-grid">
            {REFERRAL_SOURCES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`ftx-wizard-chip${referralSource === item.id ? ' active' : ''}`}
                onClick={() => setReferralSource(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}

        {step === 'profile' && (
          <AqondCard className="ftx-wizard-form">
            <label className="ftx-wizard-field">
              <span>วันเกิด</span>
              <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
            </label>
            <label className="ftx-wizard-field">
              <span>อีเมล</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@email.com"
              />
            </label>
            <label className="ftx-wizard-field">
              <span>รหัสแนะนำ (ถ้ามี)</span>
              <input
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value)}
                placeholder="REF-XXXX"
              />
            </label>
            <label className="ftx-wizard-field">
              <span>ประเทศ</span>
              <select value={country} onChange={(e) => setCountry(e.target.value)}>
                {COUNTRY_OPTIONS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="ftx-wizard-field">
              <span>ภาษา</span>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as 'th' | 'en')}
              >
                <option value="th">ไทย</option>
                <option value="en">English</option>
              </select>
            </label>
          </AqondCard>
        )}

        {step === 'interests' && (
          <div className="ftx-wizard-interest-grid">
            {WIZARD_INTERESTS.map((item) => {
              const active = interests.includes(item.id);
              const primary = interests[0] === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`ftx-wizard-interest${active ? ' active' : ''}${primary ? ' primary' : ''}`}
                  onClick={() => toggleInterest(item.id)}
                >
                  <span aria-hidden>{item.emoji}</span>
                  <span>{item.label}</span>
                  {primary && <em>หลัก</em>}
                </button>
              );
            })}
          </div>
        )}

        {error && <p className="ftx-wizard-error">{error}</p>}
      </div>

      <footer className="ftx-wizard-footer">
        <AqondButton type="button" className="ftx-wizard-next" onClick={goNext} disabled={submitting}>
          {step === 'interests' ? (submitting ? 'กำลังบันทึก…' : 'เสร็จสิ้น') : 'ถัดไป'}
        </AqondButton>
      </footer>
    </div>
  );
}
