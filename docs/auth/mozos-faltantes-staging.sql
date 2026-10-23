-- Crea el `Mozo` que le falta a cada cuenta de salón de STAGING.
--
-- Por qué: `Membresia` da el permiso, pero quien atiende un llamado, edita un pedido o cobra sale del `Mozo` de esa
-- cuenta (`AccesoService.exigirMozo`). Una cuenta con membresía MOZO o JEFE_SALON pero sin fila en `mozo` recibe
-- 403 "Tu perfil de mozo no está activo en este restaurante". Normalmente lo crea la invitación
-- (`InvitacionesService.vincularMozo`), así que esto solo hace falta para las cuentas de prueba que se insertaron a
-- mano. Lo encontró la verificación de la Fase 4 en staging (2026-10-23); en la base local se hizo lo mismo en la 4.6.
--
-- Es idempotente: solo inserta lo que falta, así que se puede correr más de una vez sin duplicar nada.
-- Correr en el SQL Editor del Supabase de STAGING. Nunca en producción: son cuentas de prueba.

-- 1. Ver qué falta (solo lectura). Lo esperado antes de arreglar: las cuentas de salón sin `Mozo`.
SELECT u.email, m.rol, r.nombre AS restaurante
FROM membresia m
JOIN usuario u     ON u.id = m.usuario_id
JOIN restaurante r ON r.id = m.restaurante_id
WHERE m.rol IN ('MOZO', 'JEFE_SALON')
  AND NOT EXISTS (
    SELECT 1 FROM mozo z
    WHERE z.usuario_id = u.id AND z.restaurante_id = m.restaurante_id
  )
ORDER BY u.email;

-- 2. Crearlos. El nombre sale del `Usuario`, y `es_jefe_salon` del rol de la membresía.
INSERT INTO mozo (id, restaurante_id, nombre, email, activo, es_jefe_salon, usuario_id)
SELECT gen_random_uuid()::text,
       m.restaurante_id,
       COALESCE(u.nombre, split_part(u.email, '@', 1)),
       u.email,
       true,
       m.rol = 'JEFE_SALON',
       u.id
FROM membresia m
JOIN usuario u ON u.id = m.usuario_id
WHERE m.rol IN ('MOZO', 'JEFE_SALON')
  AND NOT EXISTS (
    SELECT 1 FROM mozo z
    WHERE z.usuario_id = u.id AND z.restaurante_id = m.restaurante_id
  );

-- 3. Comprobar: la consulta 1 tiene que devolver cero filas, y acá se ven los `Mozo` que quedaron.
SELECT z.nombre, z.email, z.es_jefe_salon, z.activo, r.nombre AS restaurante
FROM mozo z
JOIN restaurante r ON r.id = z.restaurante_id
WHERE z.usuario_id IS NOT NULL
ORDER BY r.nombre, z.nombre;
