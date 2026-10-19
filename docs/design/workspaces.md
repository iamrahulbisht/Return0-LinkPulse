# Shared workspaces — design note

**Goal:** a user can create several workspaces, invite people into one, and the invited person decides (accept / decline).
Members work inside the workspace (links, campaigns, QR codes, import, bio pages, analytics). Only the creator manages people.

## Today (what changes)
`workspaces` and `workspace_members` already exist, but every signup gets exactly one workspace and **every query is scoped by
`owner_id = me`**, not by workspace. `requireUser` picks "the first membership". So sharing needs two things:
1. a notion of the **active workspace** per user, and
2. moving data scoping from "my rows" to "rows in a workspace I belong to".

## Roles and permissions
| Action | Owner (creator) | Member | Not a member |
|---|---|---|---|
| See / create / edit links, campaigns, tags, QR, import, bio pages, analytics, live stream | ✅ | ✅ | ❌ 403 |
| Rename workspace | ✅ | ❌ | ❌ |
| Invite people, cancel a pending invite | ✅ | ❌ | ❌ |
| Remove a member | ✅ | ❌ | ❌ |
| Leave workspace | ❌ (owner cannot leave own workspace) | ✅ | — |
| Accept / decline an invite | — | — | ✅ (only the invited email) |

Platform admin (`users.role = admin`) keeps the existing abuse-monitor powers; it does **not** get workspace membership.

## Data model (one additive migration)
```
users            + active_workspace_id uuid NULL → workspaces(id) ON DELETE SET NULL
workspaces       + created_at timestamptz
workspace_invites (new)
  id uuid PK, workspace_id → workspaces, email text (lower-case), invited_by → users,
  status enum(pending, accepted, declined, cancelled), created_at, responded_at
  UNIQUE (workspace_id, email) WHERE status = 'pending'      -- partial index, raw SQL in the migration
  INDEX (email, status)
tags             + workspace_id (backfilled from owner's workspace); unique (owner_id,name) → (workspace_id,name)
bio_pages        + workspace_id (backfilled from owner's workspace)
links            + INDEX (workspace_id, status)   campaigns + INDEX (workspace_id)
```
Backfill is safe because today every user has exactly one workspace. `owner_id` stays on every row as **"created by"**
(audit + profile stats), but no longer decides access.

## API
| Method & path | Who | Notes |
|---|---|---|
| `GET /api/workspaces` | me | My workspaces: id, name, role, memberCount, isActive |
| `POST /api/workspaces` | me | `{name}` → creates it, makes me owner, switches to it. Max 20 owned. |
| `POST /api/workspaces/:id/switch` | member | Sets `active_workspace_id` |
| `PATCH /api/workspaces/:id` | owner | Rename |
| `GET /api/workspaces/:id/members` | member | Members + (owner only) pending invites |
| `POST /api/workspaces/:id/invites` | owner | `{email}`; 20/hour per user |
| `DELETE /api/workspaces/:id/invites/:inviteId` | owner | Cancel pending invite |
| `DELETE /api/workspaces/:id/members/:userId` | owner | Remove (not self) |
| `POST /api/workspaces/:id/leave` | member (not owner) | |
| `GET /api/invites` | me | Pending invites addressed to **my email** (the notifications) |
| `POST /api/invites/:id/accept` / `decline` | invited user | Accept adds membership and switches to it |

`GET /api/auth/me` gains `workspace.role` and `counts.invites` (drives the notification badge).

## Key decisions
| Topic | Decision | Why / trade-off |
|---|---|---|
| Active workspace | Stored server-side in `users.active_workspace_id`; `requireUser` loads it, falls back to the first membership if it is gone | Every existing route already reads `req.user.workspaceId`, so the change stays small. QR `<img>` URLs and the SSE stream cannot send custom headers, so a per-request header would not work everywhere. Trade-off: two browser tabs share one active workspace. |
| Access check | List routes filter by the active `workspace_id`; `:id` routes check "link's workspace ∈ my memberships" (memberships loaded once per request) | Opening a link URL from another of your workspaces still works; another user's link is still 403 (edge case 11 keeps passing). |
| Invite by email, not user id | Invite is stored by email; it shows up for whoever has (or later signs up with) that email. API always answers "Invite sent" | No new "does this email have an account?" oracle, and you can invite someone before they sign up. |
| Notifications | In-app only: badge in the sidebar + "Invitations" panel, refreshed on page change and every 60 s | No email service exists; adding one is new infrastructure (SMTP/Resend) — listed as follow-up. |
| Removing a member | Membership row deleted; links they created **stay** in the workspace (still owned by the workspace) | Plan rule: links are never deleted. |
| Deleting a workspace | **Not built** | Same rule: a workspace with links cannot be deleted without a policy. |
| Live stream | Pub/sub channel becomes `clicks:ws:<workspaceId>`; stream token carries the active workspace id | All members see live clicks for the shared links. |
| Ownership transfer | Not built | Out of scope; owner is always the creator. |

## Frontend
- **Sidebar workspace switcher** (current name + role; list; "New workspace"; "Manage workspaces"). Switching re-mounts the page so all data reloads.
- **`/workspaces` page:** Invitations to me (Accept / Decline) · my workspaces · selected workspace: members, pending invites, invite form, rename — owner-only controls hidden for members, "Leave" for members.
- **Notification badge** on the "Workspaces" nav item = pending invites.

## Tests
API tests (supertest): create + switch; invite → invitee sees it → accept → sees workspace links, can create a link there;
member cannot invite / remove / rename (403); decline; cancel; duplicate pending invite → 409; outsider 403 on every workspace route
and on a shared link; removed member loses access and falls back to own workspace; leave; owner cannot leave.
