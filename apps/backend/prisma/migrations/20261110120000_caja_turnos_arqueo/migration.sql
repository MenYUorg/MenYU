-- Caja (#355): cajas, turnos, aperturas de caja por turno, movimientos, arqueo por método y asignación de mesas por
-- turno. Es el modelo de #357 a #361. Solo agrega: los pagos existentes quedan con propina 0 y sin caja
-- (turno_caja_id NULL). Todas las FKs nuevas son Restrict: el historial financiero no se borra.

-- AlterTable
ALTER TABLE "pago" ADD COLUMN     "propina" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "turno_caja_id" TEXT;

-- CreateTable
CREATE TABLE "caja" (
    "id" TEXT NOT NULL,
    "restaurante_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "turno" (
    "id" TEXT NOT NULL,
    "restaurante_id" TEXT NOT NULL,
    "abierto_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "abierto_por_usuario_id" TEXT NOT NULL,
    "cerrado_en" TIMESTAMPTZ(3),
    "cerrado_por_usuario_id" TEXT,
    "observaciones" TEXT,

    CONSTRAINT "turno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "turno_caja" (
    "id" TEXT NOT NULL,
    "turno_id" TEXT NOT NULL,
    "caja_id" TEXT NOT NULL,
    "fondo_inicial" DECIMAL(10,2) NOT NULL,
    "abierto_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerrado_en" TIMESTAMPTZ(3),

    CONSTRAINT "turno_caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimiento_caja" (
    "id" TEXT NOT NULL,
    "turno_caja_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "motivo" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimiento_caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arqueo_metodo" (
    "id" TEXT NOT NULL,
    "turno_caja_id" TEXT NOT NULL,
    "metodo" TEXT NOT NULL,
    "esperado" DECIMAL(10,2) NOT NULL,
    "declarado" DECIMAL(10,2) NOT NULL,
    "diferencia" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arqueo_metodo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asignacion_turno" (
    "id" TEXT NOT NULL,
    "turno_id" TEXT NOT NULL,
    "mesa_id" TEXT NOT NULL,
    "mozo_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asignacion_turno_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "caja_restaurante_id_nombre_key" ON "caja"("restaurante_id", "nombre");

-- CreateIndex
CREATE INDEX "turno_restaurante_id_abierto_en_idx" ON "turno"("restaurante_id", "abierto_en");

-- CreateIndex
CREATE INDEX "turno_caja_caja_id_idx" ON "turno_caja"("caja_id");

-- CreateIndex
CREATE UNIQUE INDEX "turno_caja_turno_id_caja_id_key" ON "turno_caja"("turno_id", "caja_id");

-- CreateIndex
CREATE INDEX "movimiento_caja_turno_caja_id_idx" ON "movimiento_caja"("turno_caja_id");

-- CreateIndex
CREATE UNIQUE INDEX "arqueo_metodo_turno_caja_id_metodo_key" ON "arqueo_metodo"("turno_caja_id", "metodo");

-- CreateIndex
CREATE INDEX "asignacion_turno_mozo_id_idx" ON "asignacion_turno"("mozo_id");

-- CreateIndex
CREATE UNIQUE INDEX "asignacion_turno_turno_id_mesa_id_key" ON "asignacion_turno"("turno_id", "mesa_id");

-- CreateIndex
CREATE INDEX "pago_turno_caja_id_idx" ON "pago"("turno_caja_id");

-- AddForeignKey
ALTER TABLE "pago" ADD CONSTRAINT "pago_turno_caja_id_fkey" FOREIGN KEY ("turno_caja_id") REFERENCES "turno_caja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caja" ADD CONSTRAINT "caja_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turno" ADD CONSTRAINT "turno_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turno" ADD CONSTRAINT "turno_abierto_por_usuario_id_fkey" FOREIGN KEY ("abierto_por_usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turno" ADD CONSTRAINT "turno_cerrado_por_usuario_id_fkey" FOREIGN KEY ("cerrado_por_usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turno_caja" ADD CONSTRAINT "turno_caja_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "turno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turno_caja" ADD CONSTRAINT "turno_caja_caja_id_fkey" FOREIGN KEY ("caja_id") REFERENCES "caja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_caja" ADD CONSTRAINT "movimiento_caja_turno_caja_id_fkey" FOREIGN KEY ("turno_caja_id") REFERENCES "turno_caja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_caja" ADD CONSTRAINT "movimiento_caja_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arqueo_metodo" ADD CONSTRAINT "arqueo_metodo_turno_caja_id_fkey" FOREIGN KEY ("turno_caja_id") REFERENCES "turno_caja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignacion_turno" ADD CONSTRAINT "asignacion_turno_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "turno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignacion_turno" ADD CONSTRAINT "asignacion_turno_mesa_id_fkey" FOREIGN KEY ("mesa_id") REFERENCES "mesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignacion_turno" ADD CONSTRAINT "asignacion_turno_mozo_id_fkey" FOREIGN KEY ("mozo_id") REFERENCES "mozo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ─────────────────────────────────────────────
-- A mano: Prisma no puede expresar en schema.prisma ni los índices únicos parciales ni los CHECK, y el chequeo de
-- drift no los ve (si alguien los borra, solo se entera el e2e). La lista está también en la cabecera del bloque CAJA
-- de schema.prisma.
-- ─────────────────────────────────────────────

-- Un solo turno abierto por restaurante y una sola apertura abierta por caja. Las cerradas no cuentan: se puede abrir
-- otra después de cerrar.
CREATE UNIQUE INDEX "turno_restaurante_id_abierto_key" ON "turno"("restaurante_id") WHERE "cerrado_en" IS NULL;
CREATE UNIQUE INDEX "turno_caja_caja_id_abierta_key" ON "turno_caja"("caja_id") WHERE "cerrado_en" IS NULL;

-- Valores permitidos: los mismos que TIPOS_MOVIMIENTO_CAJA y METODOS_ARQUEO de common/caja.constant.ts. Mercado Pago no
-- entra al arqueo: no pasa por la caja.
ALTER TABLE "movimiento_caja" ADD CONSTRAINT "movimiento_caja_tipo_check" CHECK ("tipo" IN ('INGRESO', 'EGRESO'));
ALTER TABLE "arqueo_metodo" ADD CONSTRAINT "arqueo_metodo_metodo_check"
  CHECK ("metodo" IN ('efectivo', 'debito', 'credito', 'transferencia'));

-- Montos.
ALTER TABLE "movimiento_caja" ADD CONSTRAINT "movimiento_caja_monto_check" CHECK ("monto" > 0);
ALTER TABLE "turno_caja" ADD CONSTRAINT "turno_caja_fondo_inicial_check" CHECK ("fondo_inicial" >= 0);
ALTER TABLE "pago" ADD CONSTRAINT "pago_propina_check" CHECK ("propina" >= 0);

-- Coherencia: un turno cerrado dice quién lo cerró (y uno abierto, nadie), y la diferencia del arqueo es siempre
-- declarado menos esperado.
ALTER TABLE "turno" ADD CONSTRAINT "turno_cierre_check"
  CHECK (("cerrado_en" IS NULL) = ("cerrado_por_usuario_id" IS NULL));
ALTER TABLE "arqueo_metodo" ADD CONSTRAINT "arqueo_metodo_diferencia_check"
  CHECK ("diferencia" = "declarado" - "esperado");
