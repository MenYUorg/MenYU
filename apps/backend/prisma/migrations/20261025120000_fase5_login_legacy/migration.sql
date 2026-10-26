-- Fase 5 de docs/auth/specs/auth.md: retira el login propio. El personal entra por Supabase desde la Fase 4 y los
-- clientes desde la 4b, así que estas tablas y columnas no las lee ni las escribe nadie desde el commit anterior.
--
-- Es destructiva y no tiene vuelta atrás: antes del tag de producción se exporta `admin`, `admin_restaurante`,
-- `refresh_token` y los `password_hash` de `mozo` y `cliente` (decisión 3 de la planificación de la Fase 5).

-- ── 1. Autoría de las ediciones de pedidos ───────────────────────────────────
-- `pedido_edicion.admin_id` se retira, pero la autoría se conserva donde se pueda: si quien editó fue invitado después
-- con el mismo email, ya tiene un `usuario`. El resto queda en null y la edición se muestra sin editor, como hoy
-- aparecen las de un mozo que ya no está. El email se compara sin distinguir mayúsculas, como en toda la Fase 4.
UPDATE "pedido_edicion" pe
SET "usuario_id" = u."id"
FROM "admin" a
JOIN "usuario" u ON lower(u."email") = lower(a."email")
WHERE pe."admin_id" = a."id" AND pe."usuario_id" IS NULL;

ALTER TABLE "pedido_edicion" DROP CONSTRAINT IF EXISTS "pedido_edicion_admin_id_fkey";
ALTER TABLE "pedido_edicion" DROP COLUMN "admin_id";

-- ── 2. Las tablas del login propio ───────────────────────────────────────────
-- `admin_restaurante` primero: su clave foránea a `admin` es ON DELETE RESTRICT.
DROP TABLE "admin_restaurante";

-- Los disparadores de la última cuenta ROOT (migración 20261020150000) caen con la tabla; la función, no.
DROP TABLE "admin";
DROP FUNCTION "admin_proteger_ultimo_root"();
DROP TYPE "rol_admin";

DROP TABLE "refresh_token";

-- ── 3. Las contraseñas propias ───────────────────────────────────────────────
-- Nadie se autentica con ellas desde el commit anterior. `mozo.email` y `cliente.email` se quedan: con ellos la
-- invitación engancha al mozo que ya trabajaba ahí y la cuenta de cliente recupera su historial de mesas (Fase 4b).
ALTER TABLE "mozo" DROP COLUMN "password_hash";
ALTER TABLE "cliente" DROP COLUMN "password_hash";
