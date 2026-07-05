ALTER TABLE item_menu
  ADD COLUMN IF NOT EXISTS recomendado_en TIMESTAMP(3) NULL;

ALTER TABLE restaurante
  ADD COLUMN IF NOT EXISTS nombre_seccion_recomendados TEXT NOT NULL DEFAULT 'Recomendaciones del chef';
