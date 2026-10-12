-- Limpieza de comensales huérfanos (EDITADO A MANO: Prisma no genera este paso).
--
-- Hasta ahora cada pago por comensal colgaba de una fila de "comensal" propia:
--   * el backfill de 20260722175451_split_pagos_comensales creó un comensal "Invitado"
--     por cada pago histórico, y
--   * cobrarComensal materializaba un comensal "Invitado N" por cada slot virtual cobrado.
-- Al eliminar el cobro por comensal y la columna pago.comensal_id, esos comensales quedan
-- sin ninguna razón de existir y aparecerían como comensales de la sesión con $0.
--
-- El criterio es deliberadamente estricto para no tocar comensales reales: solo se borra
-- un comensal que (a) se llama exactamente "Invitado" o "Invitado <número>", (b) no es
-- owner ni está ligado a un cliente, (c) tiene algún pago asociado, (d) no tiene ítems
-- etiquetados y (e) no creó a otro comensal.
--
-- Tiene que ir ANTES de cualquier DROP sobre pago.comensal_id: la condición (c) lee esa
-- columna. La FK pago_comensal_id_fkey es ON DELETE SET NULL, así que borrar el comensal
-- no rompe los pagos. No es reversible.
DELETE FROM "comensal" c
WHERE c."nombre" ~ '^Invitado( [0-9]+)?$'
  AND c."es_owner" = false
  AND c."cliente_id" IS NULL
  AND EXISTS     (SELECT 1 FROM "pago" p WHERE p."comensal_id" = c."id")
  AND NOT EXISTS (SELECT 1 FROM "item_comensal" i WHERE i."comensal_id" = c."id")
  AND NOT EXISTS (SELECT 1 FROM "comensal" o WHERE o."creado_por_comensal_id" = c."id");

-- DropForeignKey
ALTER TABLE "pago" DROP CONSTRAINT "pago_comensal_id_fkey";

-- DropIndex
DROP INDEX "pago_sesion_id_comensal_id_key";

-- AlterTable
ALTER TABLE "pago" DROP COLUMN "comensal_id";

-- AlterTable
ALTER TABLE "restaurante" DROP COLUMN "division_pagos_habilitada";

-- AlterTable
ALTER TABLE "sesion_mesa" DROP COLUMN "cantidad_comensales",
DROP COLUMN "modo_division";
