-- AlterTable
ALTER TABLE "audit_log" ADD COLUMN     "subject_user_id" UUID;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "last_login_at" TIMESTAMPTZ,
ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "suspended_at" TIMESTAMPTZ,
ADD COLUMN     "suspended_reason" TEXT,
ADD COLUMN     "temp_password_expires_at" TIMESTAMPTZ;

-- CreateIndex
CREATE INDEX "audit_log_subject_user_id_created_at_idx" ON "audit_log"("subject_user_id", "created_at");

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_subject_user_id_fkey" FOREIGN KEY ("subject_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

