-- DropForeignKey
ALTER TABLE "sesion_mesa" DROP CONSTRAINT "sesion_mesa_cliente_id_fkey";

-- AlterTable
ALTER TABLE "pedido" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "sesion_mesa" ALTER COLUMN "cliente_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "sesion_mesa" ADD CONSTRAINT "sesion_mesa_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
