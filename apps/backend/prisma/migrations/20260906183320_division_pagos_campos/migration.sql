-- AlterTable
ALTER TABLE "restaurante" ADD COLUMN     "division_pagos_habilitada" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "sesion_mesa" ADD COLUMN     "cantidad_comensales" INTEGER;

-- AlterTable
ALTER TABLE "comensal" ADD COLUMN     "creado_por_comensal_id" TEXT,
ADD COLUMN     "nombre_normalizado" TEXT;

-- Backfill: normalizar nombre existente antes de forzar NOT NULL
UPDATE "comensal" SET "nombre_normalizado" = lower(trim("nombre")) WHERE "nombre_normalizado" IS NULL;

-- AlterTable
ALTER TABLE "comensal" ALTER COLUMN "nombre_normalizado" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "comensal_sesion_id_nombre_normalizado_key" ON "comensal"("sesion_id", "nombre_normalizado");
