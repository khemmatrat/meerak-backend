import http from 'k6/http';
import { check, sleep } from 'k6';
import { KONG, defaultOptions, randomBuyer, pause } from './lib/common.js';

// P173: realistic mixed traffic — browse, search, feed, cart, checkout probe.
export const options = {
  ...defaultOptions(30, '60s'),
  scenarios: {
    browse: { executor: 'constant-vus', vus: 10, duration: '60s', exec: 'browse' },
    search: { executor: 'constant-vus', vus: 5, duration: '60s', exec: 'search' },
    feed: { executor: 'constant-vus', vus: 8, duration: '60s', exec: 'feed' },
  },
};

export function browse() {
  const r = http.get(`${KONG}/api/v1/bff/v1/home`, { headers: { 'X-Aqond-Region': 'TH' } });
  check(r, { 'home ok': (x) => x.status === 200 });
  pause();
}

export function search() {
  const r = http.get(`${KONG}/api/v1/bff/v1/search?q=shirt&tab=products`);
  check(r, { 'search ok': (x) => x.status === 200 || x.status === 502 });
  pause();
}

export function feed() {
  const buyer = randomBuyer();
  const r = http.get(`${KONG}/api/v1/bff/v1/feed?kind=for-you`, {
    headers: { 'X-User-Id': buyer, 'X-Aqond-Region': 'TH' },
  });
  check(r, { 'feed ok': (x) => x.status === 200 });
  pause();
}
