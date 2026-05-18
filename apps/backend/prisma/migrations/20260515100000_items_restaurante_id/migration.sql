-- Paso 1: agregar columna restaurante_id (nullable para compatibilidad con filas existentes)
ALTER TABLE "item_menu"
  ADD COLUMN "restaurante_id" TEXT
  REFERENCES "restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Paso 2: eliminar columna marca_id (la FK se elimina automáticamente en PostgreSQL)
ALTER TABLE "item_menu"
  DROP COLUMN "marca_id";

-- Paso 3: eliminar tabla item_sucursal (sin datos de aplicación, sólo definición de esquema)
DROP TABLE IF EXISTS "item_sucursal";
