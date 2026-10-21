-- Consola de ROOT, etapa 1a (docs/plan-consola-root.md): historial de acciones de ROOT, contraseña temporal y protección de
-- la última cuenta ROOT. Una sola migración; Postgres la corre como una sola transacción, así que se aplica entera o no se aplica.

-- ── Contraseña temporal ──────────────────────────────────────────────────────
-- La pone otra persona (ROOT) y hay que cambiarla en el primer ingreso. Sin efecto en las cuentas que ya existen.
ALTER TABLE "admin" ADD COLUMN "debe_cambiar_password" BOOLEAN NOT NULL DEFAULT false;

-- ── Historial de acciones de ROOT ────────────────────────────────────────────
-- Sin claves foráneas, a propósito: guarda copias (email, nombre) de quién y sobre qué, así que retirar una cuenta, una marca o
-- un restaurante no toca el historial. Nunca guarda una contraseña ni un hash (lo cuida el código y lo prueban los tests).
CREATE TABLE "historial_root" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    "actor_tipo" TEXT NOT NULL,
    "actor_id" TEXT,
    "actor_nombre" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "entidad_tipo" TEXT NOT NULL,
    "entidad_id" TEXT NOT NULL,
    "entidad_nombre" TEXT NOT NULL,
    "marca_id" TEXT,
    "marca_nombre" TEXT,
    "detalle" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "historial_root_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "historial_root_actor_tipo_check" CHECK ("actor_tipo" IN ('ROOT', 'SCRIPT')),
    -- Una acción hecha desde la consola tiene que decir qué cuenta ROOT la hizo; la del script, no.
    CONSTRAINT "historial_root_actor_id_check" CHECK ("actor_tipo" <> 'ROOT' OR "actor_id" IS NOT NULL),
    CONSTRAINT "historial_root_entidad_tipo_check" CHECK ("entidad_tipo" IN ('MARCA', 'RESTAURANTE', 'OWNER', 'ROOT'))
);

CREATE INDEX "historial_root_created_at_idx" ON "historial_root"("created_at");
CREATE INDEX "historial_root_entidad_tipo_entidad_id_idx" ON "historial_root"("entidad_tipo", "entidad_id");

-- Solo se agrega: nadie puede modificar ni borrar el historial, tampoco la propia app ni quien tenga acceso a la base mientras no
-- quite estos disparadores (lo puede hacer el dueño de la tabla: ver el "límite" en docs/plan-consola-root.md, 7.2).
CREATE FUNCTION "historial_root_proteger"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'historial_root es de solo agregar: no admite %', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER "historial_root_sin_update_ni_delete"
  BEFORE UPDATE OR DELETE ON "historial_root"
  FOR EACH ROW EXECUTE FUNCTION "historial_root_proteger"();

CREATE TRIGGER "historial_root_sin_truncate"
  BEFORE TRUNCATE ON "historial_root"
  FOR EACH STATEMENT EXECUTE FUNCTION "historial_root_proteger"();

-- La hora la pone la base, no la app: se pisa lo que mande el cliente (Prisma manda la hora de su servidor en el INSERT).
CREATE FUNCTION "historial_root_hora_de_la_base"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW."created_at" := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER "historial_root_hora"
  BEFORE INSERT ON "historial_root"
  FOR EACH ROW EXECUTE FUNCTION "historial_root_hora_de_la_base"();

-- ALWAYS: que valgan también con session_replication_role = replica, que es lo que se usa para limpiar cuentas en las pruebas.
ALTER TABLE "historial_root" ENABLE ALWAYS TRIGGER "historial_root_sin_update_ni_delete";
ALTER TABLE "historial_root" ENABLE ALWAYS TRIGGER "historial_root_sin_truncate";
ALTER TABLE "historial_root" ENABLE ALWAYS TRIGGER "historial_root_hora";

-- ── La última cuenta ROOT no se puede quitar ─────────────────────────────────
-- Ni borrándola ni cambiándole el rol. Bloquea las otras cuentas ROOT mientras decide: dos bajas simultáneas de las dos últimas
-- no pueden dejar la base sin ROOT (la segunda espera a la primera y ya no encuentra a la otra).
CREATE FUNCTION "admin_proteger_ultimo_root"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM "admin" WHERE "rol" = 'ROOT' AND "id" <> OLD."id" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se puede quitar la última cuenta ROOT'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "admin_ultimo_root_sin_delete"
  BEFORE DELETE ON "admin"
  FOR EACH ROW WHEN (OLD."rol" = 'ROOT')
  EXECUTE FUNCTION "admin_proteger_ultimo_root"();

CREATE TRIGGER "admin_ultimo_root_sin_cambio_de_rol"
  BEFORE UPDATE OF "rol" ON "admin"
  FOR EACH ROW WHEN (OLD."rol" = 'ROOT' AND NEW."rol" <> 'ROOT')
  EXECUTE FUNCTION "admin_proteger_ultimo_root"();
