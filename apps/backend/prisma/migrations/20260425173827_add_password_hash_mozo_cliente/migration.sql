/*
  Warnings:

  - Added the required column `password_hash` to the `mozo` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "cliente" ADD COLUMN     "password_hash" TEXT;

-- AlterTable
ALTER TABLE "mozo" ADD COLUMN     "password_hash" TEXT NOT NULL;
