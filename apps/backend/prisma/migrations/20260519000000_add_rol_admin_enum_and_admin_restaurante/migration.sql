-- CreateEnum
CREATE TYPE "rol_admin" AS ENUM ('ROOT', 'OWNER', 'GERENTE');

-- AlterTable: convert existing TEXT values to the new enum.
-- Any row with rol = 'ADMIN' (from bootstrapDev) becomes 'GERENTE'.
UPDATE "admin" SET "rol" = 'GERENTE' WHERE "rol" = 'ADMIN';
ALTER TABLE "admin"
  ALTER COLUMN "rol" TYPE "rol_admin"
  USING "rol"::text::"rol_admin";

-- CreateTable
CREATE TABLE "admin_restaurante" (
    "id"             TEXT NOT NULL,
    "admin_id"       TEXT NOT NULL,
    "restaurante_id" TEXT NOT NULL,

    CONSTRAINT "admin_restaurante_pkey"                          PRIMARY KEY ("id"),
    CONSTRAINT "admin_restaurante_admin_id_restaurante_id_key"   UNIQUE ("admin_id", "restaurante_id")
);

-- AddForeignKey
ALTER TABLE "admin_restaurante"
  ADD CONSTRAINT "admin_restaurante_admin_id_fkey"
  FOREIGN KEY ("admin_id") REFERENCES "admin"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "admin_restaurante"
  ADD CONSTRAINT "admin_restaurante_restaurante_id_fkey"
  FOREIGN KEY ("restaurante_id") REFERENCES "restaurante"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
