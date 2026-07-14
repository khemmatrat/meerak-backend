/** Browser speech — STT + TTS for Jarvis (Sprint 35 locale matrix). */

import { shouldFallbackToText } from '@aqond/voice';

export type SpeechListenResult = {
  transcript: string;
  isFinal: boolean;
};

export type JarvisVoiceProfile = {
  enabled?: boolean;
  stt_locale?: string;
  tts_locale?: string;
  voice_hint?: string;
  tts_rate?: number;
  tts_pitch?: number;
  persona_product?: string;
  latency_budget_ms?: { stt?: number; tts?: number; total_hands_free?: number };
  fallback?: string;
};

type RecognitionCtor = new () => SpeechRecognition;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function isSpeechSupported() {
  return !!getRecognitionCtor() && typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function isJarvisVoicePathEnabled(): boolean {
  return process.env.NEXT_PUBLIC_JARVIS_VOICE === '1';
}

export function createSpeechRecognition(
  onResult: (r: SpeechListenResult) => void,
  onError: (msg: string) => void,
  onEnd: () => void,
  locale = 'th-TH',
) {
  const Ctor = getRecognitionCtor();
  if (!Ctor) return null;

  const rec = new Ctor();
  rec.lang = locale || 'th-TH';
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  rec.onresult = (ev: SpeechRecognitionEvent) => {
    let interim = '';
    let final = '';
    for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
      const t = ev.results[i][0]?.transcript || '';
      if (ev.results[i].isFinal) final += t;
      else interim += t;
    }
    const transcript = (final || interim).trim();
    if (transcript) onResult({ transcript, isFinal: !!final });
  };

  rec.onerror = (ev: SpeechRecognitionErrorEvent) => {
    const code = ev.error || 'unknown';
    if (code === 'no-speech') {
      onError('ไม่ได้ยินเสียง — ลองพูดอีกครั้งครับ');
      return;
    }
    if (code === 'not-allowed') {
      onError('กรุณาอนุญาตไมโครโฟนในเบราว์เซอร์');
      return;
    }
    onError(`ไมค์: ${code}`);
  };

  rec.onend = onEnd;
  return rec;
}

let speakToken = 0;

export function stopSpeaking() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  speakToken += 1;
  window.speechSynthesis.cancel();
}

function pickVoice(locale: string, hint?: string) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  const loc = (locale || 'th-TH').toLowerCase();
  const hintL = (hint || '').toLowerCase();
  return (
    voices.find((v) => v.lang.toLowerCase() === loc) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(hintL)) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(loc.split('-')[0])) ||
    voices.find((v) => v.lang.toLowerCase().includes(loc.split('-')[0])) ||
    voices[0] ||
    null
  );
}

export function speakWithProfile(text: string, profile: JarvisVoiceProfile = {}): Promise<void> {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    return Promise.resolve();
  }
  const clean = text.replace(/\[product:[^\]]+\]/gi, '').replace(/\[creator:[^\]]+\]/gi, '').trim();
  if (!clean) return Promise.resolve();

  stopSpeaking();
  const token = speakToken;
  const started = Date.now();
  const ttsBudget = profile.latency_budget_ms?.tts ?? 3000;

  return new Promise((resolve) => {
    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = profile.tts_locale || 'th-TH';
    utter.rate = profile.tts_rate ?? 1.02;
    utter.pitch = profile.tts_pitch ?? 1;
    const voice = pickVoice(utter.lang, profile.voice_hint);
    if (voice) utter.voice = voice;

    const timer = window.setTimeout(() => {
      if (token === speakToken && shouldFallbackToText(Date.now() - started, 'tts')) {
        stopSpeaking();
        resolve();
      }
    }, ttsBudget);

    utter.onend = () => {
      window.clearTimeout(timer);
      if (token === speakToken) resolve();
    };
    utter.onerror = () => {
      window.clearTimeout(timer);
      if (token === speakToken) resolve();
    };

    window.speechSynthesis.speak(utter);
  });
}

/** @deprecated use speakWithProfile */
export function speakThai(text: string): Promise<void> {
  return speakWithProfile(text, { tts_locale: 'th-TH', tts_rate: 1.02, tts_pitch: 1, voice_hint: 'th' });
}

export function preloadVoices() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
  };
}
