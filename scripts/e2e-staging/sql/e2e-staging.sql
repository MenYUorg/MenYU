-- E2E contra staging: el usuario de base `e2e_staging` y las funciones `e2e.e2e_preparar` y `e2e.e2e_limpiar`.
-- Diseño: docs/calidad/e2e-supabase.md (secciones 2.2, 2.4 y 4).
--
-- SOLO EN EL SQL EDITOR DEL SUPABASE DE STAGING. Nunca en producción ni como migración de Prisma: no es parte del
-- esquema de la app, es una herramienta de prueba de un solo ambiente.
--
-- Corre entero en una transacción: si algo falla (por ejemplo, el rol ya existe), no queda nada a medias.
-- La contraseña del rol NO está acá: se pone aparte, con el ALTER ROLE del final (sección 5).
--
-- Qué toca, en una línea: crea un rol nuevo, un schema nuevo `e2e` con dos funciones, y le da al rol SELECT sobre 7
-- tablas (en `cliente`, solo 3 columnas) y EXECUTE sobre esas dos funciones. No cambia ninguna tabla ni ningún dato.

BEGIN;

-- ── 1. El rol ────────────────────────────────────────────────────────────────────────────────────────────────────
-- Puede conectarse y nada más: no es superusuario, no crea bases ni roles, no replica, no se saltea RLS y no hereda
-- permisos de otros roles. Máximo 3 conexiones a la vez y 15 s por consulta.
CREATE ROLE e2e_staging WITH
  LOGIN
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
  CONNECTION LIMIT 3;

ALTER ROLE e2e_staging SET statement_timeout = '15s';

-- ── 2. El schema de las funciones ────────────────────────────────────────────────────────────────────────────────
-- Las funciones van en `e2e` y no en `public`: Supabase da EXECUTE por defecto a `anon` y `authenticated` sobre lo
-- que se crea en `public`, y las expondría por la Data API. En `e2e` nadie tiene permisos salvo los que se dan abajo.
CREATE SCHEMA e2e;
REVOKE ALL ON SCHEMA e2e FROM PUBLIC;

-- ── 3. e2e.e2e_preparar(marcador, restaurante_id) ────────────────────────────────────────────────────────────────
-- Crea UNA mesa en el restaurante de prueba y devuelve su id (id_mesa) y su QR (qr). No crea nada más.
-- La mesa queda marcada con el marcador de la corrida en `qr_token` (marcador || 'mesa') y en `numero`.
CREATE FUNCTION e2e.e2e_preparar(p_marcador text, p_restaurante_id text)
RETURNS TABLE (id_mesa text, qr text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_qr     text;
  v_modo   text;
  v_pin    text;
  v_mesa   text;
  v_intento int := 0;
BEGIN
  -- El marcador es el de una corrida: e2e-<run_id>-<intento>- (GitHub Actions) o e2e-local-<8 hex>- (a mano).
  IF p_marcador IS NULL OR p_marcador !~ '^e2e-([0-9]{1,20}-[0-9]{1,3}|local-[0-9a-f]{8})-$' THEN
    RAISE EXCEPTION 'e2e_preparar: marcador inválido';
  END IF;

  -- Solo el restaurante de prueba: activo y de una marca activa cuyo slug empieza con e2e-staging-.
  SELECT r.modo_sesion INTO v_modo
  FROM public.restaurante r
  JOIN public.marca m ON m.id = r.marca_id
  WHERE r.id = p_restaurante_id
    AND r.activo AND m.activo
    AND m.slug LIKE 'e2e-staging-%';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'e2e_preparar: el restaurante no es el de prueba (marca e2e-staging-*) o está dado de baja';
  END IF;
  -- En modo seguro POST /sessions/open pide el código de sesión y el E2E entra solo por QR.
  IF v_modo <> 'abierto' THEN
    RAISE EXCEPTION 'e2e_preparar: el restaurante de prueba tiene que estar en modo de sesión abierto';
  END IF;

  v_qr := p_marcador || 'mesa';
  IF EXISTS (SELECT 1 FROM public.mesa me WHERE me.qr_token = v_qr) THEN
    RAISE EXCEPTION 'e2e_preparar: ya hay una mesa con este marcador';
  END IF;

  -- El PIN es obligatorio y único por restaurante (mesa_restaurante_id_pin_key). El E2E no lo usa: entra por QR.
  LOOP
    v_intento := v_intento + 1;
    v_pin := lpad((floor(random() * 9999) + 1)::int::text, 4, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.mesa me WHERE me.restaurante_id = p_restaurante_id AND me.pin = v_pin
    );
    IF v_intento >= 50 THEN
      RAISE EXCEPTION 'e2e_preparar: no hay un PIN libre en el restaurante de prueba';
    END IF;
  END LOOP;

  v_mesa := gen_random_uuid()::text;
  INSERT INTO public.mesa (id, restaurante_id, numero, qr_token, pin, estado, activo)
  VALUES (v_mesa, p_restaurante_id, rtrim(p_marcador, '-'), v_qr, v_pin, 'libre', true);

  RETURN QUERY SELECT v_mesa, v_qr;
END;
$$;

-- ── 4. e2e.e2e_limpiar(marcador) ─────────────────────────────────────────────────────────────────────────────────
-- Borra la mesa de ESA corrida y lo que cuelga de ella, y nada más. Devuelve cuántas filas borró de cada tabla.
--
-- Cómo elige qué borrar: busca la mesa con qr_token = marcador || 'mesa' (igualdad exacta, no LIKE) en un
-- restaurante de marca e2e-staging-*. Si no la encuentra, no borra nada y devuelve ceros. Desde esa mesa junta los
-- ids de sus sesiones, pedidos, ítems y comensales, y cada DELETE es WHERE id/clave = ANY(esos ids). No hay ningún
-- DELETE sin WHERE ni filtrado por fecha, por "lo último" o por columnas vacías.
--
-- Clientes: borra solo a los invitados de esas sesiones (sin email, sin contraseña y sin cuenta de Supabase) y solo
-- si después de la limpieza ya no aparecen en ninguna otra sesión, participante, ítem o comensal.
--
-- Al final comprueba que no quedó nada de la corrida; si quedó algo, falla y deshace TODO lo que borró.
CREATE FUNCTION e2e.e2e_limpiar(p_marcador text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_mesa       text;
  v_sesiones   text[];
  v_pedidos    text[];
  v_items      text[];
  v_comensales text[];
  v_ediciones  text[];
  v_clientes   text[];
  v_n          bigint;
  v_borradas   jsonb := '{}'::jsonb;
BEGIN
  IF p_marcador IS NULL OR p_marcador !~ '^e2e-([0-9]{1,20}-[0-9]{1,3}|local-[0-9a-f]{8})-$' THEN
    RAISE EXCEPTION 'e2e_limpiar: marcador inválido';
  END IF;

  SELECT me.id INTO v_mesa
  FROM public.mesa me
  JOIN public.restaurante r ON r.id = me.restaurante_id
  JOIN public.marca m ON m.id = r.marca_id
  WHERE me.qr_token = p_marcador || 'mesa'
    AND m.slug LIKE 'e2e-staging-%';
  IF v_mesa IS NULL THEN
    RETURN jsonb_build_object('mesa_encontrada', false, 'borradas', v_borradas);
  END IF;

  -- Los ids de la corrida, todos a partir de la mesa.
  SELECT coalesce(array_agg(s.id), '{}') INTO v_sesiones
  FROM public.sesion_mesa s WHERE s.mesa_id = v_mesa;

  SELECT coalesce(array_agg(p.id), '{}') INTO v_pedidos
  FROM public.pedido p WHERE p.mesa_id = v_mesa OR p.sesion_id = ANY (v_sesiones);

  SELECT coalesce(array_agg(pi.id), '{}') INTO v_items
  FROM public.pedido_item pi WHERE pi.pedido_id = ANY (v_pedidos);

  SELECT coalesce(array_agg(c.id), '{}') INTO v_comensales
  FROM public.comensal c WHERE c.sesion_id = ANY (v_sesiones);

  SELECT coalesce(array_agg(e.id), '{}') INTO v_ediciones
  FROM public.pedido_edicion e WHERE e.pedido_id = ANY (v_pedidos);

  -- Clientes candidatos: los que aparecen en esas sesiones, participantes, ítems o comensales.
  SELECT coalesce(array_agg(DISTINCT x.cliente_id), '{}') INTO v_clientes
  FROM (
    SELECT s.cliente_id FROM public.sesion_mesa s WHERE s.id = ANY (v_sesiones)
    UNION SELECT smc.cliente_id FROM public.sesion_mesa_cliente smc WHERE smc.sesion_id = ANY (v_sesiones)
    UNION SELECT pi.cliente_id FROM public.pedido_item pi WHERE pi.id = ANY (v_items)
    UNION SELECT c.cliente_id FROM public.comensal c WHERE c.id = ANY (v_comensales)
  ) x
  WHERE x.cliente_id IS NOT NULL;

  -- Borrado, en orden de claves foráneas (todas ON DELETE RESTRICT salvo mozo_mesa).
  DELETE FROM public.item_comensal WHERE pedido_item_id = ANY (v_items) OR comensal_id = ANY (v_comensales);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_borradas := v_borradas || jsonb_build_object('item_comensal', v_n);

  DELETE FROM public.pedido_item_mod WHERE pedido_item_id = ANY (v_items);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_borradas := v_borradas || jsonb_build_object('pedido_item_mod', v_n);

  DELETE FROM public.pedido_edicion_item WHERE edicion_id = ANY (v_ediciones);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_borradas := v_borradas || jsonb_build_object('pedido_edicion_item', v_n);

  DELETE FROM public.pedido_edicion WHERE id = ANY (v_ediciones);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_borradas := v_borradas || jsonb_build_object('pedido_edicion', v_n);

  DELETE FROM public.pedido_item WHERE id = ANY (v_items);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_borradas := v_borradas || jsonb_build_object('pedido_item', v_n);

  DELETE FROM public.pedido WHERE id = ANY (v_pedidos);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_borradas := v_borradas || jsonb_build_object('pedido', v_n);

  DELETE FROM public.pago WHERE sesion_id = ANY (v_sesiones);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_borradas := v_borradas || jsonb_build_object('pago', v_n);

  DELETE FROM public.llamado_mozo WHERE sesion_id = ANY (v_sesiones);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_borradas := v_borradas || jsonb_build_object('llamado_mozo', v_n);

  DELETE FROM public.asignacion_mesa WHERE sesion_id = ANY (v_sesiones) OR mesa_id = v_mesa;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_borradas := v_borradas || jsonb_build_object('asignacion_mesa', v_n);

  DELETE FROM public.comensal WHERE id = ANY (v_comensales);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_borradas := v_borradas || jsonb_build_object('comensal', v_n);

  DELETE FROM public.sesion_mesa_cliente WHERE sesion_id = ANY (v_sesiones);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_borradas := v_borradas || jsonb_build_object('sesion_mesa_cliente', v_n);

  DELETE FROM public.sesion_mesa WHERE id = ANY (v_sesiones);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_borradas := v_borradas || jsonb_build_object('sesion_mesa', v_n);

  DELETE FROM public.mozo_mesa WHERE mesa_id = v_mesa;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_borradas := v_borradas || jsonb_build_object('mozo_mesa', v_n);

  DELETE FROM public.cliente cl
  WHERE cl.id = ANY (v_clientes)
    AND cl.email IS NULL AND cl.password_hash IS NULL AND cl.supabase_user_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.sesion_mesa s WHERE s.cliente_id = cl.id)
    AND NOT EXISTS (SELECT 1 FROM public.sesion_mesa_cliente smc WHERE smc.cliente_id = cl.id)
    AND NOT EXISTS (SELECT 1 FROM public.pedido_item pi WHERE pi.cliente_id = cl.id)
    AND NOT EXISTS (SELECT 1 FROM public.comensal c WHERE c.cliente_id = cl.id);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_borradas := v_borradas || jsonb_build_object('cliente', v_n);

  DELETE FROM public.mesa WHERE id = v_mesa;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_borradas := v_borradas || jsonb_build_object('mesa', v_n);

  -- Comprobación final: si quedó algo de la corrida, se deshace todo (la excepción revierte la función entera).
  IF EXISTS (SELECT 1 FROM public.mesa WHERE id = v_mesa)
     OR EXISTS (SELECT 1 FROM public.sesion_mesa WHERE id = ANY (v_sesiones))
     OR EXISTS (SELECT 1 FROM public.pedido WHERE id = ANY (v_pedidos))
     OR EXISTS (SELECT 1 FROM public.pago WHERE sesion_id = ANY (v_sesiones)) THEN
    RAISE EXCEPTION 'e2e_limpiar: quedaron filas de la corrida; no se borró nada';
  END IF;

  RETURN jsonb_build_object(
    'mesa_encontrada', true,
    'clientes_candidatos', coalesce(array_length(v_clientes, 1), 0),
    'borradas', v_borradas
  );
END;
$$;

-- ── 5. Permisos ──────────────────────────────────────────────────────────────────────────────────────────────────
-- Las funciones nuevas se crean ejecutables por PUBLIC (todos los roles): se lo saco a todos, y explícitamente a los
-- roles de la Data API de Supabase, antes de dárselo solo a e2e_staging.
REVOKE ALL ON FUNCTION e2e.e2e_preparar(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION e2e.e2e_limpiar(text) FROM PUBLIC, anon, authenticated;

-- Ejecución: solo las dos funciones.
GRANT USAGE ON SCHEMA e2e TO e2e_staging;
GRANT EXECUTE ON FUNCTION e2e.e2e_preparar(text, text) TO e2e_staging;
GRANT EXECUTE ON FUNCTION e2e.e2e_limpiar(text) TO e2e_staging;

-- Lectura: las 7 tablas del diseño (docs/calidad/e2e-supabase.md:138). De `cliente`, solo id, nombre y fecha: no
-- email, teléfono, password_hash ni supabase_user_id de los clientes reales.
GRANT USAGE ON SCHEMA public TO e2e_staging;
GRANT SELECT ON
  public.mesa,
  public.sesion_mesa,
  public.sesion_mesa_cliente,
  public.pedido,
  public.pedido_item,
  public.pago
TO e2e_staging;
GRANT SELECT (id, nombre, created_at) ON public.cliente TO e2e_staging;

COMMIT;

-- ── 6. Contraseña (aparte, a mano) ───────────────────────────────────────────────────────────────────────────────
-- Correrlo en una pestaña nueva del SQL Editor, sin guardarla como snippet, con una contraseña generada:
--
--   ALTER ROLE e2e_staging WITH PASSWORD '<contraseña>';
--
-- Y esa misma contraseña va solo en el secret E2E_STAGING_DB_URL_LECTURA de GitHub.

-- ── 7. Verificación (solo lectura; correr después del COMMIT) ────────────────────────────────────────────────────
-- 7.1 Todo lo que e2e_staging puede hacer sobre tablas de public (incluye lo que le llegue por PUBLIC). Esperado:
--     6 filas con solo SELECT (mesa, sesion_mesa, sesion_mesa_cliente, pedido, pedido_item, pago). `cliente` no
--     aparece porque tiene permiso por columna (7.2).
--
--   SELECT c.relname,
--          has_table_privilege('e2e_staging', c.oid, 'SELECT') AS sel,
--          has_table_privilege('e2e_staging', c.oid, 'INSERT') AS ins,
--          has_table_privilege('e2e_staging', c.oid, 'UPDATE') AS upd,
--          has_table_privilege('e2e_staging', c.oid, 'DELETE') AS del
--   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm', 'p')
--     AND (has_table_privilege('e2e_staging', c.oid, 'SELECT') OR has_table_privilege('e2e_staging', c.oid, 'INSERT')
--       OR has_table_privilege('e2e_staging', c.oid, 'UPDATE') OR has_table_privilege('e2e_staging', c.oid, 'DELETE'))
--   ORDER BY 1;
--
-- 7.2 Columnas de cliente que puede leer. Esperado: id, nombre, created_at.
--
--   SELECT column_name FROM information_schema.column_privileges
--   WHERE grantee = 'e2e_staging' AND table_name = 'cliente' ORDER BY 1;
--
-- 7.3 Quién puede ejecutar las funciones. Esperado: e2e_staging true; anon y authenticated false.
--
--   SELECT r.rolname,
--          has_function_privilege(r.rolname, 'e2e.e2e_preparar(text, text)', 'EXECUTE') AS preparar,
--          has_function_privilege(r.rolname, 'e2e.e2e_limpiar(text)', 'EXECUTE') AS limpiar
--   FROM pg_roles r WHERE r.rolname IN ('e2e_staging', 'anon', 'authenticated');
--
-- 7.4 RLS en las 7 tablas. Esperado: false en todas (si alguna tiene RLS, e2e_staging la vería vacía).
--
--   SELECT relname, relrowsecurity FROM pg_class
--   WHERE relnamespace = 'public'::regnamespace
--     AND relname IN ('mesa', 'sesion_mesa', 'sesion_mesa_cliente', 'pedido', 'pedido_item', 'pago', 'cliente');

-- ── 8. Deshacer (solo si hace falta sacar todo) ──────────────────────────────────────────────────────────────────
--   BEGIN;
--   DROP SCHEMA e2e CASCADE;            -- las dos funciones
--   REVOKE ALL ON ALL TABLES IN SCHEMA public FROM e2e_staging;
--   REVOKE ALL ON SCHEMA public FROM e2e_staging;
--   DROP ROLE e2e_staging;
--   COMMIT;
