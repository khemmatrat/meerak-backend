'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import {
  dismissJarvisBrief,
  fetchJarvisBrief,
  postExperienceEvent,
} from '@/lib/experience/experienceClient';
import { isJarvisProactiveEnabled } from '@/lib/experience/flags';
import { isTourCompletedLocally } from '@/lib/experience/tourStorage';
import { isWizardCompletedLocally } from '@/lib/experience/wizardStorage';

const SESSION_KEY = 'aqond_jarvis_greet_v1';

type FtxJarvisGreetProps = {
  enabled: boolean;
  wizardDone: boolean;
  tourDone: boolean;
};

export function FtxJarvisGreet({ enabled, wizardDone, tourDone }: FtxJarvisGreetProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [briefId, setBriefId] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !isJarvisProactiveEnabled()) return;
    if (!wizardDone && !isWizardCompletedLocally()) return;
    if (!tourDone && !isTourCompletedLocally()) return;
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(SESSION_KEY)) return;

    void fetchJarvisBrief('home').then((brief) => {
      if (brief?.enabled === false) return;
      const top = brief?.top || brief?.proactive?.[0];
      const line = top?.message;
      if (!line || !top?.id) return;
      setMessage(line);
      setBriefId(top.id);
      sessionStorage.setItem(SESSION_KEY, top.id);
      void postExperienceEvent('ftx.jarvis_greet_shown', {
        surface: 'home',
        brief_id: top.id,
        trigger: (top as { trigger?: string }).trigger,
      });
      window.dispatchEvent(
        new CustomEvent('aqond:jarvis-greet', { detail: { message: line, open: false } }),
      );
    });
  }, [enabled, wizardDone, tourDone]);

  const onDismiss = () => {
    if (briefId) void dismissJarvisBrief(briefId);
    setMessage(null);
  };

  if (!message) return null;

  return (
    <div className="ftx-jarvis-greet" role="status">
      <Image src="/jarvis-icon.png" alt="" className="ftx-jarvis-greet-icon-img" width={28} height={28} unoptimized />
      <p>{message}</p>
      <button
        type="button"
        className="ftx-jarvis-greet-open"
        onClick={() =>
          window.dispatchEvent(
            new CustomEvent('aqond:jarvis-greet', { detail: { message, open: true } }),
          )
        }
      >
        คุยกับ Jarvis
      </button>
      <button
        type="button"
        className="ftx-jarvis-greet-close"
        onClick={onDismiss}
        aria-label="ปิด"
      >
        ✕
      </button>
    </div>
  );
}
