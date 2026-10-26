-- Reemplaza `e2e.e2e_limpiar` en una base donde la función ya está instalada, para sacarle la referencia a
-- `cliente.password_hash`, que la Fase 5 de auth borró (docs/auth/specs/auth.md). Sin esto la limpieza del E2E falla
-- con un error de base en cuanto la migración de la Fase 5 se aplica.
--
-- SOLO EN EL SQL EDITOR DEL SUPABASE DE STAGING. El archivo completo (e2e-staging.sql) no se puede volver a correr:
-- crea el rol `e2e_staging`, que ya existe. Esto reemplaza nada más que la función.
--
-- Lo único que cambia es la condición del DELETE sobre `cliente`: antes exigía que `password_hash` fuera null, y esa
-- columna ya no existe. `email IS NULL AND supabase_user_id IS NULL` sigue garantizando que solo se borren los
-- invitados que creó la corrida, nunca un cliente con cuenta.

CREATE OR REPLACE FUNCTION e2e.e2e_limpiar(p_marcador text)
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
    AND cl.email IS NULL AND cl.supabase_user_id IS NULL
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
