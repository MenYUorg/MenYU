-- Cuándo se marcó listo cada ítem del pedido (#344, "Listo" por comanda). Es null mientras está pendiente: los ítems
-- existentes quedan en null y un pedido en preparación anterior a este cambio se ve como todo pendiente.
-- TIMESTAMPTZ(3), como las fechas nuevas de caja y del asistente.

-- AlterTable
ALTER TABLE "pedido_item" ADD COLUMN     "listo_en" TIMESTAMPTZ(3);
