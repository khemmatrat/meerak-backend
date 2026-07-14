import http from 'k6/http';
import { check, sleep } from 'k6';
import { KONG, defaultOptions, randomBuyer } from './lib/common.js';

// P175: feed fan-out read stress (celebrity timeline simulation).
export const options = {
  ...defaultOptions(100, '45s'),
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(99)<2000'],
  },
};

const celebrity = __ENV.CELEBRITY_ID || 'creator-load';

export default function () {
  const r = http.get(
    `${KONG}/api/v1/feed/v1/feed/for-you?user_id=${randomBuyer()}&author_id=${celebrity}`,
    { headers: { 'X-Aqond-Region': 'TH' } },
  );
  check(r, { 'feed read': (x) => x.status === 200 || x.status === 404 });
  sleep(0.02);
}
