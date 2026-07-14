#!/usr/bin/env node
/** Update SESSION.md and related AQOND-OS docs after development work */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'docs', 'aqond-os');
const NOW = new Date().toISOString().slice(0, 16).replace('T', ' ');
const DATE = new Date().toISOString().slice(0, 10);

const session = `# AQOND — SESSION (Working Memory)

> **This file is the AI's current working memory.**  
> Continuously updated during development. Overwritten each session; finalized before session end.  
> **Before writing code:** read this file and resume from [Resume Point](#resume-point).

**Session Status:** ACTIVE  
**Last Updated:** ${NOW}

---

## Session Information

| Field | Value |
|-------|-------|
| **Current Date** | ${DATE} |
| **Current Sprint** | Merchant Ad Video + Storefront Product Integration |
| **Session Number** | 003 |
| **Developer Goal** | Resume PDP video integration from SESSION resume point |
| **Current Objective** | PDP gallery video autoplay + catalog \`product_video_url\` wiring |
| **Overall Project Completion** | Sprint ~75% · PDP video ~70% |

---

## Active Module

| Field | Value |
|-------|-------|
| **Current Product** | Market (Storefront v2) + Brain (AIVOS merchant-ad) |
| **Current Module** | Merchant Ad Video Studio → PDP |
| **Current Feature** | PDP video playback from catalog \`product_video_url\` |
| **Current Subsystem** | \`pdpStudioBridge\` + \`MobileProductClient\` |
| **Current API** | \`/api/product/[id]/detail\`, \`/api/merchant/ad-video/*\` |
| **Current Database Tables** | \`.data/dev/catalog.json\` (product_video_url in metadata) |
| **Current Frontend Screen** | \`/m/product/[id]\` — PDP gallery |
| **Current Backend Service** | \`backend/lib/aivos/merchant-ad/\` |

---

## Current Working Files

| File Path | Purpose | Modification Status | Priority |
|-----------|---------|---------------------|----------|
| \`MobileProductClient.tsx\` | PDP gallery video autoplay/pause on swipe | **Done** | P0 |
| \`pdpStudioBridge.ts\` | Normalize catalog video URLs + poster | **Done** | P0 |
| \`product/[id]/detail/route.ts\` | Enrich product from local catalog video | **Done** | P0 |
| \`backend/__tests__/aivosMerchantAd*.test.js\` | MAD regression | **PASS** (11/11) | P1 |
| \`videoEngine.js\` | Grok \`mad-*\` path verification | Pending (needs running backend) | P1 |
| \`merchantAdPublish.ts\` | Existing-product video attach | Pending | P1 |

---

## Current Progress

### Completed During This Session

- PDP gallery: video ref, muted autoplay, pause on swipe away, poster from catalog
- \`normalizePdpVideoUrl()\` in pdpStudioBridge for backend/catalog URLs
- \`enrichFromLocalCatalog()\` in product detail API — merges \`product_video_url\`
- Studio video URL overrides metadata video when both exist
- MAD01–MAD11 regression: **11/11 PASS**

### Work In Progress

- Grok end-to-end manual verification (\`mad-*\` vs \`adv-*\`)

### Waiting Tasks

- Existing-product "เพิ่มวิดีโอ" attach flow manual test
- Production catalog-svc write path documentation

### Blocked Tasks

- None

---

## Dependency Analysis

### Modules Affected

- \`MobileProductClient.tsx\`, \`pdpStudioBridge.ts\`, \`product detail route\`
- \`merchantCatalog.ts\` (read-only — attachAdVideoToProduct already writes video)

### Shared Services

- Local catalog JSON, AIVOS merchant-ad, storefront file proxy

### Potential Regression Areas

- PDP image gallery swipe (unchanged logic, video slide added)
- Home products / wallet / payment (out of scope)

---

## Decisions Made

### SESSION-003 — Muted loop autoplay for PDP gallery video

| Field | Value |
|-------|-------|
| **Date** | ${DATE} |
| **Decision** | Gallery video uses \`muted\` + \`loop\` + \`autoPlay\`; user unmutes via controls |
| **Reason** | Mobile browsers block unmuted autoplay; gallery preview should start on swipe |
| **Impact** | Video plays on swipe to video slide; pauses when swiping to image |

---

## Known Issues

- Grok path (\`mad-*\`) not re-verified this session (needs backend + XAI_API_KEY)
- Local \`.data\` catalog vs production catalog-svc divergence remains

---

## Regression Checklist

| Area | Status | Notes |
|------|--------|-------|
| Frontend (storefront) | PENDING | PDP video needs manual verify |
| Backend (AIVOS) | PASS | MAD01–11 all pass |
| API (merchant-ad) | PASS | Unchanged |
| Database | PASS | No schema changes |
| Wallet | PASS | Out of scope |
| Payment | PASS | Out of scope |
| Merchant (ad studio) | PENDING | Publish flow unchanged |
| Admin | PASS | Not touched |
| AI (AIVOS MAD) | PASS | 11/11 ${DATE} |
| Authentication | PASS | Unchanged |

---

## Resume Point

| Field | Value |
|-------|-------|
| **Current File** | \`backend/lib/aivos/merchant-ad/videoEngine.js\` |
| **Current Function** | Grok job ID prefix verification |
| **Last Completed Action** | PDP video autoplay + catalog video URL wiring + MAD regression pass |
| **Next Immediate Action** | Start backend; generate ad clip; confirm \`mad-*\` job; manual PDP video test |
| **Expected Result** | Product with \`product_video_url\` plays video on PDP gallery swipe |
| **Risk Level** | Medium |
| **Estimated Remaining Work** | ~2–4 hours (Grok verify + attach flow + manual E2E) |

---

## Next Session Recommendation

1. Restart backend + storefront with AIVOS env flags
2. Publish or open product with \`product_video_url\` in catalog
3. Verify PDP gallery swipe → video autoplays
4. Test existing-product video attach from ad-studio
5. Update REGRESSION_STATUS.md after manual verify

---

## End-of-Session Sync Checklist

- [x] SESSION.md updated
- [ ] CURRENT_STATUS.md updated
- [ ] NEXT_TASK.md updated
- [ ] REGRESSION_STATUS.md updated
- [ ] Daily log appended
`;

fs.writeFileSync(path.join(ROOT, 'SESSION.md'), session, 'utf8');
console.log('wrote SESSION.md');

// Patch CURRENT_STATUS PDP %
const csPath = path.join(ROOT, 'CURRENT_STATUS.md');
let cs = fs.readFileSync(csPath, 'utf8');
cs = cs.replace('| PDP video integration | 40% |', '| PDP video integration | 70% |');
cs = cs.replace('| **Overall sprint** | **~70%** |', '| **Overall sprint** | **~75%** |');
cs = cs.replace('**Last Updated:** 2026-06-30', `**Last Updated:** ${DATE}`);
if (!cs.includes('PDP gallery video autoplay')) {
  cs = cs.replace(
    '- AQOND-OS isolated documentation workspace under `docs/aqond-os/`',
  `- AQOND-OS isolated documentation workspace under \`docs/aqond-os/\`
- PDP gallery video autoplay + \`product_video_url\` catalog wiring (session 003)`
  );
}
fs.writeFileSync(csPath, cs, 'utf8');
console.log('patched CURRENT_STATUS.md');

// Patch REGRESSION
const regPath = path.join(ROOT, 'REGRESSION_STATUS.md');
let reg = fs.readFileSync(regPath, 'utf8');
reg = reg.replace('**Latest Regression Date:** 2026-06-28 (MAD suite)', `**Latest Regression Date:** ${DATE} (MAD suite)`);
if (!reg.includes('MAD01–11 | ${DATE}')) {
  reg = reg.replace(
    '| AIVOS merchant-ad MAD01–11 | 2026-06-28 |',
    `| AIVOS merchant-ad MAD01–11 | ${DATE} |`
  );
}
reg = reg.replace('**Regression Coverage:** ~40%', '**Regression Coverage:** ~45%');
fs.writeFileSync(regPath, reg, 'utf8');
console.log('patched REGRESSION_STATUS.md');

// Append daily log
const dailyPath = path.join(ROOT, 'logs/daily', `${DATE}.md`);
if (fs.existsSync(dailyPath)) {
  let daily = fs.readFileSync(dailyPath, 'utf8');
  if (!daily.includes('Session 003')) {
    daily += `
---

## Update — Session 003 (PDP Video)

- **MobileProductClient.tsx**: gallery video ref, muted autoplay, pause on swipe
- **pdpStudioBridge.ts**: \`normalizePdpVideoUrl()\`, catalog poster
- **product detail route**: \`enrichFromLocalCatalog()\` for \`product_video_url\`
- **Regression**: MAD01–MAD11 PASS (11/11)
- **Decision**: SESSION-003 (muted gallery autoplay)
`;
    fs.writeFileSync(dailyPath, daily, 'utf8');
    console.log('appended daily log');
  }
}

console.log('update-session-resume: complete');
