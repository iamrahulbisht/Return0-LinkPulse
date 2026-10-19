// k6 load test for the redirect engine.
//
//   Normal load (50 virtual users, 30 s) against a link with no limit:
//     k6 run -e BASE=https://<api-domain> -e CODE=club-join load/k6-redirect.js
//   Exact-limit test (create a link with click limit 100 first, then):
//     k6 run -e BASE=https://<api-domain> -e CODE=<code> -e SCENARIO=limit load/k6-redirect.js
//     → afterwards the link must show exactly 100 human clicks; every other request got 410.
//
// Record the REAL p95 from the k6 summary in docs/PROGRESS.md. Do not invent numbers.
// Note: each VU sends a different X-Forwarded-For so the burst filter sees different visitors.
// Render's proxy may overwrite that header; then the limit test still holds, but some hits are
// marked "suspicious" by the burst check (>10 hits in 10 s from one visitor).
import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const BASE = __ENV.BASE || 'http://localhost:4000';
const CODE = __ENV.CODE || 'club-join';
const SCENARIO = __ENV.SCENARIO || 'normal';

const redirected = new Counter('redirected_302');
const limitReached = new Counter('limit_reached_410');

export const options =
  SCENARIO === 'limit'
    ? {
        scenarios: { limit: { executor: 'shared-iterations', vus: 50, iterations: 300, maxDuration: '60s' } },
        thresholds: { checks: ['rate>0.99'] },
      }
    : {
        scenarios: { normal: { executor: 'constant-vus', vus: 50, duration: '30s' } },
        thresholds: { http_req_duration: ['p(95)<500'], checks: ['rate>0.99'] },
      };

const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';

export default function () {
  const ip = `10.${__VU % 250}.${Math.floor(__ITER / 250) % 250}.${__ITER % 250}`;
  const res = http.get(`${BASE}/${CODE}`, {
    redirects: 0,
    headers: { 'User-Agent': UA, 'X-Forwarded-For': ip },
    tags: { name: 'redirect' },
  });
  if (res.status === 302) redirected.add(1);
  if (res.status === 410) limitReached.add(1);
  check(res, {
    'is 302 or 410 (never 301)': (r) => r.status === 302 || r.status === 410,
    'no-store': (r) => (r.headers['Cache-Control'] || '').includes('no-store'),
  });
}
