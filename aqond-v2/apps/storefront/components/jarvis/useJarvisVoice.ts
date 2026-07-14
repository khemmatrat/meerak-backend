'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createSpeechRecognition,
  isJarvisVoicePathEnabled,
  isSpeechSupported,
  preloadVoices,
  speakWithProfile,
  stopSpeaking,
  type JarvisVoiceProfile,
} from '@/lib/jarvis/voice';
import { startMicAnalyser, type MicAnalyserHandle } from '@/lib/jarvis/micAnalyser';
import { shouldFallbackToText } from '@aqond/voice';

const TTS_KEY = 'aqond_jarvis_tts';
const WAVE_BARS = 16;
const DEFAULT_VOICE: JarvisVoiceProfile = {
  stt_locale: 'th-TH',
  tts_locale: 'th-TH',
  voice_hint: 'th',
  tts_rate: 1.02,
  tts_pitch: 1,
};

export type VoicePhase = 'idle' | 'listening' | 'processing' | 'speaking';

export function useJarvisVoice(
  onTranscript: (text: string) => void,
  opts?: { userId?: string; voiceProfile?: JarvisVoiceProfile | null },
) {
  const [supported, setSupported] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [finalHint, setFinalHint] = useState('');
  const [ttsOn, setTtsOn] = useState(true);
  const [voicePhase, setVoicePhase] = useState<VoicePhase>('idle');
  const [waveLevels, setWaveLevels] = useState<number[]>([]);
  const [voiceProfile, setVoiceProfile] = useState<JarvisVoiceProfile>(DEFAULT_VOICE);
  const recRef = useRef<SpeechRecognition | null>(null);
  const micRef = useRef<MicAnalyserHandle | null>(null);
  const rafRef = useRef<number>(0);
  const listenStartedRef = useRef<number>(0);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const profileRef = useRef(voiceProfile);
  profileRef.current = opts?.voiceProfile || voiceProfile;

  const stopWaveLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    micRef.current?.stop();
    micRef.current = null;
    setWaveLevels([]);
  }, []);

  const startWaveLoop = useCallback(() => {
    const tick = () => {
      if (micRef.current) {
        setWaveLevels(micRef.current.getLevels(WAVE_BARS));
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    const speechOk = isSpeechSupported();
    const flagOn = isJarvisVoicePathEnabled();
    setSupported(speechOk);
    setVoiceEnabled(speechOk && flagOn);
    preloadVoices();

    if (opts?.voiceProfile) {
      setVoiceProfile({ ...DEFAULT_VOICE, ...opts.voiceProfile });
    } else if (flagOn) {
      fetch('/api/jarvis/voice-profile', { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => {
          if (d.voice_profile) {
            setVoiceProfile({ ...DEFAULT_VOICE, ...d.voice_profile });
          }
        })
        .catch(() => {});
    }

    const userId = opts?.userId;
    if (userId && userId !== 'guest') {
      fetch(`/api/ai/user-preferences?user_id=${encodeURIComponent(userId)}`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => {
          const prefs = d.preferences;
          if (prefs && typeof prefs.jarvis_voice_enabled === 'boolean') {
            setTtsOn(prefs.jarvis_voice_enabled);
            try {
              localStorage.setItem(TTS_KEY, prefs.jarvis_voice_enabled ? '1' : '0');
            } catch {
              /* ignore */
            }
          }
        })
        .catch(() => {
          try {
            const saved = localStorage.getItem(TTS_KEY);
            if (saved === '0') setTtsOn(false);
          } catch {
            /* ignore */
          }
        });
    } else {
      try {
        const saved = localStorage.getItem(TTS_KEY);
        if (saved === '0') setTtsOn(false);
      } catch {
        /* ignore */
      }
    }
  }, [opts?.userId, opts?.voiceProfile]);

  const setTtsEnabled = useCallback((on: boolean) => {
    setTtsOn(on);
    try {
      localStorage.setItem(TTS_KEY, on ? '1' : '0');
    } catch {
      /* ignore */
    }
    const userId = opts?.userId;
    if (userId && userId !== 'guest') {
      void fetch('/api/ai/user-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, jarvis_voice_enabled: on }),
      });
    }
    if (!on) stopSpeaking();
  }, [opts?.userId]);

  const stopListen = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    recRef.current = null;
    stopWaveLoop();
    setListening(false);
    setVoicePhase((p) => (p === 'listening' ? 'idle' : p));
  }, [stopWaveLoop]);

  const startListen = useCallback(async () => {
    if (!supported || listening) return;
    if (!voiceEnabled) return;
    stopSpeaking();
    setFinalHint('');
    setInterim('');
    listenStartedRef.current = Date.now();

    const mic = await startMicAnalyser();
    if (mic) {
      micRef.current = mic;
      startWaveLoop();
    }

    const profile = profileRef.current;
    const rec = createSpeechRecognition(
      ({ transcript, isFinal }) => {
        setInterim(transcript);
        if (isFinal && transcript.trim()) {
          const elapsed = Date.now() - listenStartedRef.current;
          if (shouldFallbackToText(elapsed, 'stt')) {
            stopListen();
            return;
          }
          setFinalHint(transcript.trim());
          setVoicePhase('processing');
          stopWaveLoop();
          setListening(false);
          recRef.current = null;
          onTranscriptRef.current(transcript.trim());
          setInterim('');
          window.setTimeout(() => setFinalHint(''), 1200);
        }
      },
      () => {
        stopListen();
      },
      () => {
        stopWaveLoop();
        setListening(false);
        recRef.current = null;
        setVoicePhase((p) => (p === 'listening' ? 'idle' : p));
      },
      profile.stt_locale || 'th-TH',
    );

    if (!rec) {
      stopWaveLoop();
      return;
    }
    recRef.current = rec;
    setListening(true);
    setVoicePhase('listening');
    try {
      rec.start();
    } catch {
      stopListen();
    }
  }, [supported, listening, voiceEnabled, startWaveLoop, stopListen, stopWaveLoop]);

  const toggleListen = useCallback(() => {
    if (listening) stopListen();
    else void startListen();
  }, [listening, startListen, stopListen]);

  const speak = useCallback(
    async (text: string) => {
      if (!ttsOn || !voiceEnabled) return;
      setVoicePhase('speaking');
      await speakWithProfile(text, profileRef.current);
      setVoicePhase('idle');
    },
    [ttsOn, voiceEnabled],
  );

  const markProcessing = useCallback(() => {
    setVoicePhase('processing');
  }, []);

  const markIdle = useCallback(() => {
    setVoicePhase('idle');
  }, []);

  useEffect(() => () => {
    stopListen();
    stopSpeaking();
    stopWaveLoop();
  }, [stopListen, stopWaveLoop]);

  return {
    supported: supported && voiceEnabled,
    voiceEnabled,
    listening,
    interim,
    finalHint,
    ttsOn,
    voicePhase,
    waveLevels,
    voiceProfile,
    setTtsEnabled,
    toggleListen,
    stopListen,
    speak,
    markProcessing,
    markIdle,
  };
}
