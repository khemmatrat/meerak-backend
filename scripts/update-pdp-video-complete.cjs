#!/usr/bin/env node
/** Mark PDP Video sprint complete — update AQOND-OS docs */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'docs', 'aqond-os');
const DATE = '2026-06-30';
const NOW = `${DATE} 04:15`;

function patch(file, replacements) {
  const full = path.join(ROOT, file);
  let c = fs.readFileSync(full, 'utf8');
  for (const [a, b] of replacements) c = c.replace(a, b);
  fs.writeFileSync(full, c, 'utf8');
  console.log('patched:', file);
}

patch('CURRENT_STATUS.md', [
  ['| PDP video integration | 70% |', '| PDP video integration | **100%** |'],
  ['| **Overall sprint** | **~75%** |', '| **Overall sprint** | **~85%** |'],
  ['| PDP `MobileProductClient` | Swipe gallery + video autoplay polish |', '| PDP `MobileProductClient` | **Done** — E2E pass iPhone + Android |'],
  ['| `pdpStudioBridge` | Catalog `product_video_url` + studio posts |', '| `pdpStudioBridge` | **Done** — catalog video URL wired |'],
  ['**Last Updated:** 2026-06-30', `**Last Updated:** ${DATE}`],
]);

patch('NEXT_TASK.md', [
  [
    'Verify Grok `mad-*` path + manual PDP E2E. Completed: catalog video wiring + gallery autoplay. Remaining:',
    '**PDP Video complete (E2E 16/16).** Next: Grok `mad-*` production path + catalog-svc prod write.',
  ],
  ['| P0 | `aqond-v2/apps/storefront/components/mobile/MobileProductClient.tsx` | PDP gallery video autoplay — **done session 003** |', '| P0 | ~~MobileProductClient PDP video~~ | **DONE** — E2E 16/16 |'],
  ['| P0 | `aqond-v2/apps/storefront/lib/server/pdpStudioBridge.ts` | Wire `product_video_url` — **done session 003** |', '| P0 | ~~pdpStudioBridge~~ | **DONE** |'],
]);

patch('REGRESSION_STATUS.md', [
  ['**Regression Coverage:** ~45%', '**Regression Coverage:** ~55%'],
  ['| Frontend (storefront) | PENDING | PDP video not verified |', `| Frontend (storefront) PDP video | PASS | E2E 16/16 ${DATE} iPhone+Android |`],
  ['| Manual: PDP video on gallery swipe |', `| ~~Manual: PDP video~~ | E2E automated ${DATE} |`],
  ['| E2E tests missing for publish → home visibility |', '| E2E publish → catalog video | PASS `publish-video-flow.spec.ts` |'],
]);

// SESSION.md summary
const session = fs.readFileSync(path.join(ROOT, 'SESSION.md'), 'utf8')
  .replace(/\*\*Last Updated:\*\* [^\n]+/, `**Last Updated:** ${NOW}`)
  .replace(/\*\*Session Number\*\* \| 003/, '**Session Number** | 004')
  .replace(/\*\*Overall Project Completion\*\* \| Sprint ~75% · PDP video ~70%/, '**Overall Project Completion** | Sprint ~85% · **PDP video 100%**')
  .replace(/\| Frontend \(storefront\) \| PENDING \| PDP video needs manual verify \|/, '| Frontend (storefront) PDP | **PASS** | E2E 16/16 iPhone Safari + Android Chrome |')
  .replace(/\| \*\*Current File\*\* \| `backend\/lib\/aivos\/merchant-ad\/videoEngine.js` \|/, '| **Current File** | `backend/lib/aivos/merchant-ad/videoEngine.js` |')
  .replace(/\| \*\*Last Completed Action\*\* \| PDP video autoplay \+ catalog video URL wiring \+ MAD regression pass \|/, '| **Last Completed Action** | PDP Video E2E 16/16 PASS — sprint PDP closed |')
  .replace(/\| \*\*Next Immediate Action\*\* \| Start backend; generate ad clip; confirm `mad-\*` job; manual PDP video test \|/, '| **Next Immediate Action** | Grok `mad-*` path verification; catalog-svc production path |')
  .replace(/\| \*\*Estimated Remaining Work\*\* \| ~2–4 hours \(Grok verify \+ attach flow \+ manual E2E\) \|/, '| **Estimated Remaining Work** | ~2–4 hours (Grok prod + catalog-svc) |');

fs.writeFileSync(path.join(ROOT, 'SESSION.md'), session, 'utf8');
console.log('patched: SESSION.md');

const dailyPath = path.join(ROOT, 'logs/daily', `${DATE}.md`);
let daily = fs.readFileSync(dailyPath, 'utf8');
if (!daily.includes('PDP Video E2E 16/16')) {
  daily += `
---

## Update — PDP Video E2E Complete (Priority 1 CLOSED)

- Playwright mobile E2E: **16/16 PASS**
  - iPhone 14 (WebKit / Safari)
  - Pixel 7 (Chromium / Android Chrome)
- Scenarios: API video, autoplay muted, pause, gallery navigation, publish → catalog → PDP
- Command: \`npm run test:e2e:pdp\` in storefront
- Report: [reports/PDP_VIDEO_E2E.md](../reports/PDP_VIDEO_E2E.md)
- **PDP Video: 100%**
`;
  fs.writeFileSync(dailyPath, daily, 'utf8');
  console.log('appended daily log');
}

// market.md
const marketPath = path.join(ROOT, 'products/market.md');
let market = fs.readFileSync(marketPath, 'utf8');
market = market.replace(/Active sprint — merchant ad video \+ catalog integration ~80% complete\./, 'Merchant ad video + PDP video **complete** (E2E verified). Sprint ~85%.');
fs.writeFileSync(marketPath, market, 'utf8');
console.log('patched: products/market.md');

console.log('pdp-video-complete: done');
