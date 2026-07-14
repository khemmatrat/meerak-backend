import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.KONG_BASE || "http://127.0.0.1:8000";
const USER = __ENV.FEED_USER || "loadtest-viewer";

export const options = {
  vus: Number(__ENV.VUS || 20),
  duration: __ENV.DURATION || "30s",
  thresholds: {
    http_req_duration: ["p(99)<500"],
    checks: ["rate>0.95"],
  },
};

export default function () {
  const feed = http.get(`${BASE}/api/v1/feed/v1/feed?user_id=${USER}&limit=20`);
  check(feed, {
    "feed 200": (r) => r.status === 200,
    "feed has items key": (r) => r.json("items") !== undefined,
  });

  const foryou = http.get(`${BASE}/api/v1/feed/v1/feed/for-you?user_id=${USER}&limit=20`);
  check(foryou, { "for-you 200": (r) => r.status === 200 });

  sleep(0.5);
}
