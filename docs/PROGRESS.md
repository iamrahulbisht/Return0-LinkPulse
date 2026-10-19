# Progress log

Format per phase: what was built · how to run · what was tested · what is left.
Dates are IST. "Tested" means a command was actually run and passed on 18 Oct 2026 on a local Windows laptop
(Node 24, Postgres 16 + Redis 7 in Docker).

## Phase 0 · Setup — done (local), deploy pending
- **Built:** npm workspaces monorepo (`apps/api`, `apps/web`), Prisma schema for every table in plan §5 + first migration,
  ESLint/Prettier/TypeScript, `docker-compose.yml` (Postgres on 5433, Redis on 6380), `.env.example` files,
  GitHub Actions CI (`.github/workflows/ci.yml`: lint, type-check, API + web tests, build), `render.yaml`, `apps/web/vercel.json`
  (API rewrite + `index.html` fallback), Vite dev proxy.
- **Run:** see README → "Run it locally".
- **Left (team):** create the GitHub repo, Neon, hosted Redis, Render and Vercel projects; put secrets only in their dashboards;
  replace `linkpulse-api.onrender.com` in `apps/web/vercel.json` with the real Render URL; check free-tier limits
  (Render sleeps when idle; background workers are not free, so the worker runs inside the API with `RUN_WORKER=true`).

## Phase 1 · Working core — done (local)
- **Built:** auth (signup, login, logout, me; JWT in httpOnly `lp_session`; 5 wrong tries → 5-minute lock), create link
  (random 7-char nanoid code or custom alias; URL, alias, blocklist, loop, expiry checks; `POST /api/links/validate` for live checks;
  10/min rate limit), redirect engine with the full rule order and the atomic limit, server-rendered visitor pages
  (password, 404 with "Did you mean", disabled, expired, limit, reported), BullMQ click queue + worker with direct-to-Postgres
  fallback, bot filter + burst check, salted visitor hash, seed data (~2,000 click events, repeatable).
- **Tested:** `npm test -w apps/api` → unit tests for every function in `logic/` and API tests for edge cases 1–15 (see below).
  Manual curl: `club-join` 302, `innovista26` 401 (password), `fest-pass` 410 (limit), `lib-drive` 410 (expired),
  `free-recharge` 410 (disabled), typo `innovsta26` 404, `get-app` 302 to Play Store for Android, WhatsApp UA 302 + logged as bot.
- **Left:** deploy and repeat the "Done when" check on the live site with a real phone and a real WhatsApp share.

## Phases 2–5 · Link management, live analytics, QR/CSV/device rules/bio, admin — done (local)
- **API built:** links list with computed-status tabs + counts, filters, search, pagination; link details stats, recent visits, history
  (audit, old → new); edit (expiry, limit, password, fallback, rules, campaign, tags) with cache invalidation; campaigns + tags;
  QR per location (PNG/SVG, `?src=qr&q=<id>` tagging, contrast check); CSV preview (row-by-row report) + commit (re-validated);
  analytics overview/timeseries (IST buckets)/top links/sources/devices/cities/alerts/CSV export; SSE live stream with 60-second
  token; alerts job every 5 minutes (expiring, near limit, spike, bots, blocklist) + visitor reports; admin overview, flagged links,
  disable (reason) / restore / dismiss, blocklist add (flags existing links) / remove, audit log; bio pages + public page.
- **Screens:** all 14 `LinkPulse-UI/` screens rebuilt as React pages in `apps/web/src/pages/` (visitor pages are server-rendered by
  the API). Pages are lazy-loaded: main bundle 197 kB, Recharts only in the Dashboard chunk.
- **Verified in a browser (local, 18 Oct):**
  - Dashboard: every panel from real data; a curl visit (1 human + 1 WhatsApp preview) updated human clicks, unique visitors and
    "bots filtered" within 4 s **without a reload** (SSE).
  - Demo scenario A: wizard showed "javascript: links are not allowed" and "Someone already uses …/innovista" with free suggestions;
    Continue stayed disabled until all 4 checks passed; published with campaign, expiry, limit 3 and password; success screen with Main QR.
    Four simulated phones scanning the QR (`?src=qr&q=<id>`): all got the password page (401), unlocked, visitors 1–3 redirected,
    visitor 4 got "All spots are taken" (410). Link details shows 3 counted visits "QR · Main QR".
  - Demo scenario B: sample CSV → 6 ready / 2 alias used / 1 invalid URL / 1 blocked, each with a fix; imported 6 into INNOVISTA 2026.
    Admin: disabled `club-join` with a reason through the dialog → next visit 410 "This link has been turned off" → Restore;
    audit log shows Disabled (reason) / Cleared cache (System) / Restored.
  - Link details, Links (tabs/filters/pagination), Campaigns, QR codes (real PNGs), Bio manager, public bio (`?src=bio` links),
    Landing, Brand guide, 404: render with real data.
  - Phone width: all pages at 375 px with no sideways page scroll (tables scroll inside their card).
- **Not verified:** a real phone camera scan, a real WhatsApp share, screen-reader pass, keyboard-only walk through every screen
  (components use real buttons/labels/focus rings, but nobody has tabbed through all of them yet).

## Phase 6 · Tests and load
### Edge cases (plan §11) — all automated
| # | Test | Where |
|---|---|---|
| 1 | Alias taken → wizard warning + 409 | `tests/api/links.test.ts` |
| 2 | Same alias at the same time → one 201, one 409 | `links.test.ts` (Promise.all) |
| 3 | Reserved alias blocked with suggestion | `links.test.ts` |
| 4 | `javascript:`, invalid, own-domain URLs blocked | `links.test.ts` |
| 5 | Blocklisted destination blocked; existing links flagged + stopped | `links.test.ts`, `redirect.test.ts` |
| 6 | Past expiry → 400 | `links.test.ts` |
| 7 | Limit 100, 150 parallel visits → exactly 100 counted, rest 410 | `redirect.test.ts` |
| 8 | Wrong password: not counted, 5 tries → 429, right one unlocks | `redirect.test.ts` |
| 9 | WhatsApp / Slack / Telegram UA → 302, saved as bot, not counted | `redirect.test.ts` |
| 10 | Expired → page or fallback; analytics kept | `redirect.test.ts` |
| 11 | User A opens User B's link → 403 on every :id route | `links.test.ts` |
| 12 | 50 creates in 10 s → 10 ok, 40 × 429 | `links.test.ts` |
| 13 | Sample CSV → 6 valid, 2 alias used, 1 invalid URL, 1 blocked; valid rows import | `tests/api/import-analytics.test.ts` |
| 14 | Disable deletes the Redis key; next visit blocked | `redirect.test.ts` |
| 15 | UTC stored, IST shown (unit + chart buckets + UI formatter) | `tests/unit/logic.test.ts`, `import-analytics.test.ts`, `apps/web/src/lib/format.test.ts` |

### Load (measured, not invented)
- **Local, Node benchmark** (`node load/node-redirect-bench.mjs http://localhost:4000 club-join 50 3000`), API running with `tsx`
  (not a production build) on the laptop, Redis + worker on: 3,000 requests, 50 concurrent, **all 302**, 528 req/s,
  **p50 86.9 ms, p95 142.9 ms, p99 252.5 ms**. Afterwards Postgres had exactly 3,000 new click rows (none lost through the queue).
- **k6 (grafana/k6 v2.3.0 in Docker), local API** — production build (`node dist/index.js`), Redis + in-process worker,
  traffic going through Docker Desktop's `host.docker.internal` (adds network overhead, so this is pessimistic for localhost):
  - *Normal* (`-e CODE=club-join`, 50 VUs × 30 s): **12,476 redirects, 0 failed, all checks passed (302, never 301; no-store)**,
    414 req/s, **p50 99.3 ms, p95 253.2 ms**, max 580.9 ms. Threshold p95 < 500 ms: passed.
  - *Limit* (`-e SCENARIO=limit`, link with limit 100, 50 VUs, 300 requests): **exactly 100 × 302 and 200 × 410**;
    afterwards `click_count = 100` and exactly 100 counted click rows in Postgres. p95 144.6 ms.
    (k6 reports the 410s as `http_req_failed` — expected, they are the "All spots are taken" pages.)
- **k6 on the live URL:** still to do after deploy — same commands with `-e BASE=https://<api-domain>`. Record that p95 here;
  it is the number for the slides (Render free tier + Neon will be slower than this laptop).

```bash
docker run --rm -v "$PWD/load:/scripts" grafana/k6 run -e BASE=https://<api-domain> -e CODE=club-join /scripts/k6-redirect.js
```

## Before Round 2 (team, please read plan §14)
- Our Round 1 slide says no AI tools wrote the code. That is no longer true: this code was written with an AI coding assistant.
  Check the hackathon rules on AI tools and update the slide (for example "AI-assisted; every line reviewed and explained by the team").
- Each member owns an area (Engine, Admin, Create flow, Dashboard, Testing) and must be able to explain its files, the rule order,
  the atomic UPDATE and the async queue. Start with README → "The redirect engine" and `docs/design/decisions.md`.
- Never put real passwords, keys or tokens in the repo, screenshots or slides.

## UI update · new dark theme (19 Oct) — done (local)
- **What changed (UI only):** the web app now follows the "LinkPulse Frontend" reference — black page, `#121214` cards,
  `#1A1A1E` inputs, lime `#D4FF00` for actions/focus/live, Space Grotesk headings, Inter body, Outfit buttons, Zentry wordmark,
  sky-blue for bots. Done through the design tokens (`apps/web/tailwind.config.ts`, `src/index.css`), the shared components
  (`components/ui.tsx`, `Logo.tsx`, `layouts/AppLayout.tsx`), chart colours, and a centred auth card on `/login`.
  Sidebar is pinned from tablet width up (sticky, full height, scrolls on its own if needed); only the content scrolls. Phones stack it on top.
- **Not changed:** routes, API calls, state, validation, live updates. A token-level diff against the pre-change copy showed only
  class names, colours, comments and the login/logo markup.
- **Kept from the old rules on purpose:** text ≥ 12.5 px and 44 px touch targets (the reference uses smaller), visible focus rings,
  labels for screen readers, status = dot + word.
- **Tested:** contrast audit of every route (all text ≥ 4.5:1, large ≥ 3:1), no sideways scroll at 375 px, sign-in error and success
  through the new form, lint, type-check, web tests, production build.
- **Also restyled:** the visitor pages served by the API (`apps/api/src/views/visitor.ts`: password gate, unlocked, 404, turned off,
  expired, limit, reported) — same wording (tests check it), dark card + lime button; and the `/brand` guide, now documenting the dark
  palette with computed contrast ratios, the four fonts + Zentry wordmark, the new mark, CSS variables and Tailwind config.
  Verified: 107 API tests pass, every visitor page and `/brand` passes the contrast audit and fits 375 px.

## Profile page (19 Oct) — done (local)
- **Built:** `/profile` (sidebar account card and dashboard avatar link to it): profile photo (upload, change, remove), name,
  workspace name (owner only), email change and password change (both need the current password), "Sign out other devices",
  and the user's own numbers (links, human clicks, campaigns, QR codes). Design: [docs/design/profile.md](design/profile.md).
- **API:** `GET/PATCH /api/me/profile`, `POST /api/me/email`, `POST /api/me/password`, `POST /api/me/sessions/revoke`,
  `PUT/GET/DELETE /api/me/avatar`. Migration `profile_avatar_token_version` (adds `users.token_version`, table `user_avatars`; additive only).
- **Security:** photos are checked by their bytes (PNG/JPEG/WebP only, 1 MB max), served only to their owner with `nosniff`;
  password change and "sign out other devices" bump the token version so old sessions stop working; wrong current passwords are
  limited to 10 per 15 minutes; email/password changes go to the audit log without the values.
- **Tested:** 10 new API tests (117 API tests pass in total). In the browser: photo upload through the real file input
  (481 KB image → 2.6 KB WebP, sidebar updated at once), name edit + validation, password change (wrong, mismatch, success, restored),
  contrast audit and 375 px check.
- **Not built:** deleting an account (links are never deleted by plan rule, so it needs a policy first).

## Shared workspaces (19 Oct) — done (local)
- **Built:** several workspaces per user, a sidebar switcher, and `/workspaces`: invitations for me (Accept / Decline), my workspaces
  (switch, create), members, and for the owner: invite by email, cancel invite, remove member, rename. Members can leave.
  The "Workspaces" nav item shows a badge with pending invitations (re-checked every minute and on tab focus). Design: [docs/design/workspaces.md](design/workspaces.md).
- **Access model change:** data is now scoped by **workspace**, not by user: links, campaigns, tags, QR codes, bio pages, analytics,
  alerts and the live stream (`clicks:ws:<id>`) all follow the active workspace. `owner_id` stays as "created by".
- **API:** `GET/POST /api/workspaces`, `POST /:id/switch`, `PATCH /:id`, `GET /:id/members`, `POST /:id/invites`,
  `DELETE /:id/invites/:inviteId`, `DELETE /:id/members/:userId`, `POST /:id/leave`, `GET /api/invites`, `POST /api/invites/:id/accept|decline`.
  `/api/auth/me` adds `workspace.role` and `counts.invites`.
- **Migration** `shared_workspaces` (additive + backfill): `users.active_workspace_id`, `workspace_invites`, `workspace_members.joined_at`,
  `workspaces.created_at`, `tags.workspace_id` (unique per workspace), `bio_pages.workspace_id`, workspace indexes.
- **Tested:** 9 new API tests (126 API tests pass in total), web lint/type-check/tests/build. In the browser with two fresh local accounts:
  invite → badge "1" for the invitee → Accept → switched to the workspace as Member and saw the owner's link; owner-only controls hidden
  for the member (API returns 403 `OWNER_ONLY` too); sidebar switch reloads the page data; owner removed the member through the dialog;
  `/workspaces` fits 375 px.
- **Not built:** email delivery of invites (needs a mail service), deleting a workspace, transferring ownership.

## Responsive pass (19 Oct) — done (local)
- **App shell:** below 1024 px (phones, tablets) the sidebar became a sticky top bar (menu, logo, New link) plus a slide-in
  navigation drawer (focus moves in and is trapped, Escape / tap outside / any navigation closes it, page scroll is locked,
  focus returns to the menu button; a dot on the menu shows pending invites or admin flags). From 1024 px up the sidebar is
  pinned as before. Before: on phones the whole sidebar filled the first screen; on tablets it took 256 of 768 px.
- **Pages:** links list shows cards below 1280 px (1 column on phones, 2 on tablets) and the table above; dashboard "Top links"
  is a list on phones; chart shows ~4 date labels on phones (were clipped); stat tiles 2 per row on phones; card padding 16 px on
  phones; campaign dropdown no longer pushes the page sideways (long campaign names); short links wrap after the slash instead of
  mid-word; dashboard search/bell/avatar stay on one row; wizard header is two compact rows on phones; bio page URL no longer
  squeezed to one character; workspace/member rows wrap their badges instead of truncating names.
- **Fixed on the way:** admin nav lit up all three admin items on `/admin#audit` (hash ignored); now only the matching one.
- **Tested:** every app page + landing, public bio, brand, 404 at 360, 390, 768, 1024, 1280, 1440 px — fully loaded, no sideways
  scroll (90 checks); screenshots at 375 / 768 / 1024 / 1440; drawer keyboard + focus behaviour; web lint, type-check, tests, build.
  Test data was temporary and removed from Neon afterwards. Not tested: a real phone, Safari/iOS, the signed-out `/login` page.
- **API fix found while testing:** creating a link with tags returned 500 against Neon from a laptop (interactive transaction
  passed Prisma's 5 s limit: one upsert per tag + slow pooled connection). Tags now take 2 queries in total; transactions get
  15 s. Local `.env` uses Neon's direct host (pooled was 0.5–13 s per query from here); keep the pooled URL on Render.

