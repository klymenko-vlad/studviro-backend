import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * Baseline load profile. Not a stress test — it exists so "is it still fast?"
 * has a number rather than an opinion, and so a regression in p95 shows up as
 * a failed threshold instead of a support ticket.
 *
 *   k6 run -e BASE_URL=http://localhost:3000 load-test/smoke.js
 */
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '1m', target: 20 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    // A failure here is the point: budgets that are only advisory get ignored.
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<300', 'p(99)<800'],
  },
};

export default function () {
  const health = http.get(`${BASE_URL}/health/live`);
  check(health, { 'health is 200': (r) => r.status === 200 });

  // Unauthenticated on purpose: it exercises routing, the global guard and the
  // error path without needing seeded credentials.
  const guarded = http.get(`${BASE_URL}/api/v1/users`);
  check(guarded, { 'guarded route rejects': (r) => r.status === 401 });

  sleep(1);
}
