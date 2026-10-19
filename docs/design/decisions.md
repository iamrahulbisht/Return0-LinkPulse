# LinkPulse: design decisions and deviations from the plan

The team's implementation plan (Round 1 PPT + "Prototype Implementation Plan") is the design source.
This file records the choices made while building it, and every place the code differs from the plan, with the reason.

## Architecture in one picture

```
Browser (React SPA on Vercel)
   │  /api/*  (same-origin rewrite → cookie works)
   ▼
Express API on Render  ─────────────┐
   │  GET /:code  (redirect engine)  │ GET /stream?token=  (SSE, direct to API domain)
   │                                 │
   ├── Redis: link cache (5 min), BullMQ "clicks" queue, pub/sub "clicks:<owner>", counters
   └── Postgres (Neon): links, click_events, audit_log, …
          ▲
   BullMQ worker (same process, RUN_WORKER=true) → INSERT click_events → publish to SSE
```

Right-sizing: one API process (redirect + JSON API + worker) is enough for a campus event.
k6 numbers (see PROGRESS.md) decide whether a separate worker is needed; no CDN or load balancer.

## Decisions

| Topic | Decision | Why |
|---|---|---|
| Redis optional | Every Redis use has a fallback: no cache → Postgres; queue down → direct INSERT; counters → in-memory map; pub/sub → in-process events | Plan 6.7 "If Redis is down… no click is lost". Also lets the app run with no Redis at all. |
| No raw IP anywhere | The redirect handler turns the IP into `visitor_hash` and a city **before** queueing, so the IP never enters Redis or Postgres | Plan rule 9. The plan's job shape had `ip` in it; we moved hashing earlier. |
| Visitor hash day | `sha256(ip + ua + IST date + salt)` | "Once per device per day" should follow the Indian calendar day. |
| Atomic limit | One `UPDATE … WHERE click_count < click_limit RETURNING` | Two people can never both take the last slot (test 7 proves 150 parallel → exactly 100). |
| Password unlock cookie | Signed, httpOnly, `Path=/<code>`, 30 min, value = link id | Scoped to one link; cannot be forged or reused for another link. |
| Password tries | Per (code + visitor hash) in Redis/memory, 5 per 5 min | Plan 6.4. Wrong tries never touch `click_count`. |
| Bots on private links | A preview bot hitting a password link sees the form; we still log it as a bot (not counted) | So "WhatsApp share → 1 bot filtered" also works for private links. |
| Limit-blocked visits | Not logged as click events | They are not clicks; logging them as "human" would inflate reports. |
| Status | Computed (`computeStatus` in TS and `STATUS_SQL` in SQL, kept in sync) | Plan section 5. |
| Rate limit on create | 10 per minute per user, **only successful creates count** (`skipFailedRequests`) | Fixing a typo in the wizard should not lock a user out. Spam of real links still gets 429 (test 12). |
| CSV commit | Browser sends the valid rows back; the server re-checks every row | Stateless (survives a Render restart between preview and commit) and safe: a row edited in the browser is validated again. Plan said `rows: [validRowIds]`. |
| Alerts | `link_alerts` has `unique(link_id, type)`, plus `count` and `dismissed_at` columns; extra types `report` and `blocked` | Upsert every 5 minutes without duplicates; admin "Looks fine" = `dismissed_at`; visitor "Report this link" feeds the abuse monitor. |
| "Did you mean …?" on 404 | Only for **custom aliases** within 2 letters | Never reveals random codes, which would defeat their unguessability. |
| Short domain | `SHORT_BASE_URL` (the API's own URL) everywhere; `lp.in` is treated as "our own host" for the loop check | We do not own lp.in (plan section 2). |
| Hashing library | `bcryptjs` instead of `bcrypt` | Same algorithm, pure JS: no native build on Windows or Render. |
| Data fetching | Small `useAsync` hook instead of TanStack Query | Few screens; one less dependency. Plan lists TanStack as optional. |
| Times | DB `timestamptz` (UTC). Expiry dates from the wizard mean 11:59 PM IST that day. Charts bucket with `AT TIME ZONE 'Asia/Kolkata'` | Plan rule "stored in UTC, shown in IST" (test 15). |
| Main QR | After publishing, the wizard creates a "Main QR" for the link | The success screen promises "QR ready as PNG or SVG", and scans are tagged "QR · Main QR". |
| Test DB | Tests run against a separate `linkpulse_test` database with `prisma migrate deploy` | Prisma blocks `migrate reset` from AI agents; deploy is non-destructive. The test helper refuses a database whose name lacks "test". |
| Seed wipe guard | `prisma/seed.ts` truncates all tables; refuses when `NODE_ENV=production` unless `SEED_ALLOW_RESET=true` | Plan phase 7 wants a fresh seed on production, but it must be a deliberate act. |

## Deployment decisions

| Topic | Decision | Why |
|---|---|---|
| API packaging | One Docker image (multi-stage, `node:22-bookworm-slim` + OpenSSL, runs as the `node` user), built from the repo root because of npm workspaces | Same image locally and on Render; Prisma engines are generated for the image's Linux. |
| Migrations | `prisma migrate deploy` at container start, on Neon's **direct** URL (`directUrl`), app traffic on the **pooled** URL | Deploy is non-destructive and idempotent; PgBouncer breaks migration locks. |
| Worker | In the API process (`RUN_WORKER=true`) | Render's free plan has no background workers. `dist/queue/workerMain.js` exists to split it later. |
| Client IP behind two proxies | `trust proxy = 1` (Render). For `/api` calls that come via Vercel, rate limiters read `x-vercel-forwarded-for` (`lib/clientIp.ts`) | Otherwise every user shares Vercel's IP in the sign-in limiter. The header can be faked by calling Render directly, which only dodges the per-IP limiter; the per-account lockout still applies. |
| Several web origins | `WEB_ORIGIN` is a comma list; CORS on `/stream` echoes only listed origins | Production + Vercel preview URLs. |
| Production guard | API refuses to start in production with `localhost` URLs | Catches the most common deploy mistake early. |
| Hosted Redis quotas | BullMQ worker `drainDelay: 30`, `stalledInterval: 120 s` | Free Redis plans count commands; an idle worker would otherwise poll every few seconds. |
| Seed and cache | The seed deletes `link:*` keys in Redis | New link ids after a re-seed; stale cached snapshots would otherwise break redirects for up to 5 minutes. |

## Not built (roadmap, as in the plan)
Custom domains, public API with keys, A/B split links, webhooks (Slack/Discord), safe-browsing check.
Shared workspaces and invites are built (in-app notifications only): see [workspaces.md](workspaces.md).
