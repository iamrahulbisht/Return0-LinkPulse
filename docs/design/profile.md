# Profile page — design note

**Goal:** a signed-in user can see their account and change it: photo, name, workspace name, email, password,
and sign out other devices. Also shows their own numbers (links, campaigns, QR codes, human clicks).

## What it does
| Area | Behaviour |
|---|---|
| Profile card | Photo (or initials), name, email, role badge, workspace, member since, 4 stat tiles |
| Photo | Upload PNG/JPEG/WebP. The browser crops it to a square and resizes it to 256 × 256 before upload (usually 20–60 KB). Server limit 1 MB, type checked by file signature (magic bytes), not by name. Remove photo. |
| Details | Name (1–80). Workspace name (owner only; members see it read-only). |
| Email | New email + current password. Unique; same rules as sign-up. |
| Password | Current + new (8–200) + confirm. Signs out every other device. |
| Sessions | "Sign out other devices" and "Sign out". |
| Not included | Deleting the account: links are never deleted (plan rule), so this needs a policy decision first. |

## Decisions
| Topic | Decision | Why |
|---|---|---|
| Where photos live | Postgres table `user_avatars (user_id PK, mime, data bytea, updated_at)` | Render's disk is wiped on deploy; no new storage service for a prototype. Kept out of `users` so user reads stay small. Move to object storage (S3/R2) if photos grow. |
| Serving photos | `GET /api/me/avatar` (own photo only, `?v=<updated_at>` for cache busting, `private` cache, `nosniff`) | Photos are only shown to their owner; no public URL to guess. |
| Sign out other devices | `users.token_version`; the session JWT carries `tv`; `requireUser` rejects a token whose `tv` is old | Stateless JWTs cannot be revoked otherwise. Password change bumps it too, then re-issues the current cookie. |
| Re-authentication | Email and password changes need the current password; wrong tries share a per-user limit (10 per 15 min) | Stops a stolen session from taking over the account. |
| Audit | Email and password changes are written to the audit log (no values, only "changed") | Admins can see account takeovers; nothing secret is stored. |
| Validation | zod at the boundary, same messages style as the rest of the API | Consistency. |
