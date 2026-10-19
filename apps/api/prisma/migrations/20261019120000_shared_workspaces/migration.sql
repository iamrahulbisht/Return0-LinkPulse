-- Shared workspaces: invites, an active workspace per user, and tags / bio pages owned by a workspace.
-- Additive. Existing rows are backfilled: until now every user owned exactly one workspace.

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('pending', 'accepted', 'declined', 'cancelled');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "active_workspace_id" UUID;
ALTER TABLE "workspace_members" ADD COLUMN     "joined_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "workspaces" ADD COLUMN     "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill: a user without an owned workspace gets one, so every tag / bio page below has a home.
INSERT INTO "workspaces" ("id", "name", "owner_id")
SELECT gen_random_uuid(), split_part(u."name", ' ', 1) || '''s workspace', u."id"
FROM "users" u
WHERE NOT EXISTS (SELECT 1 FROM "workspaces" w WHERE w."owner_id" = u."id");

INSERT INTO "workspace_members" ("workspace_id", "user_id", "role")
SELECT w."id", w."owner_id", 'owner'
FROM "workspaces" w
WHERE NOT EXISTS (SELECT 1 FROM "workspace_members" m WHERE m."workspace_id" = w."id" AND m."user_id" = w."owner_id");

-- Tags and bio pages move from "per user" to "per workspace": the owner's own workspace (one per owner, so
-- the old unique (owner_id, name) carries over to (workspace_id, name)).
ALTER TABLE "tags" ADD COLUMN     "workspace_id" UUID;
ALTER TABLE "bio_pages" ADD COLUMN     "workspace_id" UUID;

UPDATE "tags" t SET "workspace_id" = (
  SELECT w."id" FROM "workspaces" w WHERE w."owner_id" = t."owner_id" ORDER BY w."id" LIMIT 1
);
UPDATE "bio_pages" p SET "workspace_id" = (
  SELECT w."id" FROM "workspaces" w WHERE w."owner_id" = p."owner_id" ORDER BY w."id" LIMIT 1
);

ALTER TABLE "tags" ALTER COLUMN "workspace_id" SET NOT NULL;
ALTER TABLE "bio_pages" ALTER COLUMN "workspace_id" SET NOT NULL;

-- DropIndex
DROP INDEX "tags_owner_id_name_key";

-- CreateTable
CREATE TABLE "workspace_invites" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "invited_by" UUID NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMPTZ,

    CONSTRAINT "workspace_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workspace_invites_email_status_idx" ON "workspace_invites"("email", "status");
CREATE UNIQUE INDEX "workspace_invites_workspace_id_email_key" ON "workspace_invites"("workspace_id", "email");
CREATE INDEX "bio_pages_workspace_id_idx" ON "bio_pages"("workspace_id");
CREATE INDEX "campaigns_workspace_id_idx" ON "campaigns"("workspace_id");
CREATE INDEX "links_workspace_id_status_idx" ON "links"("workspace_id", "status");
CREATE UNIQUE INDEX "tags_workspace_id_name_key" ON "tags"("workspace_id", "name");
CREATE INDEX "workspace_members_user_id_idx" ON "workspace_members"("user_id");
CREATE INDEX "workspaces_owner_id_idx" ON "workspaces"("owner_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_active_workspace_id_fkey" FOREIGN KEY ("active_workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "workspace_invites" ADD CONSTRAINT "workspace_invites_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workspace_invites" ADD CONSTRAINT "workspace_invites_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tags" ADD CONSTRAINT "tags_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bio_pages" ADD CONSTRAINT "bio_pages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
