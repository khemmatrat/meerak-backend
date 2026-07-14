'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { isWelcomeDismissed, markWelcomeDismissed } from '@/lib/experience/guestStorage';
import { isWizardCompletedLocally } from '@/lib/experience/wizardStorage';
import { isTourCompletedLocally } from '@/lib/experience/tourStorage';
import { useExperienceState } from '@/lib/experience/useExperienceState';
import { useFtxActive } from '@/lib/experience/useFtxActive';
import { TtHomeSearchBar } from '@/components/mobile/TtHomeSearchBar';
import { FtxHomeHeader } from './FtxHomeHeader';
import { FtxWelcomeOverlay } from './FtxWelcomeOverlay';
import { FtxGuidedTour } from './FtxGuidedTour';
import { FtxJarvisGreet } from './FtxJarvisGreet';
import './ftx-axs.css';

type FtxHomeShellProps = {
  category?: string;
  children: React.ReactNode;
};

function FtxHomeShellInner({ category, children }: FtxHomeShellProps) {
  const router = useRouter();
  const ftxActive = useFtxActive();
  const { auth } = useAuth();
  const { state, postEvent } = useExperienceState('home', ftxActive);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourDone, setTourDone] = useState(false);
  const wizardPrompted = useRef(false);
  const tourPrompted = useRef(false);

  const wizardDone = Boolean(state?.profile?.wizardCompletedAt) || isWizardCompletedLocally();
  const tourCompleted =
    tourDone || Boolean(state?.profile?.tourCompletedAt) || isTourCompletedLocally();

  useEffect(() => {
    if (!ftxActive || !state?.enabled) return;
    const show =
      !auth &&
      Boolean(state.personalization?.showFtxOverlay) &&
      !isWelcomeDismissed() &&
      !wizardDone;
    setWelcomeOpen(show);
    if (show) void postEvent('ftx.welcome_shown', { surface: 'home' });
  }, [ftxActive, state, auth, postEvent, wizardDone]);

  useEffect(() => {
    if (!ftxActive || !state?.enabled || !auth || wizardPrompted.current) return;
    const needsWizard =
      Boolean(state.personalization?.showWizard) && !wizardDone;
    if (needsWizard) {
      wizardPrompted.current = true;
      router.replace('/m/ftx/wizard?from=home');
    }
  }, [ftxActive, state, auth, router, wizardDone]);

  useEffect(() => {
    if (!ftxActive || !state?.enabled || tourPrompted.current || tourCompleted) return;
    const shouldTour =
      Boolean(state.personalization?.showTour) ||
      (wizardDone && !isTourCompletedLocally());
    if (shouldTour) {
      tourPrompted.current = true;
      const t = window.setTimeout(() => setTourOpen(true), 600);
      return () => window.clearTimeout(t);
    }
  }, [ftxActive, state, wizardDone, tourCompleted]);

  const dismissWelcome = (eventType: string) => {
    markWelcomeDismissed();
    setWelcomeOpen(false);
    void postEvent(eventType, { surface: 'home' });
  };

  const startWizard = () => {
    markWelcomeDismissed();
    setWelcomeOpen(false);
    void postEvent('ftx.welcome_wizard_cta', { surface: 'home' });
    router.push('/m/ftx/wizard?from=welcome');
  };

  const closeTour = () => {
    setTourOpen(false);
    setTourDone(true);
  };

  if (!ftxActive) {
    return (
      <>
        <header className="tt-header">
          <TtHomeSearchBar category={category} />
        </header>
        {children}
      </>
    );
  }

  return (
    <div className="ftx-home-shell" data-ftx="1" data-experience-loading={state ? '0' : '1'}>
      <FtxHomeHeader category={category} />
      {children}
      <FtxWelcomeOverlay
        open={welcomeOpen}
        onDismiss={() => dismissWelcome('ftx.welcome_dismissed')}
        onExplore={() => dismissWelcome('ftx.welcome_explore')}
        onStartWizard={startWizard}
      />
      <FtxGuidedTour open={tourOpen} onClose={closeTour} />
      <FtxJarvisGreet enabled={ftxActive} wizardDone={wizardDone} tourDone={tourCompleted} />
    </div>
  );
}

export function FtxHomeShell(props: FtxHomeShellProps) {
  return (
    <Suspense
      fallback={
        <>
          <header className="tt-header">
            <TtHomeSearchBar category={props.category} />
          </header>
          {props.children}
        </>
      }
    >
      <FtxHomeShellInner {...props} />
    </Suspense>
  );
}
