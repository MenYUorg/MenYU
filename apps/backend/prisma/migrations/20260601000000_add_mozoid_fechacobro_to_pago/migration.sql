-- Add mozoId and fechaCobro to pago table
ALTER TABLE "pago" ADD COLUMN "mozo_id" TEXT;
ALTER TABLE "pago" ADD COLUMN "fecha_cobro" TIMESTAMPTZ;
ALTER TABLE "pago" ADD CONSTRAINT "pago_mozo_id_fkey"
  FOREIGN KEY ("mozo_id") REFERENCES "mozo"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
