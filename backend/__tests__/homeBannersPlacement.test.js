/**
 * ทดสอบกฎ placement แบนเนอร์ — รัน: node --test __tests__/homeBannersPlacement.test.js
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { filterBannersByPlacement, pgDateCellToYmdBangkok } from '../lib/homeBanners.js';

describe('pgDateCellToYmdBangkok', () => {
  test('แก้ off-by-one: instant ที่เป็น 4 พ.ค. ไทยจาก UTC ก่อนหน้า', () => {
    const d = new Date('2026-05-03T17:00:00.000Z');
    assert.strictEqual(pgDateCellToYmdBangkok(d), '2026-05-04');
  });
  test('สตริง YYYY-MM-DD คงรูปแบบ', () => {
    assert.strictEqual(pgDateCellToYmdBangkok('2026-05-04'), '2026-05-04');
  });
});

describe('filterBannersByPlacement', () => {
  test('home: แบนโปรเลือกแค่ welcome ยังแสดง (มี promoCode)', () => {
    const out = filterBannersByPlacement(
      [{ id: '1', placements: ['welcome'], promoCode: 'FIRST25' }],
      'home'
    );
    assert.equal(out.length, 1);
  });

  test('home: welcome อย่างเดียว ไม่มีโปร → ไม่แสดงบน home', () => {
    const out = filterBannersByPlacement(
      [{ id: '1', placements: ['welcome'], title: 'Branding' }],
      'home'
    );
    assert.equal(out.length, 0);
  });

  test('home: เลือก home ชัดเจน → แสดง', () => {
    const out = filterBannersByPlacement(
      [{ id: '1', placements: ['home', 'welcome'], promoCode: 'X' }],
      'home'
    );
    assert.equal(out.length, 1);
  });

  test('home: แค่ job_detail + มีโปร ยังแสดง (ลืมติ๊ก home)', () => {
    const out = filterBannersByPlacement(
      [{ id: '1', placements: ['job_detail'], promoCode: 'JOB10' }],
      'home'
    );
    assert.equal(out.length, 1);
  });

  test('welcome: แบนโปรเลือกแค่ home ยังแสดงเมื่อลืมติ๊ก welcome (มี promoCode)', () => {
    const out = filterBannersByPlacement(
      [
        { id: '1', placements: ['welcome'], promoCode: 'P' },
        { id: '2', placements: ['home'], promoCode: 'Q' },
      ],
      'welcome'
    );
    assert.equal(out.length, 2);
  });

  test('welcome: home อย่างเดียว ไม่มีโปร → ไม่แสดงบน welcome', () => {
    const out = filterBannersByPlacement(
      [{ id: '2', placements: ['home'], title: 'Branding' }],
      'welcome'
    );
    assert.equal(out.length, 0);
  });

  test('job_detail: แบนโปรเลือกแค่ home ยังแสดงเมื่อลืมติ๊ก job_detail', () => {
    const out = filterBannersByPlacement(
      [{ id: '1', placements: ['home'], promoCode: 'JOBPLUS' }],
      'job_detail'
    );
    assert.equal(out.length, 1);
  });
});
