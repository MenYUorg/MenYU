-- Comandas (#344): no se borran, se desactivan con `activa = false`, y el nombre es único en el restaurante, también
-- entre las inactivas, como las cajas. Las comandas que ya existan quedan activas.

-- AlterTable
ALTER TABLE "comanda" ADD COLUMN     "activa" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "comanda_restaurante_id_nombre_key" ON "comanda"("restaurante_id", "nombre");
