-- CreateEnum
CREATE TYPE "rol" AS ENUM ('OWNER', 'GERENTE', 'JEFE_SALON', 'MOZO', 'COCINA');

-- AlterTable
ALTER TABLE "cliente" ADD COLUMN     "supabase_user_id" UUID;

-- AlterTable
ALTER TABLE "mozo" ADD COLUMN     "usuario_id" TEXT;

-- CreateTable
CREATE TABLE "usuario" (
    "id" TEXT NOT NULL,
    "supabase_user_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "es_root" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membresia" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "rol" "rol" NOT NULL,
    "marca_id" TEXT,
    "restaurante_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membresia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_supabase_user_id_key" ON "usuario"("supabase_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_email_key" ON "usuario"("email");

-- CreateIndex
CREATE INDEX "membresia_restaurante_id_idx" ON "membresia"("restaurante_id");

-- CreateIndex
CREATE INDEX "membresia_marca_id_idx" ON "membresia"("marca_id");

-- CreateIndex
CREATE UNIQUE INDEX "membresia_usuario_id_restaurante_id_key" ON "membresia"("usuario_id", "restaurante_id");

-- CreateIndex
CREATE UNIQUE INDEX "membresia_usuario_id_marca_id_key" ON "membresia"("usuario_id", "marca_id");

-- CreateIndex
CREATE UNIQUE INDEX "cliente_supabase_user_id_key" ON "cliente"("supabase_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "mozo_usuario_id_restaurante_id_key" ON "mozo"("usuario_id", "restaurante_id");

-- AddForeignKey
ALTER TABLE "mozo" ADD CONSTRAINT "mozo_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresia" ADD CONSTRAINT "membresia_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresia" ADD CONSTRAINT "membresia_marca_id_fkey" FOREIGN KEY ("marca_id") REFERENCES "marca"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresia" ADD CONSTRAINT "membresia_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurante"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- OWNER se asocia a una marca; GERENTE, JEFE_SALON, MOZO y COCINA, a un restaurante. Prisma no puede
-- expresar este CHECK en schema.prisma, por eso va a mano.
ALTER TABLE "membresia" ADD CONSTRAINT "membresia_ambito_check" CHECK (
  ("rol" = 'OWNER' AND "marca_id" IS NOT NULL AND "restaurante_id" IS NULL)
  OR ("rol" <> 'OWNER' AND "restaurante_id" IS NOT NULL AND "marca_id" IS NULL)
);

-- Estas tablas deciden los permisos. RLS sin políticas: la Data API de Supabase (roles anon y
-- authenticated) no las puede leer ni escribir. El backend se conecta como dueño de las tablas,
-- que no está sujeto a RLS.
ALTER TABLE "usuario" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "membresia" ENABLE ROW LEVEL SECURITY;
