-- AlterTable
ALTER TABLE "item_menu" ADD COLUMN     "precio_descuento" INTEGER;

-- Un descuento es un precio entero, mayor a 0 y menor al precio base. El porcentaje no se guarda:
-- se calcula al leer. Prisma no puede expresar este CHECK en schema.prisma, por eso va a mano.
ALTER TABLE "item_menu" ADD CONSTRAINT "item_menu_precio_descuento_check"
  CHECK ("precio_descuento" IS NULL OR ("precio_descuento" > 0 AND "precio_descuento" < "precio_base"));
