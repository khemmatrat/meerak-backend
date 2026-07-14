#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const osDir = path.join(root, 'docs', 'aqond-os');
const jarvisDir = path.join(osDir, 'products', 'jarvis');
const today = new Date().toISOString().slice(0, 10);

fs.mkdirSync(jarvisDir, { recursive: true });

fs.writeFileSync(
  path.join(osDir, 'SPRINT_35.md'),
  `# Sprint 35 — Voice & Multilingual AI

**Status:** COMPLETE · ${today}

## Delivered

- \`@aqond/voice\` package — locales, TTS persona, latency, rider convergence
- STT/TTS locale matrix — 11 countries (TH, US, SG, MY, ID, CN, TW, LA, MM, BN, LK)
- TTS tuning per Jarvis product persona (merchant, food, marketplace, wallet, rider, super)
- \`backend/lib/jarvis/voiceIntelligence.js\`
- \`GET /api/jarvis/voice-profile\` + BFF
- Storefront \`voice.ts\` + \`useJarvisVoice\` — locale-aware STT/TTS + latency fallback
- Jarvis route returns \`voice_profile\`

## Flags

\`\`\`
AIVOS_JARVIS_VOICE=1
JARVIS_VOICE=1
NEXT_PUBLIC_JARVIS_VOICE=1
\`\`\`

**Default:** text path unchanged when flags off.

## Latency budget (ms)

| Stage | Budget |
|-------|--------|
| STT | 2500 |
| Jarvis brain | 8000 |
| TTS | 3000 |
| Total hands-free | 12000 |

Exceed → fallback to text (no auto-speak).

## Next

Post-freeze hardening — GPU voice-service path (\`VOICE_MODEL=hertz-gpu\`)
`,
);

fs.writeFileSync(
  path.join(jarvisDir, 'JARVIS_VOICE_MOBILE_HANDOFF.md'),
  `# Jarvis Voice — Mobile Handoff Spec (Sprint 35)

**Status:** SPEC ONLY — no mobile code in Sprint 35

## Goal

Native AQOND mobile app reuses \`@aqond/voice\` locale matrix + persona TTS; defers LLM to existing BFFs.

## Contract

| Layer | Web (now) | Mobile (future) |
|-------|-----------|-----------------|
| STT | Web Speech API | iOS Speech / Android SpeechRecognizer |
| Locale | \`GET /api/jarvis/voice-profile\` | Same BFF |
| Brain | \`POST /api/ai/jarvis\` | Same |
| TTS | speechSynthesis | AVSpeechSynthesizer / Android TTS |
| Rider | \`POST /api/ai/rider-voice\` | Same — separate brain |

## Handoff payload

\`\`\`json
{
  "voice_profile": {
    "stt_locale": "th-TH",
    "tts_locale": "th-TH",
    "tts_rate": 1.02,
    "persona_product": "food",
    "latency_budget_ms": { "total_hands_free": 12000 },
    "fallback": "text"
  }
}
\`\`\`

## Rules

1. Mobile MUST NOT embed separate locale tables — import \`@aqond/voice\` or fetch voice-profile.
2. Hands-free session: one mic press → STT → jarvis POST → TTS; show text if fallback.
3. Rider jobs use \`riderVoiceProfile()\` from \`@aqond/voice/riderConvergence\`.
4. GPU STT/TTS optional via \`aqond-v2/voice/server.py\` when deployed.

See \`JARVIS_ROADMAP.md\` Sprint 35 exit criteria.
`,
);

fs.writeFileSync(
  path.join(osDir, 'NEXT_TASK.md'),
  `# NEXT TASK

**Updated:** ${today}

## Post-Sprint 35 — Voice GPU path + regression

- Enable \`VOICE_MODEL=hertz-gpu\` smoke on voice-service
- E2E hands-free Jarvis on Chrome/Android
`,
);

const sessionPath = path.join(osDir, 'SESSION.md');
if (fs.existsSync(sessionPath)) {
  let session = fs.readFileSync(sessionPath, 'utf8');
  session = session.replace(/Sprint 35[^\n]*/i, 'Sprint 35 — Voice & Multilingual AI ✅ COMPLETE');
  fs.writeFileSync(sessionPath, session);
}

console.log('Sprint 35 docs written');
