#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const osDir = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..'), 'docs', 'aqond-os');
const today = new Date().toISOString().slice(0, 10);
fs.mkdirSync(osDir, { recursive: true });
fs.writeFileSync(
  path.join(osDir, 'SPRINT_30d.md'),
  `# Sprint 30d — Personalization + Tour + Jarvis Greet\n\n**Status:** COMPLETE · ${today}\n\n- FtxHomePersonalizedModules — reorder by intent moduleOrder\n- FtxGuidedTour — 5 steps, skippable, tour_completed_at\n- POST /api/experience/tour\n- FtxJarvisGreet — proactive brief chip + JarvisFab hook\n`,
);
fs.writeFileSync(
  path.join(osDir, 'NEXT_TASK.md'),
  `# NEXT TASK\n\n**Updated:** ${today}\n\n## Sprint 30e — Analytics + Admin FTX dashboard\n`,
);
console.log('Sprint 30d docs written');
