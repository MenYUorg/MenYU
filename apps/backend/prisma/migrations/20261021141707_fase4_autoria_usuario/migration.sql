-- Fase 4 de auth, entrega 4.2 (docs/auth/specs/auth.md): la autoría pasa a `usuario` y la última cuenta ROOT de `usuario` queda
-- protegida como la de `admin`. Una sola migración; Postgres la corre como una sola transacción.

-- ── Autoría ──────────────────────────────────────────────────────────────────
-- Quién editó un pedido o registró un cobro con su cuenta de Supabase. Reemplazan a pedido_edicion.admin_id (se va en la Fase 5,
-- con la tabla admin) y a la idea de pago.admin_id de la rama #356. SET NULL: retirar una cuenta no borra ediciones ni pagos.
ALTER TABLE "pago" ADD COLUMN     "usuario_id" TEXT;

ALTER TABLE "pedido_edicion" ADD COLUMN     "usuario_id" TEXT;

ALTER TABLE "pedido_edicion" ADD CONSTRAINT "pedido_edicion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pago" ADD CONSTRAINT "pago_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── La última cuenta ROOT no se puede quitar ─────────────────────────────────
-- Como admin_proteger_ultimo_root (20261020150000), sobre `usuario`: ni borrándola, ni sacándole es_root, ni desactivándola (una
-- cuenta inactiva no entra: SupabaseAuthGuard da 403). Bloquea las otras cuentas ROOT activas mientras decide: dos bajas
-- simultáneas de las dos últimas no pueden dejar la base sin ROOT. Solo se dispara al quitar una cuenta ROOT activa, así que una
-- base sin ninguna (producción, hasta crear la primera) no se traba.
CREATE FUNCTION "usuario_proteger_ultimo_root"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM "usuario" WHERE "es_root" AND "activo" AND "id" <> OLD."id" FOR UPDATE;
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

CREATE TRIGGER "usuario_ultimo_root_sin_delete"
  BEFORE DELETE ON "usuario"
  FOR EACH ROW WHEN (OLD."es_root" AND OLD."activo")
  EXECUTE FUNCTION "usuario_proteger_ultimo_root"();

CREATE TRIGGER "usuario_ultimo_root_sin_quitar"
  BEFORE UPDATE OF "es_root", "activo" ON "usuario"
  FOR EACH ROW WHEN (OLD."es_root" AND OLD."activo" AND NOT (NEW."es_root" AND NEW."activo"))
  EXECUTE FUNCTION "usuario_proteger_ultimo_root"();
