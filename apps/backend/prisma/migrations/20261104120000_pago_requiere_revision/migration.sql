-- Pagos que hay que mirar a mano (PR B de la deuda de pagos): el webhook de Mercado Pago los marca cuando MP aprueba un
-- pago ya cancelado o uno de una sesión ya cerrada. Solo agrega: los pagos existentes quedan sin marcar.

-- AlterTable
ALTER TABLE "pago" ADD COLUMN     "motivo_revision" TEXT,
ADD COLUMN     "requiere_revision" BOOLEAN NOT NULL DEFAULT false;
