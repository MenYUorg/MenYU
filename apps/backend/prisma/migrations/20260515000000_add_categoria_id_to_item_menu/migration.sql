ALTER TABLE "item_menu"
  ADD COLUMN "categoria_id" TEXT,
  ADD CONSTRAINT "item_menu_categoria_id_fkey"
    FOREIGN KEY ("categoria_id") REFERENCES "categoria_menu"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
