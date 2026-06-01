ALTER TABLE pedido_edicion_item DROP CONSTRAINT IF EXISTS pedido_edicion_item_pedido_item_id_fkey;
ALTER TABLE pedido_edicion_item ADD COLUMN IF NOT EXISTS item_nombre TEXT NOT NULL DEFAULT '';
