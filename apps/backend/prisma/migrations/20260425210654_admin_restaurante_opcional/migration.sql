-- DropForeignKey
ALTER TABLE "admin" DROP CONSTRAINT "admin_restaurante_id_fkey";

-- AlterTable
ALTER TABLE "admin" ALTER COLUMN "restaurante_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "admin" ADD CONSTRAINT "admin_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurante"("id") ON DELETE SET NULL ON UPDATE CASCADE;
