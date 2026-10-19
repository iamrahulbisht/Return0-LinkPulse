# 5-minute demo script

All numbers on screen come from the live database. Seed data is clearly sample data (users `@linkpulse.test`).

## 10 minutes before judging
0. Re-seed within the hour before judging (`SEED_ALLOW_RESET=true npm run db:seed -w apps/api` against production): the seeded traffic spike on `club-join` is "in the last hour", and the 5-minute alerts job removes it once it is older.
1. Open `https://<api>/health` (wakes the Render free service). Expect `{"ok":true,"redis":"up"}`.
2. Open the web app, sign in as `team@linkpulse.test` in one browser and `admin@linkpulse.test` in a private window.
3. Click through Dashboard, Links, Campaigns, QR codes, Admin once (warms caches).
4. Have the sample CSV ready: `docs/sample-import.csv`.
5. Phone on mobile data (or hotspot), camera app ready to scan.

## A · From link creation to analytics (≈ 2.5 min)
1. **Campaigns → New campaign** "INNOVISTA 2026 Finals", dates today → 30 Oct. *(The seeded "INNOVISTA 2026" also works.)*
2. **New link.** Paste `javascript:alert(1)` → red "javascript: links are not allowed", Continue stays disabled.
   Paste a real URL (e.g. a Google Form). Type alias `innovista` → "Someone already uses …/innovista" and **Free instead:** chips. Click `innovista-2026`. All 4 checks turn green.
3. **Options:** campaign, expiry 30 Oct, click limit **3**, password **on** (tell judges the password). Review panel shows the rules. **Publish** → success screen with the QR.
4. A judge **scans the QR** with their phone → password page → enters the password → redirected.
5. **Dashboard** (already open) updates within seconds: human click +1, device, source **QR scan**. Open the link details: "Recent visits" shows the new row live — "QR · Main QR", device and browser.
6. Open the short link again until the 4th human visit → **"All spots are taken"** (410). Point out: wrong passwords and bots never used up a slot.

## B · From bulk import to link disable (≈ 2 min)
1. **Bulk import** → upload `docs/sample-import.csv`.
2. Report: **6 ready, 2 alias already used, 1 invalid URL, 1 blocked domain**, each with a "How to fix".
3. Import into "INNOVISTA 2026" → "6 links imported…".
4. Switch to the **admin** window → **Abuse monitor**: `club-join` is flagged as a **traffic spike**, `win-iphone` as **reported**. Click **Disable link**, pick a reason, **Disable now**.
5. On the phone, open that short link → **"This link has been turned off"** at once (cache cleared).
6. Back in the app: the link's analytics are still there; the **Audit log** shows "Disabled … reason" and "Cleared cache for … · System". Click **Restore** and give a reason to show it can be undone.

## Bonus (30 s)
Share any short link in WhatsApp. The preview fetch shows on the dashboard as **bots filtered +1**, and the link's
"Recent visits" shows "WhatsApp preview · Preview bot · not counted".

## If something breaks
- Render asleep: wait ~30 s after `/health`.
- Redis down: everything still works (slower); `/health` shows `"redis":"down"`.
- Backups: recorded demo video, local copy on a laptop (`npm run dev:api` + `npm run dev:web` with Docker), git tag of the last working build.
