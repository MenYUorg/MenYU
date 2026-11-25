-- La comanda de cada ítem del pedido (#344), guardada al crearlo: un cambio posterior en el plato no mueve los pedidos
-- ya hechos. Los ítems existentes quedan sin comanda (null), y la cocina los muestra en todas las pestañas.

-- AlterTable
ALTER TABLE "pedido_item" ADD COLUMN     "comanda_id" TEXT;

-- AddForeignKey
ALTER TABLE "pedido_item" ADD CONSTRAINT "pedido_item_comanda_id_fkey" FOREIGN KEY ("comanda_id") REFERENCES "comanda"("id") ON DELETE SET NULL ON UPDATE CASCADE;
