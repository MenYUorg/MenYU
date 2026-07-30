-- AlterTable
ALTER TABLE "pago" ADD COLUMN     "sesion_id" TEXT,
ADD COLUMN     "comensal_id" TEXT;

-- CreateTable
CREATE TABLE "comensal" (
    "id" TEXT NOT NULL,
    "sesion_id" TEXT NOT NULL,
    "cliente_id" TEXT,
    "nombre" TEXT NOT NULL,
    "es_owner" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comensal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_comensal" (
    "id" TEXT NOT NULL,
    "pedido_item_id" TEXT NOT NULL,
    "comensal_id" TEXT NOT NULL,

    CONSTRAINT "item_comensal_pkey" PRIMARY KEY ("id")
);

-- Backfill: pago.sesion_id a partir del pedido relacionado
UPDATE "pago"
SET "sesion_id" = "pedido"."sesion_id"
FROM "pedido"
WHERE "pedido"."id" = "pago"."pedido_id";

-- Backfill: un comensal "Invitado" distinto por cada pago (no por sesion),
-- ya que no hay forma de saber a que persona correspondia cada pago historico.
-- Una sesion con multiples pagos termina con multiples comensales "Invitado",
-- uno por pago, evitando colisiones en @@unique([sesionId, comensalId]).
-- El uuid del comensal se genera una unica vez por fila de pago (CTE materializada
-- por ser referenciada dos veces) y se reutiliza en el INSERT y en el UPDATE,
-- correlacionando directo por pago.id. Un solo CTE declarativo, sin loop por fila.
WITH comensales_a_crear AS MATERIALIZED (
    SELECT gen_random_uuid() AS "comensal_id", "id" AS "pago_id", "sesion_id"
    FROM "pago"
    WHERE "sesion_id" IS NOT NULL
),
nuevos_comensales AS (
    INSERT INTO "comensal" ("id", "sesion_id", "nombre", "es_owner", "created_at")
    SELECT "comensal_id", "sesion_id", 'Invitado', false, now()
    FROM comensales_a_crear
    RETURNING "id"
)
UPDATE "pago"
SET "comensal_id" = comensales_a_crear."comensal_id"
FROM comensales_a_crear
WHERE "pago"."id" = comensales_a_crear."pago_id";

-- AlterTable
ALTER TABLE "pago" ALTER COLUMN "sesion_id" SET NOT NULL;

-- DropForeignKey
ALTER TABLE "pago" DROP CONSTRAINT "pago_pedido_id_fkey";

-- DropIndex
DROP INDEX "pago_pedido_id_key";

-- AlterTable
ALTER TABLE "pago" DROP COLUMN "pedido_id";

-- CreateIndex
CREATE UNIQUE INDEX "item_comensal_pedido_item_id_comensal_id_key" ON "item_comensal"("pedido_item_id", "comensal_id");

-- CreateIndex
CREATE UNIQUE INDEX "pago_sesion_id_comensal_id_key" ON "pago"("sesion_id", "comensal_id");

-- AddForeignKey
ALTER TABLE "pago" ADD CONSTRAINT "pago_sesion_id_fkey" FOREIGN KEY ("sesion_id") REFERENCES "sesion_mesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago" ADD CONSTRAINT "pago_comensal_id_fkey" FOREIGN KEY ("comensal_id") REFERENCES "comensal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comensal" ADD CONSTRAINT "comensal_sesion_id_fkey" FOREIGN KEY ("sesion_id") REFERENCES "sesion_mesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comensal" ADD CONSTRAINT "comensal_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_comensal" ADD CONSTRAINT "item_comensal_pedido_item_id_fkey" FOREIGN KEY ("pedido_item_id") REFERENCES "pedido_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_comensal" ADD CONSTRAINT "item_comensal_comensal_id_fkey" FOREIGN KEY ("comensal_id") REFERENCES "comensal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
