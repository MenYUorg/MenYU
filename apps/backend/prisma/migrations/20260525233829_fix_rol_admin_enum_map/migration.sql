/*
  Warnings:

  - Made the column `restaurante_id` on table `item_menu` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "item_menu" ALTER COLUMN "restaurante_id" SET NOT NULL;
