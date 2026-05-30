-- Baseline migration: captures tables and columns added via prisma db push
-- that were not tracked in previous migration files.
-- Applied to DB via: prisma db push (2026-05-28)

-- 1. pedido.updated_at
ALTER TABLE "pedido" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 2. llamado_mozo.motivo
ALTER TABLE "llamado_mozo" ADD COLUMN IF NOT EXISTS "motivo" TEXT DEFAULT 'general';

-- 3. pedido_item.cantidad_editada
ALTER TABLE "pedido_item" ADD COLUMN IF NOT EXISTS "cantidad_editada" INTEGER;

-- 4. pedido_edicion table
CREATE TABLE IF NOT EXISTS "pedido_edicion" (
    "id" TEXT NOT NULL,
    "pedido_id" TEXT NOT NULL,
    "admin_id" TEXT,
    "mozo_id" TEXT,
    "justificacion" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pedido_edicion_pkey" PRIMARY KEY ("id")
);

-- 5. pedido_edicion foreign keys
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pedido_edicion_pedido_id_fkey') THEN
    ALTER TABLE "pedido_edicion" ADD CONSTRAINT "pedido_edicion_pedido_id_fkey"
      FOREIGN KEY ("pedido_id") REFERENCES "pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pedido_edicion_admin_id_fkey') THEN
    ALTER TABLE "pedido_edicion" ADD CONSTRAINT "pedido_edicion_admin_id_fkey"
      FOREIGN KEY ("admin_id") REFERENCES "admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pedido_edicion_mozo_id_fkey') THEN
    ALTER TABLE "pedido_edicion" ADD CONSTRAINT "pedido_edicion_mozo_id_fkey"
      FOREIGN KEY ("mozo_id") REFERENCES "mozo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 6. pedido_edicion_item table
CREATE TABLE IF NOT EXISTS "pedido_edicion_item" (
    "id" TEXT NOT NULL,
    "edicion_id" TEXT NOT NULL,
    "pedido_item_id" TEXT NOT NULL,
    "item_nombre" TEXT NOT NULL,
    "cantidad_antes" INTEGER NOT NULL,
    "cantidad_despues" INTEGER NOT NULL,
    "precio_unitario" DECIMAL(10,2) NOT NULL,
    CONSTRAINT "pedido_edicion_item_pkey" PRIMARY KEY ("id")
);

-- 7. pedido_edicion_item foreign key
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pedido_edicion_item_edicion_id_fkey') THEN
    ALTER TABLE "pedido_edicion_item" ADD CONSTRAINT "pedido_edicion_item_edicion_id_fkey"
      FOREIGN KEY ("edicion_id") REFERENCES "pedido_edicion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
