CREATE TABLE IF NOT EXISTS pedido_edicion (
  id            TEXT        NOT NULL PRIMARY KEY,
  pedido_id     TEXT        NOT NULL REFERENCES pedido(id),
  admin_id      TEXT        REFERENCES admin(id),
  mozo_id       TEXT        REFERENCES mozo(id),
  justificacion TEXT        NOT NULL,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pedido_edicion_item (
  id             TEXT    NOT NULL PRIMARY KEY,
  edicion_id     TEXT    NOT NULL REFERENCES pedido_edicion(id),
  pedido_item_id TEXT    NOT NULL REFERENCES pedido_item(id),
  cantidad_antes INTEGER NOT NULL,
  precio_antes   NUMERIC(10,2) NOT NULL
);
