-- 1. admin: reemplazar restaurante_id → marca_id
ALTER TABLE "admin" DROP CONSTRAINT "admin_restaurante_id_fkey";
ALTER TABLE "admin" RENAME COLUMN "restaurante_id" TO "marca_id";
ALTER TABLE "admin" ADD CONSTRAINT "admin_marca_id_fkey"
  FOREIGN KEY ("marca_id") REFERENCES "marca"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. item_ingrediente: renombrar removible → es_removible
ALTER TABLE "item_ingrediente" RENAME COLUMN "removible" TO "es_removible";

-- 3. item_ingrediente: columnas faltantes
ALTER TABLE "item_ingrediente"
  ADD COLUMN "es_agregable"  BOOLEAN        NOT NULL DEFAULT false,
  ADD COLUMN "precio_extra"  DECIMAL(10,2)  NOT NULL DEFAULT 0,
  ADD COLUMN "cantidad_min"  INTEGER        NOT NULL DEFAULT 0,
  ADD COLUMN "cantidad_max"  INTEGER        NOT NULL DEFAULT 1;

-- 4. item_ingrediente: índice único
CREATE UNIQUE INDEX "item_ingrediente_item_id_ingrediente_id_key"
  ON "item_ingrediente"("item_id", "ingrediente_id");

-- 5. ingrediente: columna faltante
ALTER TABLE "ingrediente"
  ADD COLUMN "es_alergeno" BOOLEAN NOT NULL DEFAULT false;
