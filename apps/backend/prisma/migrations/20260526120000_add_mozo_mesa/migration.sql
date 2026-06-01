CREATE TABLE "mozo_mesa" (
    "id"        TEXT NOT NULL,
    "mesa_id"   TEXT NOT NULL,
    "mozo_id"   TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mozo_mesa_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "mozo_mesa" ADD CONSTRAINT "mozo_mesa_mesa_id_fkey"
    FOREIGN KEY ("mesa_id") REFERENCES "mesa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mozo_mesa" ADD CONSTRAINT "mozo_mesa_mozo_id_fkey"
    FOREIGN KEY ("mozo_id") REFERENCES "mozo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "mozo_mesa_mesa_id_mozo_id_key" ON "mozo_mesa"("mesa_id", "mozo_id");
