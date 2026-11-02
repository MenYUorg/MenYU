-- Asistente de mesa (docs/asistente/specs/asistente.md, Fase 1). Solo agrega: los enums, los datos del plato para el
-- asistente en `item_menu` y tres tablas nuevas. No toca datos existentes: las columnas nuevas de `item_menu` quedan en
-- null y `etiquetas_dietarias` en un array vacío (sin etiquetas declaradas). Un restaurante sin fila en
-- `informacion_local` tiene el asistente apagado.

-- CreateEnum
CREATE TYPE "tamanio_porcion" AS ENUM ('INDIVIDUAL', 'PARA_COMPARTIR', 'PARA_N_PERSONAS');

-- CreateEnum
CREATE TYPE "temperatura" AS ENUM ('CALIENTE', 'FRIO', 'AMBIENTE');

-- CreateEnum
CREATE TYPE "nivel_picante" AS ENUM ('NADA', 'SUAVE', 'MEDIO', 'ALTO');

-- CreateEnum
CREATE TYPE "etiqueta_dietaria" AS ENUM ('VEGETARIANO', 'VEGANO', 'SIN_TACC', 'SIN_LACTOSA');

-- AlterTable
ALTER TABLE "item_menu" ADD COLUMN     "acompanamiento" TEXT,
ADD COLUMN     "etiquetas_dietarias" "etiqueta_dietaria"[] DEFAULT ARRAY[]::"etiqueta_dietaria"[],
ADD COLUMN     "info_adicional" TEXT,
ADD COLUMN     "nivel_picante" "nivel_picante",
ADD COLUMN     "porcion_detalle" TEXT,
ADD COLUMN     "porcion_personas" INTEGER,
ADD COLUMN     "tamanio_porcion" "tamanio_porcion",
ADD COLUMN     "temperatura" "temperatura",
ADD COLUMN     "tiempo_preparacion_min" INTEGER;

-- CreateTable
CREATE TABLE "informacion_local" (
    "id" TEXT NOT NULL,
    "restaurante_id" TEXT NOT NULL,
    "asistente_habilitado" BOOLEAN NOT NULL DEFAULT false,
    "horarios" TEXT,
    "formas_pago" TEXT,
    "wifi" BOOLEAN,
    "pet_friendly" BOOLEAN,
    "accesible_silla_ruedas" BOOLEAN,
    "opciones_para_chicos" BOOLEAN,
    "estacionamiento" BOOLEAN,

    CONSTRAINT "informacion_local_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pregunta_frecuente" (
    "id" TEXT NOT NULL,
    "restaurante_id" TEXT NOT NULL,
    "pregunta" TEXT NOT NULL,
    "respuesta" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pregunta_frecuente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registro_asistente" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restaurante_id" TEXT NOT NULL,
    "sesion_mesa_id" TEXT,
    "pregunta" TEXT NOT NULL,
    "respuesta" TEXT,
    "modelo" TEXT NOT NULL,
    "tokens_entrada" INTEGER,
    "tokens_salida" INTEGER,
    "duracion_ms" INTEGER,

    CONSTRAINT "registro_asistente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "informacion_local_restaurante_id_key" ON "informacion_local"("restaurante_id");

-- CreateIndex
CREATE INDEX "pregunta_frecuente_restaurante_id_created_at_idx" ON "pregunta_frecuente"("restaurante_id", "created_at");

-- CreateIndex
CREATE INDEX "registro_asistente_restaurante_id_created_at_idx" ON "registro_asistente"("restaurante_id", "created_at");

-- CreateIndex
CREATE INDEX "registro_asistente_sesion_mesa_id_idx" ON "registro_asistente"("sesion_mesa_id");

-- CreateIndex
CREATE INDEX "registro_asistente_created_at_idx" ON "registro_asistente"("created_at");

-- AddForeignKey
ALTER TABLE "informacion_local" ADD CONSTRAINT "informacion_local_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pregunta_frecuente" ADD CONSTRAINT "pregunta_frecuente_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro_asistente" ADD CONSTRAINT "registro_asistente_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro_asistente" ADD CONSTRAINT "registro_asistente_sesion_mesa_id_fkey" FOREIGN KEY ("sesion_mesa_id") REFERENCES "sesion_mesa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
