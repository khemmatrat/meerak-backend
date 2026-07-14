import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMarketplaceCatalogFilters, mapInstructorProfile } from '../lib/courseMarketplaceShared.js';

test('buildMarketplaceCatalogFilters applies search and category', () => {
  const { where, params } = buildMarketplaceCatalogFilters({ q: 'clean', category: 'service' });
  assert.match(where, /is_marketplace = TRUE/);
  assert.match(where, /status = 'published'/);
  assert.match(where, /ILIKE/);
  assert.match(where, /category =/);
  assert.equal(params.length, 2);
});

test('buildMarketplaceCatalogFilters applies level, language, price and rating', () => {
  const { where, params, order } = buildMarketplaceCatalogFilters({
    level: 'beginner',
    language: 'th',
    price_min: '100',
    price_max: '500',
    min_rating: '4',
    sort: 'price_high',
  });
  assert.match(where, /level =/);
  assert.match(where, /language =/);
  assert.match(where, /price_thb >=/);
  assert.match(where, /price_thb <=/);
  assert.match(where, /rating_avg >=/);
  assert.equal(params.length, 5);
  assert.match(order, /price_thb DESC/);
});

test('buildMarketplaceCatalogFilters defaults to featured sort', () => {
  const { order } = buildMarketplaceCatalogFilters({});
  assert.match(order, /featured_rank DESC/);
});

test('mapInstructorProfile maps snake_case rows', () => {
  const profile = mapInstructorProfile({
    user_id: 'abc',
    headline: 'Expert',
    bio: 'Bio text',
    avatar_url: 'https://example.com/a.jpg',
    payout_eligible: true,
  });
  assert.equal(profile.userId, 'abc');
  assert.equal(profile.headline, 'Expert');
  assert.equal(profile.payoutEligible, true);
});
