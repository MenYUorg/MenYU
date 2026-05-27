-- AlterTable
ALTER TABLE "restaurante" ADD COLUMN IF NOT EXISTS "mp_access_token" TEXT;
ALTER TABLE "restaurante" ADD COLUMN IF NOT EXISTS "mp_refresh_token" TEXT;
ALTER TABLE "restaurante" ADD COLUMN IF NOT EXISTS "mp_user_id" TEXT;
