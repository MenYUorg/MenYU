-- AlterTable: restaurante — add modo_sesion
ALTER TABLE "restaurante" ADD COLUMN "modo_sesion" TEXT NOT NULL DEFAULT 'abierto';

-- AlterTable: sesion_mesa — add codigo_sesion (NOT NULL, tabla vacía)
ALTER TABLE "sesion_mesa" ADD COLUMN "codigo_sesion" TEXT NOT NULL;

-- AlterTable: pedido_item — add cliente_id (nullable)
ALTER TABLE "pedido_item" ADD COLUMN "cliente_id" TEXT;

-- CreateTable: sesion_mesa_cliente
CREATE TABLE "sesion_mesa_cliente" (
    "id"           TEXT         NOT NULL,
    "sesion_id"    TEXT         NOT NULL,
    "cliente_id"   TEXT         NOT NULL,
    "orden"        INTEGER      NOT NULL,
    "ingresado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sesion_mesa_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique por sesión + cliente
CREATE UNIQUE INDEX "sesion_mesa_cliente_sesion_id_cliente_id_key"
    ON "sesion_mesa_cliente"("sesion_id", "cliente_id");

-- AddForeignKey: sesion_mesa_cliente → sesion_mesa
ALTER TABLE "sesion_mesa_cliente"
    ADD CONSTRAINT "sesion_mesa_cliente_sesion_id_fkey"
    FOREIGN KEY ("sesion_id") REFERENCES "sesion_mesa"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: sesion_mesa_cliente → cliente
ALTER TABLE "sesion_mesa_cliente"
    ADD CONSTRAINT "sesion_mesa_cliente_cliente_id_fkey"
    FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: pedido_item → cliente
ALTER TABLE "pedido_item"
    ADD CONSTRAINT "pedido_item_cliente_id_fkey"
    FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
