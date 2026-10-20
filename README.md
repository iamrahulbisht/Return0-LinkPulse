# LinkPulse — High-Performance URL Shortener & Real-Time Analytics Platform

> **Short links you stay in control of, with click data you can trust.**  
> A complete URL lifecycle management system featuring an 8-stage ordered redirect engine, atomic click limits, crawler/bot filtering, device-based routing, instant admin killswitches, location-specific QR codes, bulk CSV import, link-in-bio pages, and live Server-Sent Events (SSE) analytics.

[![Live Demo](https://img.shields.io/badge/Live_Demo-LinkPulse-D4FF00?style=for-the-badge&logo=vercel&logoColor=black)](https://return0-linkpulse.vercel.app/)

---

## Live Application & Demo

- **Live Application**: [https://return0-linkpulse.vercel.app/](https://return0-linkpulse.vercel.app/)
- **Demo Accounts**:
  - **Team Member**: `rb5939500@gmail.com` (Password: `rahulbisht`)
  - **System Admin**: `piyush@gmail.com` (Password: `piyush123`)

---

## Problem Statement

Existing URL shorteners mainly provide basic link shortening and simple redirection. Once a link is published, organizations face critical issues:
- **Limited Lifecycle Management**: No way to automatically expire links after a specific deadline or halt traffic after an exact quota (e.g. event registration limits).
- **Unreliable Click Metrics**: Crawlers, email scanners, and preview bots (WhatsApp, Slack, Discord, LinkedIn) generate requests that inflate metrics by 40–70%.
- **Security & Access Risks**: Sensitive links lack password challenges, and compromised links cannot be revoked platform-wide in real-time due to client-side browser caching.
- **Redirection vs. Analytics Overhead**: Logging analytics synchronously during the request slows down visitor redirects.
- **Scattered Management**: Links lack structure; they are not grouped by workspaces, campaigns, or physical distribution channels.

### Real-World Example: Placement / Event Drive
> An institution or company shares a registration link on WhatsApp, email lists, and posters. The link **must expire automatically** when registrations close, **stop immediately** after 100 successful submissions, be **killable instantly** if leaked, and **report pure human visits** without counting WhatsApp link preview crawlers as attendees.

---

## The LinkPulse Solution

LinkPulse treats every link click as an **evaluated execution pipeline** rather than a static lookup:

- **Safe Creation**: Two-step wizard validates URL reachability, ensures aliases are free, checks domain blocklists, and sets rules before publication.
- **Structured Organization**: Manage links inside shared workspaces, folders, campaigns, and physical poster tags.
- **Strict Redirect Pipeline**: Evaluates status, expiration, password gates, and atomic click capacity before issuing a redirect.
- **Clean Analytics**: Distinguishes between automated crawlers and real human visits; preview bots still resolve previews, but are filtered out of engagement metrics.
- **Live SSE Dashboard**: Watch incoming visits stream onto charts in real-time without refreshing.
- **Auditable Security**: Links are **never hard-deleted** — statuses transition to preserve complete analytical history, and all admin actions generate immutable audit logs.

---

## Same Link, Two Outcomes

| Scenario | Basic Shortener | LinkPulse |
|---|:---:|:---:|
| **Bot / Social Preview** | Counted as a real human click | Identified via UA/burst heuristics; flagged as bot & **excluded from counts** |
| **Past Expiration Date** | Continues redirecting indefinitely | Redirect blocked; routes to fallback URL or displays "Link Expired" |
| **Strict Click Limit (e.g. 100)** | Overbooked due to race conditions | **Atomic SQL update** guarantees exactly 100 clicks allowed |
| **Abuse or Security Leak** | No instant way to stop (cached in browsers) | Admin killswitch takes effect in **<1ms**; cache cleared platform-wide |
| **Heavy Traffic Spikes** | Redirect slows down while DB inserts logs | Redirect happens instantly; click logging offloaded to background queue |

---

## System Architecture

<p align="center">
  <img
    <img width="603" height="574" alt="Image" src="https://github.com/user-attachments/assets/524d0f21-190a-4567-b3f7-1e20a57dc29c" />
  />
</p>

### Architectural Safeguards

| What the Redirect Waits For | If the Cache Fails | If the Queue Fails | When an Admin Disables |
|:---|:---|:---|:---|
| Only the lookup, the rule check, and **one atomic database update**. Everything else is queued asynchronously. | Reads fall back directly to PostgreSQL: slightly slower, but **100% correct**. | The service writes the click event straight to PostgreSQL, so **no click is ever dropped**. | Database status changes and the cache entry is invalidated immediately, so the very next click sees **"Link disabled" (410)**. |

---

## The Redirect Engine

Every request to `GET /:code` executes through an exact sequence ([`apps/api/src/logic/rules.ts`](apps/api/src/logic/rules.ts), [`apps/api/src/redirect/engine.ts`](apps/api/src/redirect/engine.ts)):

| # | Check | Condition / Action | Behavior on Failure | HTTP Status |
|:---:|:---|:---|:---|:---:|
| **1** | **Link Exists** | Alias checked in Redis cache, then PostgreSQL | "We can't find this link" page with fuzzy "Did you mean?" suggestions | `404` |
| **2** | **Admin Killswitch** | Link status is `disabled` or domain is on blocklist | "This link has been turned off" (clears instantly) | `410` |
| **3** | **Expiry Validation** | Evaluates current `UTC now > expires_at` | Routes to Fallback URL if configured, else "This link has expired" | `302 / 410` |
| **4** | **Password Gate** | Password challenge configured and not unlocked | Challenge form displayed; 5 failed attempts trigger a 5-minute freeze | `401 / 429` |
| **5** | **Bot Shield** | User-agent classifier & burst detector (>10 reqs/10s) | Redirects visitor (previews render), flags as bot, **never counted in analytics** | `302` |
| **6** | **Atomic Click Limit** | Verifies capacity in a single atomic SQL transaction | "All spots are taken" page; zero overbooking allowed | `410` |
| **7** | **Device Routing** | Matches iOS, Android, or Desktop rules | Routes to matching device destination; falls back to primary URL | — |
| **8** | **Queue & Redirect** | Pushes event payload to BullMQ worker queue | Issues immediate 302 redirect with `Cache-Control: no-store` | `302` |

### Why Always 302, Never 301?
Browsers aggressively cache `301 Moved Permanently` responses locally. If an expired or password-protected link used a 301, visitors who clicked earlier would bypass all validation. LinkPulse strictly uses **`302 Found`** accompanied by `Cache-Control: no-store, no-cache, must-revalidate`.

### The Atomic Click Limit Query
```sql
UPDATE links SET click_count = click_count + 1
WHERE id = $1 AND status = 'active' AND (click_limit IS NULL OR click_count < click_limit)
RETURNING click_count;
```
*(1 row returned = permitted · 0 rows returned = capacity reached)*

---

## Edge Cases Handled

LinkPulse is tested against 15 real-world edge cases to ensure rock-solid stability:

| # | Test Scenario | Expected Behaviour | Verification Method |
|:---:|:---|:---|:---|
| **1** | **Duplicate Alias** | Existing alias rejected with alternate recommendations | Automated API Test |
| **2** | **Reserved Alias** | System paths (`admin`, `api`, `login`, `dashboard`, `auth`) blocked | Automated API Test |
| **3** | **Invalid / Self-URL** | Malformed URLs or loopbacks to the shortener domain are rejected | Automated API Test |
| **4** | **Blocklisted Domain** | Creation blocked and flagged against malicious domain registry | Automated API Test |
| **5** | **Expired Link** | Redirect blocked after expiration timestamp | End-to-End UI Test |
| **6** | **Click Limit Reached** | Atomic SQL update prevents over-allocation under concurrent hits | k6 Concurrency Test |
| **7** | **Wrong Password** | Access denied; consecutive failures trigger 5-minute rate limit | Automated API Test |
| **8** | **Bot / Social Preview** | Preview generated for social card, but omitted from human analytics | Automated Classifier Test |
| **9** | **Disabled Link** | Redirect blocked immediately; analytics history preserved | End-to-End UI Test |
| **10**| **Concurrent Clicks** | Click count matches actual unique visits without race conditions | k6 Load Test |
| **11**| **Unauthorized Access** | Workspace resource ownership verified; violations return `403` | Automated API Test |
| **12**| **Rate-Limit Abuse** | Excessive rapid API requests return `429 Too Many Requests` | Automated API Test |
| **13**| **Cache After Disable** | Redis key invalidated on status toggle; immediate `410` response | Manual & Unit Test |
| **14**| **Redis Failure** | System falls back to PostgreSQL; redirects continue without error | Fault Injection Test |
| **15**| **CSV with Bad Rows** | Valid rows import successfully; broken rows report exact fixes | Bulk Import Validator |

---

## Tech Stack & Architectural Decisions

### Core Technologies
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Recharts, Lucide Icons.
- **Backend**: Node.js (v20+), Express.js, TypeScript.
- **Database**: PostgreSQL (Neon Database with pooling) managed via Prisma ORM.
- **Cache & Queue**: Redis (Upstash / Local Docker) + BullMQ.
- **Security & Validation**: Zod, bcrypt, JWT, Salted SHA-256 in-memory visitor hashing.
- **Utilities**: nanoid (custom codes), qrcode (vector QR output), PapaParse (CSV streaming).

### What We Intentionally Skipped (And Why)
1. **Microservices Overhead**: A unified API and decoupled background worker provide clean isolation without the complexity of distributed network latency.
2. **Predictive AI**: Redirect routing demands exact, deterministic rule logic, not statistical approximations.
3. **NoSQL Databases**: Link states, workspaces, audit logs, and click limits require strict ACID relational transactions.
4. **Permanent 301 Redirects**: Browser caching breaks dynamic expiration, password gates, and instant killswitches.

---

## Privacy & GDPR Compliance

No raw IP addresses are ever saved to disk or persistent databases. Visitor identities are anonymized in memory:
$$\text{visitor\_hash} = \text{SHA-256}(\text{IP} + \text{UserAgent} + \text{Daily IST Date} + \text{HASH\_SALT})$$
This allows the system to compute unique human visitor counts accurately while guaranteeing user privacy.

---

## Complete Local Setup (From Clone to Run)

Follow this step-by-step guide to run the full stack locally on Windows, macOS, or Linux.

### 1. Prerequisites
- **Node.js**: v20 or higher ([Download](https://nodejs.org/))
- **Docker Desktop**: For running PostgreSQL & Redis locally ([Download](https://www.docker.com/products/docker-desktop/))
- **Git**

---

### 2. Clone the Repository
```bash
git clone https://github.com/iamrahulbisht/Return0-LinkPulse.git
cd Return0-LinkPulse
```

---

### 3. Install Monorepo Dependencies
LinkPulse uses npm workspaces. Install all dependencies from the root directory:
```bash
npm install
```

---

### 4. Start PostgreSQL and Redis via Docker
```bash
docker compose up -d
```
Verify the containers are healthy:
```bash
docker ps
```
*(You should see `postgres` on port `5432` and `redis` on port `6379`)*

---

### 5. Configure Environment Files

#### Backend Environment (`apps/api/.env`):
```bash
# On Windows PowerShell:
copy apps\api\.env.example apps\api\.env

# On macOS/Linux:
cp apps/api/.env.example apps/api/.env
```

Open `apps/api/.env` and review the configurations:
```env
PORT=4000
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/linkpulse?schema=public"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="a-very-long-random-string-used-to-sign-jwt-tokens"
HASH_SALT="another-random-string-used-for-salted-visitor-hashes"
SHORT_BASE_URL="http://localhost:4000"
WEB_ORIGIN="http://localhost:5173"
RUN_WORKER="true"
TZ_DISPLAY="Asia/Kolkata"
SEED_PASSWORD="password123"
SEED_LINK_PASSWORD="password123"
GEOIP_ENABLED="false"
```

#### Frontend Environment (`apps/web/.env`):
```bash
# On Windows PowerShell:
copy apps\web\.env.example apps\web\.env

# On macOS/Linux:
cp apps/web/.env.example apps/web/.env
```

Open `apps/web/.env`:
```env
VITE_API_BASE="/api"
VITE_SHORT_BASE_URL="http://localhost:4000"
```

---

### 6. Run Database Migrations & Seed Demo Data
```bash
# Run Prisma migrations to create tables
npm run db:migrate -w apps/api

# Seed sample links, demo campaigns, and test users
npm run db:seed -w apps/api
```

---

### 7. Start the Development Servers

Open **two separate terminal windows**:

#### Terminal 1 — Backend API & Worker:
```bash
npm run dev:api
```
*API will start at `http://localhost:4000` (Health check: `http://localhost:4000/health`)*

#### Terminal 2 — Frontend Web App:
```bash
npm run dev:web
```
*Web dashboard will start at `http://localhost:5173`*

Open **[http://localhost:5173](http://localhost:5173)** in your browser and log in with:
- Email: `rb5939500@gmail.com`
- Password: `rahulbisht`

---

### 8. Running Automated Tests

#### Unit & Integration Tests:
```bash
# Create the isolated test database in Docker (first run only):
docker compose exec postgres createdb -U postgres linkpulse_test

# Execute the test suite:
npm test
```

#### k6 Load & Concurrency Benchmark:
```bash
docker run --rm -v "$PWD/load:/scripts" grafana/k6 run -e BASE=http://host.docker.internal:4000 -e CODE=club-join /scripts/k6-redirect.js
```

---

## The Team — RETURN 0

- **Rahul Bisht** 
- **Piyush Naula** 
- **Yash Karki** 
- **Chinmay Mewari** 
- **Gaurav Mer** 

---
