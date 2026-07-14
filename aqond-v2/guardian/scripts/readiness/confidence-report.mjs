#!/usr/bin/env node
/**
 * Phase 3.6 — confidence score snapshot
 */
const base = (process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://127.0.0.1:8200'
).replace(/\/$/, '');

async function main() {
  const res = await fetch(`${base}/guardian/v1/metrics/confidence`);
  const json = await res.json().catch(() => ({}));
  const data = json.data || {};
  console.log('Guardian Confidence Score\n');
  console.log(`Overall: ${data.overall ?? 'n/a'} / 100 (gate: ${data.gate ?? 99})`);
  console.log(`Hard enforcement recommended: ${data.hard_enforcement_recommended ? 'YES' : 'NO'}`);
  if (data.dimensions) {
    console.log('\nDimensions:');
    for (const [k, v] of Object.entries(data.dimensions)) {
      console.log(`  ${k}: ${v.score} (weight ${v.weight})`);
    }
  }
  if (data.reliability) {
    console.log(`\nMTTR: ${data.reliability.mttr_ms ?? 'n/a'} ms`);
    console.log(`MTBF: ${data.reliability.mtbf_ms ?? 'n/a'} ms`);
  }
  if (data.shadow_compare) {
    console.log(`\nShadow mismatch rate: ${data.shadow_compare.mismatch_rate_pct ?? 0}%`);
  }
  process.exit(res.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
