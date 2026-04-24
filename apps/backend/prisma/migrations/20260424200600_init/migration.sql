-- CreateTable
CREATE TABLE "marca" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurante" (
    "id" TEXT NOT NULL,
    "marca_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT,
    "qr_base_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "restaurante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin" (
    "id" TEXT NOT NULL,
    "restaurante_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "rol" TEXT NOT NULL,

    CONSTRAINT "admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mozo" (
    "id" TEXT NOT NULL,
    "restaurante_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT,
    "telefono" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "es_jefe_salon" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mozo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mesa" (
    "id" TEXT NOT NULL,
    "restaurante_id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "qr_token" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'libre',

    CONSTRAINT "mesa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cliente" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT,
    "telefono" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sesion_mesa" (
    "id" TEXT NOT NULL,
    "mesa_id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "iniciada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerrada_en" TIMESTAMP(3),
    "estado" TEXT NOT NULL DEFAULT 'activa',

    CONSTRAINT "sesion_mesa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asignacion_mesa" (
    "id" TEXT NOT NULL,
    "mesa_id" TEXT NOT NULL,
    "mozo_id" TEXT NOT NULL,
    "sesion_id" TEXT NOT NULL,
    "origen" TEXT NOT NULL,
    "asignado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "liberado_en" TIMESTAMP(3),

    CONSTRAINT "asignacion_mesa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llamado_mozo" (
    "id" TEXT NOT NULL,
    "sesion_id" TEXT NOT NULL,
    "mozo_id" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llamado_mozo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comanda" (
    "id" TEXT NOT NULL,
    "restaurante_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "comanda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categoria_menu" (
    "id" TEXT NOT NULL,
    "restaurante_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "categoria_menu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subcategoria_menu" (
    "id" TEXT NOT NULL,
    "categoria_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "subcategoria_menu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_menu" (
    "id" TEXT NOT NULL,
    "marca_id" TEXT NOT NULL,
    "subcategoria_id" TEXT,
    "comanda_id" TEXT,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "precio_base" DECIMAL(10,2) NOT NULL,
    "disponible" BOOLEAN NOT NULL DEFAULT true,
    "imagen_url" TEXT,

    CONSTRAINT "item_menu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_sucursal" (
    "item_id" TEXT NOT NULL,
    "restaurante_id" TEXT NOT NULL,
    "disponible" BOOLEAN NOT NULL DEFAULT true,
    "precio_override" DECIMAL(10,2),

    CONSTRAINT "item_sucursal_pkey" PRIMARY KEY ("item_id","restaurante_id")
);

-- CreateTable
CREATE TABLE "menu" (
    "id" TEXT NOT NULL,
    "restaurante_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "dias" TEXT,
    "hora_inicio" TEXT,
    "hora_fin" TEXT,
    "temporada" TEXT,

    CONSTRAINT "menu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_item" (
    "menu_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,

    CONSTRAINT "menu_item_pkey" PRIMARY KEY ("menu_id","item_id")
);

-- CreateTable
CREATE TABLE "clasificacion_dieta" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "clasificacion_dieta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_clasificacion" (
    "item_id" TEXT NOT NULL,
    "clasificacion_id" TEXT NOT NULL,

    CONSTRAINT "item_clasificacion_pkey" PRIMARY KEY ("item_id","clasificacion_id")
);

-- CreateTable
CREATE TABLE "ingrediente" (
    "id" TEXT NOT NULL,
    "restaurante_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "ingrediente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_ingrediente" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "ingrediente_id" TEXT NOT NULL,
    "es_original" BOOLEAN NOT NULL,
    "cantidad" DECIMAL(10,3) NOT NULL,
    "removible" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "item_ingrediente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedido" (
    "id" TEXT NOT NULL,
    "sesion_id" TEXT NOT NULL,
    "mesa_id" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedido_item" (
    "id" TEXT NOT NULL,
    "pedido_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio_unitario" DECIMAL(10,2) NOT NULL,
    "notas" TEXT,

    CONSTRAINT "pedido_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedido_item_mod" (
    "pedido_item_id" TEXT NOT NULL,
    "item_ingrediente_id" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "cantidad" DECIMAL(10,3) NOT NULL,

    CONSTRAINT "pedido_item_mod_pkey" PRIMARY KEY ("pedido_item_id","item_ingrediente_id")
);

-- CreateTable
CREATE TABLE "pago" (
    "id" TEXT NOT NULL,
    "pedido_id" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "metodo" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "referencia_externa" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pago_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "marca_slug_key" ON "marca"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "admin_email_key" ON "admin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "mesa_qr_token_key" ON "mesa"("qr_token");

-- CreateIndex
CREATE UNIQUE INDEX "cliente_email_key" ON "cliente"("email");

-- CreateIndex
CREATE UNIQUE INDEX "clasificacion_dieta_nombre_key" ON "clasificacion_dieta"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "pago_pedido_id_key" ON "pago"("pedido_id");

-- AddForeignKey
ALTER TABLE "restaurante" ADD CONSTRAINT "restaurante_marca_id_fkey" FOREIGN KEY ("marca_id") REFERENCES "marca"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin" ADD CONSTRAINT "admin_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mozo" ADD CONSTRAINT "mozo_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mesa" ADD CONSTRAINT "mesa_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesion_mesa" ADD CONSTRAINT "sesion_mesa_mesa_id_fkey" FOREIGN KEY ("mesa_id") REFERENCES "mesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesion_mesa" ADD CONSTRAINT "sesion_mesa_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignacion_mesa" ADD CONSTRAINT "asignacion_mesa_mesa_id_fkey" FOREIGN KEY ("mesa_id") REFERENCES "mesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignacion_mesa" ADD CONSTRAINT "asignacion_mesa_mozo_id_fkey" FOREIGN KEY ("mozo_id") REFERENCES "mozo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignacion_mesa" ADD CONSTRAINT "asignacion_mesa_sesion_id_fkey" FOREIGN KEY ("sesion_id") REFERENCES "sesion_mesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llamado_mozo" ADD CONSTRAINT "llamado_mozo_sesion_id_fkey" FOREIGN KEY ("sesion_id") REFERENCES "sesion_mesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llamado_mozo" ADD CONSTRAINT "llamado_mozo_mozo_id_fkey" FOREIGN KEY ("mozo_id") REFERENCES "mozo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comanda" ADD CONSTRAINT "comanda_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categoria_menu" ADD CONSTRAINT "categoria_menu_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcategoria_menu" ADD CONSTRAINT "subcategoria_menu_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria_menu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_menu" ADD CONSTRAINT "item_menu_marca_id_fkey" FOREIGN KEY ("marca_id") REFERENCES "marca"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_menu" ADD CONSTRAINT "item_menu_subcategoria_id_fkey" FOREIGN KEY ("subcategoria_id") REFERENCES "subcategoria_menu"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_menu" ADD CONSTRAINT "item_menu_comanda_id_fkey" FOREIGN KEY ("comanda_id") REFERENCES "comanda"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_sucursal" ADD CONSTRAINT "item_sucursal_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item_menu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_sucursal" ADD CONSTRAINT "item_sucursal_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu" ADD CONSTRAINT "menu_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item" ADD CONSTRAINT "menu_item_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "menu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item" ADD CONSTRAINT "menu_item_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item_menu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_clasificacion" ADD CONSTRAINT "item_clasificacion_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item_menu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_clasificacion" ADD CONSTRAINT "item_clasificacion_clasificacion_id_fkey" FOREIGN KEY ("clasificacion_id") REFERENCES "clasificacion_dieta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingrediente" ADD CONSTRAINT "ingrediente_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_ingrediente" ADD CONSTRAINT "item_ingrediente_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item_menu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_ingrediente" ADD CONSTRAINT "item_ingrediente_ingrediente_id_fkey" FOREIGN KEY ("ingrediente_id") REFERENCES "ingrediente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_sesion_id_fkey" FOREIGN KEY ("sesion_id") REFERENCES "sesion_mesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_mesa_id_fkey" FOREIGN KEY ("mesa_id") REFERENCES "mesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_item" ADD CONSTRAINT "pedido_item_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_item" ADD CONSTRAINT "pedido_item_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item_menu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_item_mod" ADD CONSTRAINT "pedido_item_mod_pedido_item_id_fkey" FOREIGN KEY ("pedido_item_id") REFERENCES "pedido_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_item_mod" ADD CONSTRAINT "pedido_item_mod_item_ingrediente_id_fkey" FOREIGN KEY ("item_ingrediente_id") REFERENCES "item_ingrediente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago" ADD CONSTRAINT "pago_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
