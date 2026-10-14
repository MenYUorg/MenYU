-- AlterTable
ALTER TABLE "pago" ADD COLUMN     "admin_id" TEXT;

-- AddForeignKey
ALTER TABLE "pago" ADD CONSTRAINT "pago_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

