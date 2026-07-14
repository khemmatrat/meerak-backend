#!/usr/bin/env node
/**
 * AQOND Platform Validation — PV-3 Executive layer
 * Business Impact · Mission Health · Time Saved · Safe Automation dashboards
 *
 * Usage: node scripts/write-platform-validation-pv3-executive.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PV2 = path.join(ROOT, 'docs', 'platform-validation', 'pv-2');
const PV3 = path.join(ROOT, 'docs', 'platform-validation', 'pv-3');
const TODAY = new Date().toISOString().slice(0, 10);

fs.mkdirSync(PV2, { recursive: true });
fs.mkdirSync(PV3, { recursive: true });

function w(dir, name, body) {
  fs.writeFileSync(path.join(dir, name), body.trimStart() + '\n');
  console.log('  wrote', name);
}

const HDR = (title) => `# ${title}

**Status:** DRAFT — PV-3 Executive Layer  
**Date:** ${TODAY}  
**Stack:** Mission → Scenario → Step → Experience Score → **Business Impact**  

`;

// --- PV-2 doc: Business Impact framework ---
w(
  PV2,
  '025-business-impact-framework.md',
  `${HDR('025 — Business Impact Framework')}

## ทำไมต้องมีชั้นนี้

ไม่ใช่ทุก bug สำคัญเท่ากัน — **Checkout 9.8 + Critical** สำคัญกว่า **Admin Theme 6.5 + Low**

\`\`\`
Mission → Scenario → Step → Experience Score → Business Impact
\`\`\`

## Business Impact levels

| Level | Symbol | ความหมาย | ตัวอย่าง |
|-------|--------|----------|----------|
| **Critical** | 🔴 | กระทบรายได้ / ความปลอดภัย / กฎหมาย | Checkout, Payment, Wallet withdraw |
| **High** | 🟢 สูง | Journey หลัก · ใช้ทุกวัน | Home, Search, Food order |
| **Medium** | 🟡 กลาง | สนับสนุน · ไม่บล็อกซื้อ | Notification settings, Promo |
| **Low** | ⚪ ต่ำ |  cosmetic / admin theme | Theme picker, About stub |

## Scenario rollup (ตัวอย่าง)

| Scenario | Experience | Business | Time Saved |
|----------|------------|----------|------------|
| Home (S001) | 9.1 | 🟢 สูง | 18 นาที |
| Search (S002) | 8.7 | 🟢 สูง | 6 นาที |
| Checkout (S006–S010) | 9.8 | 🔴 Critical | 24 นาที |
| Notification (S043) | 7.8 | 🟡 กลาง | 4 นาที |
| Admin Theme | 6.5 | ⚪ ต่ำ | 1 นาที |

## Time Saved (นาทีต่อ session สำเร็จ)

**AQOND ไม่ได้ขาย AI — AQOND ขาย "เวลาที่คืนกลับมาให้มนุษย์"**

| Scenario | Baseline (นาที) | วัดจาก |
|----------|-----------------|--------|
| S001 Home | 18 | เลือกสินค้าเร็วขึ้น vs ค้นหาเอง |
| S002 Search | 6 | ค้นหา + ตัดสินใจ |
| Checkout | 24 | ชำระเงิน + ยืนยันออเดอร์ |
| Food home | 12 | เลือกร้าน + สั่ง |

> ค่าจริงมาจาก telemetry + product analytics หลัง launch — ตอน PV ใช้ **baseline catalog** ใน \`scenarioCatalog.ts\`

## Priority formula (triage)

\`\`\`
Priority = (10 - Experience Score) × Business Weight

Business Weight: Critical=4 · High=3 · Medium=2 · Low=1
\`\`\`

ตัวอย่าง: Checkout Experience 7.0 + Critical → Priority **12.0** (แก้ก่อน Home 7.0 + High → 9.0)

## Tracker columns (ทุก scenario)

เพิ่มใน \`pv-3/tracker-template.csv\`:

\`\`\`csv
...,experience_score,business_impact,time_saved_minutes,...
\`\`\`

Scenario rollup แยก: \`pv-3/scenario-rollup.csv\`
`,
);

// --- PV-3 Executive dashboards spec ---
w(
  PV3,
  '010-executive-dashboards.md',
  `${HDR('010 — Executive Dashboards (PV-3)')}

## 1. AQOND Mission Health

เปิด Dashboard ทีเดียว — รู้ว่าวันนี้ระบบส่วนไหนยังอ่อน

\`\`\`
Marketplace   ██████████ 94%
Food          █████████░ 90%
Merchant      ████████░░ 84%
Rider         ████████░░ 82%
Talent        █████████░ 91%
Wallet        ████████░░ 87%
Jarvis        ██████████ 95%
Guardian      ██████████ 98%
\`\`\`

**สูตร Mission Health %**

\`\`\`
Health = weighted avg(Experience Score per scenario in module) × 10
Weight = Business Impact (Critical ×4, High ×3, Medium ×2, Low ×1)
\`\`\`

| Module | Missions | Scenarios (sample) |
|--------|----------|-------------------|
| Marketplace | M-001, M-007 | S001–S015, S048–S050 |
| Food | M-002 | S016–S025 |
| Wallet | M-004 | S033–S037 |
| Notification | M-006 | S043–S047 |
| Jarvis | M-050 | S136+ |
| Guardian | M-080 | S189+ |

Seed data: \`pv-3/mission-health.csv\` · อัปเดตจาก \`scenario-rollup.csv\`

---

## 2. AQOND Time Saved (KPI ที่วัดได้)

\`\`\`
วันนี้ Jarvis ช่วยร้านค้า     ประหยัดเวลา    4,286 ชั่วโมง
วันนี้ Merchant ไม่ต้องเพิ่ม SKU เอง          182,000 SKU
วันนี้ AI ตอบลูกค้า                          426,000 ครั้ง
วันนี้ AI สรุปรายงาน                         38,000 รายงาน
วันนี้ AI จัดตาราง Rider                     58,000 เที่ยว
\`\`\`

**PV linkage:** \`time_saved_minutes\` × successful sessions × conversion → roll up รายวัน

| Metric | Source event |
|--------|----------------|
| Jarvis merchant hours | \`jarvis.merchant_action\` + duration |
| SKU auto-listed | \`merchant.ad_publish\` |
| AI customer replies | \`jarvis.customer_reply\` |
| AI reports | \`jarvis.report_generated\` |
| Rider scheduling | \`rider.ai_dispatch\` |

---

## 3. Automation Rate

\`\`\`
งานทั้งหมด          1,250,000
AI ทำเอง             986,000
มนุษย์กดยืนยัน        218,000
มนุษย์ทำเอง           46,000
\`\`\`

Automation Rate = \`986,000 / 1,250,000 = 78.9%\` → เป้าเพิ่มขึ้นเรื่อย ๆ ภายใต้ AGK

---

## 4. AGK — Safe Automation (KPI สำคัญที่สุด)

ไม่ใช่ **Blocked** แต่เป็น **Safe Automation**

\`\`\`
Automation           987,000
Unsafe blocked          32
Policy denied           18
HITL required          281
Approved               278
\`\`\`

ผู้บริหารเห็นแล้วรู้: AI ทำงานมหาศาล **แต่ทุกอย่างยังอยู่ในกรอบความปลอดภัย**

| AGK metric | Source |
|------------|--------|
| Automation | AGK observe + enforce allow |
| Unsafe blocked | shadow / enforce block |
| Policy denied | POLICY_ID deny |
| HITL required | confidence < threshold |
| Approved | human approve queue |

Seed: \`pv-3/agk-safe-automation.csv\`

---

## 5. คำถามที่ PV ตอบได้ (หลังทดสอบครบ)

| คำถาม | ชั้นข้อมูล |
|--------|------------|
| ฟีเจอร์นี้สำคัญแค่ไหน? | **Business Impact** |
| ประสบการณ์ดีแค่ไหน? | **Experience Score** |
| ช่วยประหยัดเวลาเท่าไร? | **Time Saved** |
| โมดูลไหนอ่อน? | **Mission Health** |
| AI ปลอดภัยแค่ไหน? | **Safe Automation** |
`,
);

// --- CSV rollups ---
const scenarioRollupHeader =
  'scenario_id,mission_id,surface,title,experience_score,business_impact,time_saved_minutes,scenario_grade,module,priority_score,tested_at,notes';
const scenarioRollupRows = [
  'S001,M-001,home,Open storefront home,9.1,high,18,🟡 Functional Pass,marketplace,2.7,,' +
    'Steps 1-12 functional; prod timing pending',
  'S002,M-001,search,Find & decide,,high,6,⬜,marketplace,,,Not started',
  'S006,M-001,checkout,Checkout start,,critical,24,⬜,marketplace,,,',
  'S038,M-005,payment,Payment QR,,critical,24,⬜,marketplace,,,',
  'S043,M-006,notifications,Notification settings,,medium,4,⬜,notification,,,',
  'S016,M-002,food_home,Food home,,high,12,⬜,food,,,',
];

fs.writeFileSync(path.join(PV3, 'scenario-rollup.csv'), [scenarioRollupHeader, ...scenarioRollupRows].join('\n') + '\n');
console.log('  wrote scenario-rollup.csv');

const missionHealthHeader = 'module,health_pct,experience_avg,business_weighted,scenarios_tested,scenarios_total,trend_7d';
const missionHealthRows = [
  'marketplace,94,9.2,3.0,1,15,→',
  'food,90,8.8,3.0,0,10,→',
  'merchant,84,8.4,2.5,0,35,→',
  'rider,82,8.2,3.0,0,20,→',
  'talent,91,9.0,2.0,0,10,→',
  'wallet,87,8.7,4.0,0,5,→',
  'jarvis,95,9.5,3.0,0,10,↑',
  'guardian,98,9.8,4.0,0,7,↑',
  'notification,78,7.8,2.0,0,5,↓',
];

fs.writeFileSync(path.join(PV3, 'mission-health.csv'), [missionHealthHeader, ...missionHealthRows].join('\n') + '\n');
console.log('  wrote mission-health.csv');

const timeSavedHeader = 'metric_key,label_th,unit,value_today,source_event';
const timeSavedRows = [
  'jarvis_merchant_hours,Jarvis ช่วยร้านค้า — ประหยัดเวลา,hours,4286,jarvis.merchant_action',
  'merchant_sku_auto,Merchant ไม่ต้องเพิ่มสินค้าเอง,sku,182000,merchant.ad_publish',
  'ai_customer_reply,AI ตอบลูกค้า,count,426000,jarvis.customer_reply',
  'ai_reports,AI สรุปรายงาน,count,38000,jarvis.report_generated',
  'ai_rider_dispatch,AI จัดตาราง Rider,trips,58000,rider.ai_dispatch',
];

fs.writeFileSync(path.join(PV3, 'time-saved-kpi.csv'), [timeSavedHeader, ...timeSavedRows].join('\n') + '\n');
console.log('  wrote time-saved-kpi.csv');

const agkHeader = 'metric,count,description';
const agkRows = [
  'automation,987000,AI executed end-to-end',
  'unsafe_blocked,32,AGK blocked unsafe action',
  'policy_denied,18,POLICY_ID deny',
  'hitl_required,281,Human-in-the-loop required',
  'approved,278,HITL approved',
];

fs.writeFileSync(path.join(PV3, 'agk-safe-automation.csv'), [agkHeader, ...agkRows].join('\n') + '\n');
console.log('  wrote agk-safe-automation.csv');

// Update tracker template header
const trackerHeader =
  'wave,mission_id,scenario_id,step,expected,actual,step_status,scenario_grade,experience_score,business_impact,time_saved_minutes,speed,clarity,recovery,smoothness,confidence,screenshot,video,log,issue,owner,tested_at,build,env';
fs.writeFileSync(path.join(PV3, 'tracker-template.csv'), `${trackerHeader}\n`);
console.log('  wrote tracker-template.csv');

console.log('\nAQOND PV-3 Executive layer generated in docs/platform-validation/pv-3/');
