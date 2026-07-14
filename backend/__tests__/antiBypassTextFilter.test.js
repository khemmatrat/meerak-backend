/**
 * Anti-bypass text filter — pure evaluator tests (no DB).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compileSafeAntiBypassRegex,
  evaluateAntiBypassText,
  normalizeAntiBypassText,
} from '../lib/antiBypassTextFilter.js';

describe('normalizeAntiBypassText', () => {
  test('collapses spaced latin bypass attempt', () => {
    const n = normalizeAntiBypassText('l i n e i d something');
    assert.ok(n.compact.includes('lineid'));
  });

  test('maps Thai digits before digit extraction', () => {
    const n = normalizeAntiBypassText('เบอร์ ๐๘๑๒๓๔๕๖๗๘');
    assert.ok(n.digitsOnly.includes('0812345678'));
  });
});

describe('evaluateAntiBypassText built-ins', () => {
  test('mode off never blocks phone', () => {
    const r = evaluateAntiBypassText('โทร 0812345678 นะ', {
      filterMode: 'off',
      dbRules: [],
    });
    assert.equal(r.allowed, true);
    assert.equal(r.blocked, false);
  });

  test('mode block rejects Thai mobile pattern', () => {
    const r = evaluateAntiBypassText('0891234567', {
      filterMode: 'block',
      dbRules: [],
    });
    assert.equal(r.allowed, false);
    assert.equal(r.blocked, true);
    assert.ok(r.reasons.includes('phone_th'));
    assert.equal(r.code, 'ANTI_BYPASS_BLOCKED');
  });

  test('mode warn surfaces social keyword without blocking', () => {
    const r = evaluateAntiBypassText('ติดต่อ tiktok ผมได้', {
      filterMode: 'warn',
      dbRules: [],
    });
    assert.equal(r.allowed, true);
    assert.equal(r.warn, true);
    assert.ok(r.reasons.some((x) => x.startsWith('social_')));
  });

  test('keyword DB rule hits when scoped text', () => {
    const r = evaluateAntiBypassText('nothing suspicious', {
      filterMode: 'block',
      dbRules: [
        {
          id: 'abc',
          kind: 'keyword',
          scope: 'text',
          pattern: 'badword',
          enabled: true,
          severity: 'block',
        },
      ],
    });
    assert.equal(r.allowed, true);

    const r2 = evaluateAntiBypassText('มี badword อยู่', {
      filterMode: 'block',
      dbRules: [
        {
          id: 'abc',
          kind: 'keyword',
          scope: 'text',
          pattern: 'badword',
          enabled: true,
          severity: 'block',
        },
      ],
    });
    assert.equal(r2.allowed, false);
    assert.ok(r2.reasons.some((x) => x.startsWith('rule_keyword')));
  });

  test('regex DB rule on scoped field', () => {
    const r = evaluateAntiBypassText('hello LINE@zzz user', {
      filterMode: 'block',
      dbRules: [
        {
          id: 'rx1',
          kind: 'regex',
          scope: 'text',
          pattern: 'line@[a-z]+',
          enabled: true,
          severity: 'block',
        },
      ],
    });
    assert.equal(r.allowed, false);
  });

  test('image_ocr scope ignores text-only keyword rule', () => {
    const r = evaluateAntiBypassText('badword here', {
      filterMode: 'block',
      scope: 'image_ocr',
      dbRules: [
        {
          id: 'kw',
          kind: 'keyword',
          scope: 'text',
          pattern: 'badword',
          enabled: true,
          severity: 'block',
        },
      ],
    });
    assert.equal(r.allowed, true);
  });
});

describe('compileSafeAntiBypassRegex', () => {
  test('rejects oversized pattern', () => {
    assert.throws(() => compileSafeAntiBypassRegex('a'.repeat(400)), /exceeds/);
  });

  test('compiles unicode regex', () => {
    const re = compileSafeAntiBypassRegex('\\btiktok\\b');
    assert.equal(re.test('on tiktok'), true);
  });
});
